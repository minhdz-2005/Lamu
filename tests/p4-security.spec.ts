import request from "supertest";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import { createGatewayApp } from "../gateway/src/app";
import { validateConfig } from "../shared/libraries/runtime/src";
import { config, contract, registration } from "./helpers";
describe("P4 Gateway failure/security boundaries", () => {
  it("returns unavailable and finite timeout errors with normalized envelope", async () => {
    const upstream = createServer((_req, res) =>
      setTimeout(() => {
        res.setHeader("content-type", "application/json");
        res.end("{}");
      }, 100),
    );
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    for (const [url, status, code] of [
      ["http://127.0.0.1:1", 502, "UPSTREAM_UNAVAILABLE"],
      [
        "http://127.0.0.1:" + (upstream.address() as { port: number }).port,
        504,
        "UPSTREAM_TIMEOUT",
      ],
    ] as const) {
      const app = await createGatewayApp({
        ...config(),
        identityUrl: url,
        timeoutMs: 20,
      });
      await app.init();
      try {
        const res = await request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: "x@y.test", password: "Password123!" });
        expect(res.status).toBe(status);
        expect(res.body.error.code).toBe(code);
        contract("Error", res.body);
      } finally {
        await app.close();
      }
    }
    await new Promise<void>((r) => upstream.close(() => r()));
  });
  it("Gateway readiness becomes 503 if Identity is unavailable, while process stays live", async () => {
    const app = await createGatewayApp({
      ...config(),
      identityUrl: "http://127.0.0.1:1",
    });
    await app.init();
    try {
      await request(app.getHttpServer()).get("/healthz").expect(200);
      const res = await request(app.getHttpServer()).get("/readyz");
      expect(res.status).toBe(503);
      contract("Error", res.body);
    } finally {
      await app.close();
    }
  });
  it("limits expensive auth separately and uses request ID on rate-limit errors", async () => {
    const app = await createGatewayApp({
      ...config(),
      identityUrl: "http://127.0.0.1:1",
      rateLimit: 100,
      ...{ authRateLimit: 1 },
    });
    await app.init();
    try {
      await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({})
        .expect(502);
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({});
      expect(res.status).toBe(429);
      contract("Error", res.body);
    } finally {
      await app.close();
    }
  });
  it("rejects malformed JSON safely and regenerates invalid correlation IDs", async () => {
    const app = await createGatewayApp({
      ...config(),
      identityUrl: "http://127.0.0.1:1",
    });
    await app.init();
    try {
      const res = await request(app.getHttpServer())
        .post("/api/auth/register")
        .set("X-Request-Id", "not-a-valid-uuid")
        .set("content-type", "application/json")
        .send("{bad");
      expect(res.status).toBe(400);
      contract("Error", res.body);
    } finally {
      await app.close();
    }
  });
  it("forwards only verified protected context and bearer token, never client identity headers", async () => {
    let seen: Record<string, unknown> = {};
    const upstream = createServer((req, res) => {
      seen = req.headers;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: seen["x-user-id"],
          email: "stub@example.test",
          display_name: "Stub",
          memberships: [],
        }),
      );
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const app = await createGatewayApp({
      ...config(),
      identityUrl:
        "http://127.0.0.1:" + (upstream.address() as { port: number }).port,
    });
    await app.init();
    const c = config(),
      sub = randomUUID(),
      sid = randomUUID(),
      iat = Math.floor(Date.now() / 1000),
      token = sign(
        { sub, sid, jti: randomUUID(), iat, exp: iat + 900 },
        c.secret,
        { algorithm: "HS256", issuer: c.issuer, audience: c.audience },
      );
    try {
      await request(app.getHttpServer())
        .get("/api/users/me")
        .set("Authorization", "Bearer " + token)
        .set("x-user-id", randomUUID() + "," + randomUUID())
        .set("x-session-id", randomUUID())
        .set("x-role", "OWNER")
        .expect(200);
      expect(seen["x-user-id"]).toBe(sub);
      expect(seen["x-session-id"]).toBe(sid);
      expect(seen["x-role"]).toBeUndefined();
      expect(seen.authorization).toBe("Bearer " + token);
    } finally {
      await app.close();
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
});
