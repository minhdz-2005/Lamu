import "reflect-metadata";
import request from "supertest";
import { validateConfig } from "../shared/libraries/runtime/src";
import { createIdentityApp } from "../services/identity-service/src/app";
import { createGatewayApp } from "../gateway/src/app";

const base = {
  JWT_SECRET: "test-only-".repeat(8),
  JWT_ISSUER: "lamu-test",
  JWT_AUDIENCE: "test-client",
  DATABASE_URL: "postgresql://unused:unused@localhost:1/unused",
  IDENTITY_URL: "http://localhost:1",
};
describe("P1 config and process health", () => {
  it("fails configuration on weak/missing secret and invalid numeric/URL settings", () => {
    for (const env of [
      { ...base, JWT_SECRET: "" },
      { ...base, JWT_SECRET: "local_dev_only_change_me" },
      { ...base, PORT: "abc" },
      { ...base, UPSTREAM_TIMEOUT_MS: "0" },
      { ...base, JWT_ISSUER: "" },
      { ...base, DATABASE_URL: "http://localhost/db" },
      { ...base, IDENTITY_URL: "file:///tmp" },
    ]) {
      expect(() => validateConfig(env, "identity")).toThrow();
    }
  });
  it("has live process but returns readiness 503 on DB failure without leaking configuration", async () => {
    const db = {
      $queryRawUnsafe: jest
        .fn()
        .mockRejectedValue(new Error("private db error")),
      $disconnect: jest.fn(),
    };
    const app = await createIdentityApp(
      validateConfig(base, "identity"),
      db as never,
    );
    await app.init();
    try {
      expect((await request(app.getHttpServer()).get("/healthz")).body).toEqual(
        { status: "OK" },
      );
      const res = await request(app.getHttpServer()).get("/readyz");
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(JSON.stringify(res.body)).not.toMatch(
        /private|postgres|test-only/,
      );
      expect(res.headers["x-request-id"]).toBe(res.body.error.request_id);
    } finally {
      await app.close();
    }
  });
  it("does not proxy internal routes; assigns UUID request IDs and security headers", async () => {
    const app = await createGatewayApp(validateConfig(base, "gateway"));
    await app.init();
    try {
      const res = await request(app.getHttpServer()).get("/api/internal/users");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect((await request(app.getHttpServer()).get("/healthz")).status).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });
});
