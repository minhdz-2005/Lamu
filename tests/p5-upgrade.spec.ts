import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import request from "supertest";
import { createIdentityApp } from "../services/identity-service/src/app";
import { createDatabase } from "../services/identity-service/src/database";
import { config } from "./helpers";

describe("P5 additive migration on an existing M1 database", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = "p5_upgrade_" + randomUUID().replaceAll("-", "");
  let db: Pool;
  beforeAll(async () => {
    if (!/^p5_upgrade_[a-f0-9]{32}$/.test(name))
      throw Error("Unsafe test database name");
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/" + name;
    db = new Pool({ connectionString: url.toString() });
  });
  afterAll(async () => {
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  });
  it("creates an organization on a migrated empty DB without requiring local demo seed", async () => {
    const cleanName = name + "_clean";
    await admin.query(`CREATE DATABASE "${cleanName}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/" + cleanName;
    const pool = new Pool({ connectionString: url.toString() });
    const client = createDatabase(url.toString());
    let app: Awaited<ReturnType<typeof createIdentityApp>> | undefined;
    try {
      const root = "services/identity-service/prisma/migrations";
      for (const dir of fs
        .readdirSync(root)
        .filter((n) => /^\d/.test(n))
        .sort())
        await pool.query(
          fs.readFileSync(`${root}/${dir}/migration.sql`, "utf8"),
        );
      app = await createIdentityApp(
        { ...config(), databaseUrl: url.toString() },
        client,
      );
      await app.init();
      const registered = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "clean@example.test",
          password: "SyntheticPassword!2026",
          display_name: "Clean",
        })
        .expect(200);
      const created = await request(app.getHttpServer())
        .post("/organizations")
        .set("X-User-Id", registered.body.user_id)
        .set("X-Session-Id", randomUUID())
        .set("Idempotency-Key", randomUUID())
        .send({ name: "Clean", slug: "clean" })
        .expect(201);
      const checked = await request(app.getHttpServer())
        .post("/internal/authorization/check")
        .send({
          user_id: registered.body.user_id,
          organization_id: created.body.organization_id,
          resource_type: "ORG",
          resource_id: created.body.organization_id,
          permission: "org.member.manage",
        })
        .expect(200);
      expect(checked.body.allowed).toBe(true);
      expect(
        (await pool.query("SELECT count(*) FROM users")).rows[0].count,
      ).toBe("1");
      expect(
        (await pool.query("SELECT count(*) FROM organizations")).rows[0].count,
      ).toBe("1");
    } finally {
      await app?.close();
      await client.$disconnect();
      await pool.end();
      await admin.query(`DROP DATABASE "${cleanName}" WITH (FORCE)`);
    }
  });
  it("preserves IDs/hashes/sessions/org/roles/pending M1 backlog and adds constraints without reset", async () => {
    await db.query(
      fs.readFileSync(
        "services/identity-service/prisma/migrations/202611130001_m1/migration.sql",
        "utf8",
      ),
    );
    const u = randomUUID(),
      org = randomUUID(),
      m = randomUUID(),
      role = randomUUID(),
      event = randomUUID(),
      session = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,display_name,password_hash,updated_at) VALUES($1,'upgrade@example.test','Upgrade','synthetic-hash',now())",
      [u],
    );
    await db.query(
      "INSERT INTO organizations(id,name,slug,created_by) VALUES($1,'Upgrade','upgrade',$2)",
      [org, u],
    );
    await db.query(
      "INSERT INTO memberships(id,organization_id,user_id) VALUES($1,$2,$3)",
      [m, org, u],
    );
    await db.query(
      "INSERT INTO roles(id,code,name,scope) VALUES($1,'OWNER','Owner','ORG')",
      [role],
    );
    await db.query(
      "INSERT INTO membership_roles(id,membership_id,role_id,resource_type) VALUES($1,$2,$3,'ORG')",
      [randomUUID(), m, role],
    );
    await db.query(
      "INSERT INTO refresh_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,'synthetic-session-hash',now()+interval '7 days')",
      [session, u],
    );
    const payload = {
      user_id: u,
      email: "upgrade@example.test",
      display_name: "Upgrade",
    };
    await db.query(
      "INSERT INTO outbox_events(event_id,event_type,version,occurred_at,aggregate_type,aggregate_id,producer,payload) VALUES($1,'UserRegistered',1,now(),'user',$2,'identity-service',$3)",
      [event, u, JSON.stringify(payload)],
    );
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of [
        "users",
        "refresh_sessions",
        "organizations",
        "membership_roles",
        "outbox_events",
      ])
        result[table] = (
          await db.query(`SELECT * FROM ${table} ORDER BY 1`)
        ).rows;
      result.memberships = (
        await db.query(
          "SELECT id,organization_id,user_id,status,joined_at FROM memberships ORDER BY id",
        )
      ).rows;
      return result;
    };
    const before = await snapshot();
    await db.query(
      fs.readFileSync(
        "services/identity-service/prisma/migrations/202611140001_p5/migration.sql",
        "utf8",
      ),
    );
    expect(await snapshot()).toEqual(before);
    const reference = fs.readFileSync(
      "services/identity-service/prisma/migrations/202611140002_rbac_reference/migration.sql",
      "utf8",
    );
    await db.query(reference);
    await db.query(reference); // Reference provisioning itself is repeat-safe.
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await db.query(
          "SELECT id FROM roles WHERE code='OWNER' AND organization_id IS NULL",
        )
      ).rows[0].id,
    ).toBe(role);
    expect(
      (
        await db.query(
          "SELECT membership_revision FROM memberships WHERE id=$1",
          [m],
        )
      ).rows[0].membership_revision,
    ).toBe("1");
    expect(
      (await db.query("SELECT count(*) FROM outbox_events")).rows[0].count,
    ).toBe("1");
    await expect(
      db.query("UPDATE memberships SET membership_revision=0 WHERE id=$1", [m]),
    ).rejects.toHaveProperty("code", "23514");
    await expect(
      db.query(
        "UPDATE memberships SET membership_revision=9007199254740992 WHERE id=$1",
        [m],
      ),
    ).rejects.toHaveProperty("code", "23514");
    const data = [
      randomUUID(),
      u,
      "CREATE_ORGANIZATION",
      "upgrade-key",
      "a".repeat(64),
      org,
      JSON.stringify({ organization_id: org }),
    ];
    const insert =
      "INSERT INTO idempotency_records(id,actor_user_id,operation,idempotency_key,request_hash,target_organization_id,response_status,response_body,completed_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,201,$7,now(),now()+interval '24 hours')";
    await db.query(insert, data);
    await expect(
      db.query(insert, [randomUUID(), ...data.slice(1)]),
    ).rejects.toHaveProperty("code", "23505");
    await expect(
      db.query("UPDATE idempotency_records SET actor_user_id=$1", [
        randomUUID(),
      ]),
    ).rejects.toHaveProperty("code", "23503");
    await expect(
      db.query(
        "UPDATE idempotency_records SET expires_at=completed_at+interval '1 hour'",
      ),
    ).rejects.toHaveProperty("code", "23514");
    expect(await snapshot()).toEqual(before);
  });
});
