import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
describe("P1 local seed", () => {
  it("has exactly four system roles, ten permissions, two demo organizations and no events", async () => {
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM roles WHERE organization_id IS NULL",
          )
        ).rows[0].count,
      ),
    ).toBe(4);
    expect(
      Number(
        (await pool.query("SELECT count(*) FROM permissions")).rows[0].count,
      ),
    ).toBe(10);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM organizations WHERE id IN ('00000004-0000-4000-8000-000000000001','00000004-0000-4000-8000-000000000002') AND slug IN ('demo-a','demo-b')",
          )
        ).rows[0].count,
      ),
    ).toBe(2);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM outbox_events o JOIN users u ON u.id=o.aggregate_id WHERE u.email::text LIKE '%@demo.lamu.test'",
          )
        ).rows[0].count,
      ),
    ).toBe(0);
    // Test the seed's own rows; later suites may legitimately create tenants
    // and synthetic non-login users in this shared disposable test database.
    const rows = (
      await pool.query(
        "SELECT password_hash FROM users WHERE email::text LIKE '%@demo.lamu.test'",
      )
    ).rows;
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.every((r) => r.password_hash.startsWith("$argon2id$"))).toBe(
      true,
    );
    const admin = (
      await pool.query(
        "SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='ADMIN'",
      )
    ).rows.map((r) => r.code);
    expect(admin).toHaveLength(9);
    expect(admin).not.toContain("org.member.manage");
    const speaker = (
      await pool.query(
        "SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='SPEAKER'",
      )
    ).rows.map((r) => r.code);
    expect(speaker).toEqual(["event.read"]);
  });
});
