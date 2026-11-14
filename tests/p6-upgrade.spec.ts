import { Pool } from "pg";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
describe("P6 additive upgrade preserves M1/P5 evidence and state", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = "p6_upgrade_" + randomUUID().replaceAll("-", "");
  let db: Pool;
  beforeAll(async () => {
    if (!/^p6_upgrade_[a-f0-9]{32}$/.test(name))
      throw Error("Unsafe synthetic database name");
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/" + name;
    db = new Pool({ connectionString: url.toString() });
  });
  afterAll(async () => {
    await db?.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  });
  it("keeps users/sessions/org/roles/idempotency/revision/backlog byte-equivalent apart from nullable invitation metadata", async () => {
    const root = "services/identity-service/prisma/migrations";
    for (const dir of [
      "202611130001_m1",
      "202611140001_p5",
      "202611140002_rbac_reference",
    ])
      await db.query(fs.readFileSync(`${root}/${dir}/migration.sql`, "utf8"));
    const u = randomUUID(),
      org = randomUUID(),
      m = randomUUID(),
      session = randomUUID(),
      event = randomUUID(),
      key = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,display_name,password_hash,updated_at) VALUES($1,'p6-upgrade@synthetic.test','Upgrade','synthetic-hash',now())",
      [u],
    );
    await db.query(
      "INSERT INTO organizations(id,name,slug,created_by) VALUES($1,'Upgrade','p6-upgrade',$2)",
      [org, u],
    );
    await db.query(
      "INSERT INTO memberships(id,organization_id,user_id,membership_revision) VALUES($1,$2,$3,7)",
      [m, org, u],
    );
    await db.query(
      "INSERT INTO membership_roles(id,membership_id,role_id,resource_type) SELECT $1,$2,id,'ORG' FROM roles WHERE code='OWNER' AND organization_id IS NULL",
      [randomUUID(), m],
    );
    await db.query(
      "INSERT INTO refresh_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,'synthetic-p6-session',now()+interval '7 days')",
      [session, u],
    );
    await db.query(
      "INSERT INTO outbox_events(event_id,event_type,version,occurred_at,aggregate_type,aggregate_id,producer,payload) VALUES($1,'MembershipChanged',1,now(),'membership',$2,'identity-service',$3)",
      [
        event,
        m,
        JSON.stringify({
          membership_id: m,
          organization_id: org,
          user_id: u,
          status: "ACTIVE",
          membership_revision: 7,
          change_type: "ROLES_REPLACED",
          roles: [],
        }),
      ],
    );
    await db.query(
      "INSERT INTO idempotency_records(id,actor_user_id,operation,idempotency_key,request_hash,target_organization_id,target_user_id,response_status,response_body,completed_at,expires_at) VALUES($1,$2,'REPLACE_MEMBER_ROLES',$3,$4,$5,$2,200,'{\"status\":\"OK\"}',now(),now()+interval '24 hours')",
      [randomUUID(), u, key, "a".repeat(64), org],
    );
    const tables = [
      "users",
      "refresh_sessions",
      "organizations",
      "memberships",
      "membership_roles",
      "roles",
      "permissions",
      "role_permissions",
      "outbox_events",
      "idempotency_records",
    ];
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          tables.map(async (t) => [
            t,
            (
              await db.query(
                `SELECT to_jsonb(t) - 'target_invitation_id' AS data FROM ${t} t ORDER BY to_jsonb(t)::text`,
              )
            ).rows.map((r) => r.data),
          ]),
        ),
      );
    const before = await snapshot();
    await db.query(
      fs.readFileSync(
        `${root}/202611140003_p6_invitations/migration.sql`,
        "utf8",
      ),
    );
    expect(await snapshot()).toEqual(before);
    expect(
      (await db.query("SELECT count(*) FROM organization_invitations")).rows[0]
        .count,
    ).toBe("0");
    expect(
      (await db.query("SELECT target_invitation_id FROM idempotency_records"))
        .rows[0].target_invitation_id,
    ).toBeNull();
    expect(
      (
        await db.query(
          "SELECT membership_revision FROM memberships WHERE id=$1",
          [m],
        )
      ).rows[0].membership_revision,
    ).toBe("7");
    expect(
      (
        await db.query("SELECT revoked_at FROM refresh_sessions WHERE id=$1", [
          session,
        ])
      ).rows[0].revoked_at,
    ).toBeNull();
  });
});
