import { Pool } from "pg";
import { randomUUID } from "node:crypto";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
describe("P1 SQL FK/scope/null uniqueness on real PostgreSQL", () => {
  it("rejects orphan and invalid assignments while allowing two distinct EVENT fixtures", async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const [membership, role] = (
        await Promise.all([
          c.query("SELECT id FROM memberships ORDER BY id LIMIT 1"),
          c.query("SELECT id FROM roles WHERE code='SPEAKER'"),
        ])
      ).map((r) => r.rows[0].id);
      await c.query("SAVEPOINT valid");
      for (const [type, resource] of [
        ["ORG", randomUUID()],
        ["EVENT", null],
        ["UNKNOWN", null],
      ]) {
        await expect(
          c.query(
            "INSERT INTO membership_roles(id,membership_id,role_id,resource_type,resource_id) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), membership, role, type, resource],
          ),
        ).rejects.toHaveProperty("code", "23514");
        await c.query("ROLLBACK TO SAVEPOINT valid");
      }
      await expect(
        c.query(
          "INSERT INTO membership_roles(id,membership_id,role_id,resource_type,resource_id) VALUES($1,$2,$3,$4,NULL)",
          [randomUUID(), randomUUID(), role, "ORG"],
        ),
      ).rejects.toHaveProperty("code", "23503");
      await c.query("ROLLBACK TO SAVEPOINT valid");
      await c.query(
        "INSERT INTO membership_roles(id,membership_id,role_id,resource_type,resource_id) VALUES($1,$2,$3,$4,NULL)",
        [randomUUID(), membership, role, "ORG"],
      );
      await c.query("SAVEPOINT one");
      await expect(
        c.query(
          "INSERT INTO membership_roles(id,membership_id,role_id,resource_type,resource_id) VALUES($1,$2,$3,$4,NULL)",
          [randomUUID(), membership, role, "ORG"],
        ),
      ).rejects.toHaveProperty("code", "23505");
      await c.query("ROLLBACK TO SAVEPOINT one");
      for (let i = 0; i < 2; i++)
        await c.query(
          "INSERT INTO membership_roles(id,membership_id,role_id,resource_type,resource_id) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), membership, role, "EVENT", randomUUID()],
        );
      // Cross-table role/scope policy remains a service-level M2 invariant.
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
});
