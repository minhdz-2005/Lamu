import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
describe("P1 PostgreSQL migration guarantees", () => {
  it("creates nine domain tables and case-insensitive email uniqueness", async () => {
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    for (const name of [
      "users",
      "organizations",
      "memberships",
      "roles",
      "permissions",
      "role_permissions",
      "membership_roles",
      "refresh_sessions",
      "outbox_events",
    ])
      expect(tables.rows.map((r) => r.tablename)).toContain(name);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO users(id,email,display_name,password_hash,status,updated_at) VALUES(gen_random_uuid(),'DbCase@example.test','DB','hash','ACTIVE',now())",
      );
      await expect(
        client.query(
          "INSERT INTO users(id,email,display_name,password_hash,status,updated_at) VALUES(gen_random_uuid(),'dbcase@EXAMPLE.test','DB','hash','ACTIVE',now())",
        ),
      ).rejects.toHaveProperty("code", "23505");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("rejects duplicate system roles including NULL tenant and invalid assignments/session expiry", async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const u = (
        await c.query(
          "INSERT INTO users(id,email,display_name,password_hash,updated_at) VALUES(gen_random_uuid(),'expiry@example.test','Expiry','hash',now()) RETURNING id",
        )
      ).rows[0].id;
      await c.query("SAVEPOINT s");
      await expect(
        c.query(
          "INSERT INTO refresh_sessions(id,user_id,token_hash,created_at,expires_at) VALUES(gen_random_uuid(),$1,$2,now(),now()-interval '1 day')",
          [u, "bad-expiry"],
        ),
      ).rejects.toHaveProperty("code", "23514");
      await c.query("ROLLBACK TO SAVEPOINT s");
      await c.query(
        "INSERT INTO roles(id,code,name,scope) VALUES(gen_random_uuid(),'DUP_TEST','Test','ORG')",
      );
      await expect(
        c.query(
          "INSERT INTO roles(id,code,name,scope) VALUES(gen_random_uuid(),'DUP_TEST','Test','ORG')",
        ),
      ).rejects.toHaveProperty("code", "23505");
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
});
