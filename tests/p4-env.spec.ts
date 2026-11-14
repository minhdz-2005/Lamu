import { validateConfig } from "../shared/libraries/runtime/src";
import { seed } from "../services/identity-service/prisma/seed";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
describe("P4 startup and seed safety", () => {
  it("exits nonzero before listening for invalid Identity/Gateway config", () => {
    for (const main of [
      "services/identity-service/dist/main.js",
      "gateway/dist/main.js",
    ]) {
      const result = spawnSync(process.execPath, [resolve(main)], {
        env: { ...process.env, JWT_SECRET: "" },
        encoding: "utf8",
        timeout: 10000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/startup failed/);
      expect(result.stderr).not.toMatch(/postgresql:\/\/|stack|password_hash/);
    }
  });
  it("rejects incomplete PostgreSQL URL at config validation, before app startup", () => {
    const base = {
      JWT_SECRET: "x".repeat(64),
      JWT_ISSUER: "test",
      JWT_AUDIENCE: "test",
    };
    for (const DATABASE_URL of [
      "postgresql://",
      "postgresql://localhost",
      "postgresql://localhost/db#fragment",
    ])
      expect(() =>
        validateConfig({ ...base, DATABASE_URL }, "identity"),
      ).toThrow();
  });
  it("refuses seed outside explicitly local environment without opening database", async () => {
    const before = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    try {
      await expect(seed()).rejects.toThrow("APP_ENV=local");
    } finally {
      if (before === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = before;
    }
  });
});
