import fs from "node:fs";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
describe("Recovery/media fresh install and upgrade preserve existing data", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  afterAll(() => admin.end());
  it("applies forward migrations to old users, sessions, membership and permission IDs", async () => {
    const name = "security_upgrade_" + randomUUID().replaceAll("-", "");
    if (!/^security_upgrade_[a-f0-9]{32}$/.test(name))
      throw new Error("Unsafe DB name");
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/" + name;
    const db = new Pool({ connectionString: url.toString() });
    const root = "services/identity-service/prisma/migrations",
      dirs = fs
        .readdirSync(root)
        .filter((n) => /^\d/.test(n))
        .sort();
    try {
      for (const dir of dirs.filter((n) => n < "20261115"))
        await db.query(fs.readFileSync(`${root}/${dir}/migration.sql`, "utf8"));
      const user = randomUUID(),
        session = randomUUID(),
        org = randomUUID(),
        member = randomUUID();
      await db.query(
        "INSERT INTO users(id,email,display_name,password_hash,updated_at) VALUES($1,'upgrade@security.test','Legacy','legacy-hash',now())",
        [user],
      );
      await db.query(
        "INSERT INTO refresh_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,'legacy-token',now()+interval '1 day')",
        [session, user],
      );
      await db.query(
        "INSERT INTO organizations(id,name,slug,created_by) VALUES($1,'Legacy','legacy',$2)",
        [org, user],
      );
      await db.query(
        "INSERT INTO memberships(id,organization_id,user_id) VALUES($1,$2,$3)",
        [member, org, user],
      );
      const before = (await db.query("SELECT * FROM users WHERE id=$1", [user]))
        .rows[0];
      const permissions = (
        await db.query("SELECT id,code FROM permissions ORDER BY code")
      ).rows;
      for (const dir of dirs.filter((n) => n >= "20261115"))
        await db.query(fs.readFileSync(`${root}/${dir}/migration.sql`, "utf8"));
      const after = (await db.query("SELECT * FROM users WHERE id=$1", [user]))
        .rows[0];
      expect(after).toMatchObject({
        ...before,
        avatar_asset_id: null,
        avatar_revision: "0",
      });
      expect(
        (
          await db.query("SELECT * FROM refresh_sessions WHERE id=$1", [
            session,
          ])
        ).rows[0],
      ).toMatchObject({ token_hash: "legacy-token", revoked_at: null });
      expect(
        (
          await db.query(
            "SELECT cover_asset_id,cover_revision FROM organizations WHERE id=$1",
            [org],
          )
        ).rows[0],
      ).toEqual({ cover_asset_id: null, cover_revision: "0" });
      expect(
        (
          await db.query(
            "SELECT id,code FROM permissions WHERE code<>'org.profile.update' ORDER BY code",
          )
        ).rows,
      ).toEqual(permissions);
      const grants = (
        await db.query(
          "SELECT r.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='org.profile.update' ORDER BY r.code",
        )
      ).rows.map((r) => r.code);
      expect(grants).toEqual(["ADMIN", "OWNER"]);
      await expect(
        db.query(
          "INSERT INTO media_upload_intents(id,actor_id,purpose,expected_public_id,expected_revision,expires_at,watch_until) VALUES($1,$2,'AVATAR','invalid',0,now()+interval '10 minutes',now()+interval '3 hours')",
          [randomUUID(), user],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (await db.query("SELECT id FROM memberships WHERE id=$1", [member]))
          .rowCount,
      ).toBe(1);
    } finally {
      await db.end();
      await admin.query(`DROP DATABASE "${name}"`);
    }
  });
});
