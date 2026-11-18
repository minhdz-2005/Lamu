import { Pool } from "pg";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

describe("M3 upgrades populated M2 without rewriting business state or backlog", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = "m3_upgrade_" + randomUUID().replaceAll("-", "");
  let db: Pool;
  beforeAll(async () => {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/" + name;
    db = new Pool({ connectionString: url.toString() });
  });
  afterAll(async () => {
    await db?.end();
    for (let n = 0; n < 100; n++) {
      if (
        Number(
          (
            await admin.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=$1",
              [name],
            )
          ).rows[0].count,
        ) === 0
      )
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  it("preserves users/session/hash/org/member/revision/roles/invitation/idempotency and both legacy outbox states", async () => {
    const root = "services/identity-service/prisma/migrations";
    for (const dir of fs
      .readdirSync(root)
      .filter((x) => /^\d/.test(x) && !x.includes("m3_outbox"))
      .sort())
      await db.query(fs.readFileSync(`${root}/${dir}/migration.sql`, "utf8"));
    const user = randomUUID(),
      invitee = randomUUID(),
      org = randomUUID(),
      member = randomUUID(),
      invitation = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,display_name,password_hash,updated_at) VALUES($1,'m3-owner@synthetic.test','Owner','synthetic-hash',now()),($2,'m3-recipient@synthetic.test','Recipient','synthetic-hash2',now())",
      [user, invitee],
    );
    await db.query(
      "INSERT INTO organizations(id,name,slug,created_by) VALUES($1,'M3 Upgrade','m3-upgrade',$2)",
      [org, user],
    );
    await db.query(
      "INSERT INTO memberships(id,organization_id,user_id,membership_revision) VALUES($1,$2,$3,7)",
      [member, org, user],
    );
    await db.query(
      "INSERT INTO membership_roles(id,membership_id,role_id,resource_type) SELECT $1,$2,id,'ORG' FROM roles WHERE code='OWNER' AND organization_id IS NULL",
      [randomUUID(), member],
    );
    await db.query(
      "INSERT INTO refresh_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,'synthetic-m3-session',now()+interval '7 days')",
      [randomUUID(), user],
    );
    await db.query(
      "INSERT INTO organization_invitations(id,organization_id,inviter_user_id,invitee_user_id,roles,status,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'PENDING',now(),now()+interval '7 days')",
      [
        invitation,
        org,
        user,
        invitee,
        JSON.stringify([
          { code: "ADMIN", resource_type: "ORG", resource_id: org },
        ]),
      ],
    );
    await db.query(
      "INSERT INTO idempotency_records(id,actor_user_id,operation,idempotency_key,request_hash,target_organization_id,target_invitation_id,response_status,response_body,completed_at,expires_at) VALUES($1,$2,'CREATE_INVITATION',$3,$4,$5,$6,201,'{}',now(),now()+interval '24 hours')",
      [randomUUID(), user, randomUUID(), "a".repeat(64), org, invitation],
    );
    for (const status of ["PENDING", "SENT"])
      await db.query(
        "INSERT INTO outbox_events(event_id,event_type,version,occurred_at,aggregate_type,aggregate_id,producer,payload,status) VALUES($1,'MembershipChanged',1,'2026-11-13T01:02:03.654321Z','membership',$2,'identity-service',$3,$4)",
        [
          randomUUID(),
          member,
          JSON.stringify({
            membership_id: member,
            membership_revision: 7,
            historical: "unchanged",
          }),
          status,
        ],
      );
    const tables = [
      "users",
      "refresh_sessions",
      "organizations",
      "memberships",
      "roles",
      "permissions",
      "role_permissions",
      "membership_roles",
      "organization_invitations",
      "idempotency_records",
      "outbox_events",
    ];
    const added = [
      "attempt_count",
      "next_attempt_at",
      "claim_token",
      "lease_until",
      "last_attempt_at",
      "sent_at",
      "last_error_code",
      "parked_at",
    ];
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [
            table,
            (
              await db.query(
                `SELECT to_jsonb(t)-$1::text[] AS data FROM ${table} t ORDER BY (to_jsonb(t)-$1::text[])::text`,
                [added],
              )
            ).rows.map((r) => r.data),
          ]),
        ),
      );
    const before = await snapshot();
    await db.query(
      fs.readFileSync(`${root}/202611140004_m3_outbox/migration.sql`, "utf8"),
    );
    expect(await snapshot()).toEqual(before);
    expect(
      (await db.query("SELECT sent_at FROM outbox_events WHERE status='SENT'"))
        .rows[0].sent_at,
    ).toBeNull();
    expect(
      (
        await db.query(
          "SELECT count(*) FROM organization_invitations WHERE status='PENDING'",
        )
      ).rows[0].count,
    ).toBe("1");
    const id = (
      await db.query(
        "SELECT event_id FROM outbox_events WHERE status='PENDING'",
      )
    ).rows[0].event_id;
    await expect(
      db.query(
        "UPDATE outbox_events SET status='PROCESSING' WHERE event_id=$1",
        [id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query("UPDATE outbox_events SET sent_at=now() WHERE event_id=$1", [
        id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
