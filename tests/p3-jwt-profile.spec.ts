import request from "supertest";
import { randomUUID } from "node:crypto";
import { sign, decode } from "jsonwebtoken";
import { request as rawRequest } from "node:http";
import { createServer } from "node:http";
import { pair, registration, config, contract } from "./helpers";
import { createGatewayApp } from "../gateway/src/app";
describe("P3 JWT/context/profile", () => {
  let p: Awaited<ReturnType<typeof pair>>,
    user: string,
    token: string,
    claims: Record<string, unknown>;
  beforeAll(async () => {
    p = await pair();
    await p.gateway.listen(0, "127.0.0.1");
    const input = registration();
    user = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/register")
        .send(input)
    ).body.user_id;
    token = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/login")
        .send({ email: input.email, password: input.password })
    ).body.access_token;
    claims = decode(token) as Record<string, unknown>;
  });
  afterAll(() => p.close());
  it("returns exactly own public profile even with spoofed user/session headers", async () => {
    const res = await request(p.gateway.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", "Bearer " + token)
      .set("X-User-Id", randomUUID())
      .set("X-Session-Id", randomUUID());
    expect(res.status).toBe(200);
    contract("Profile", res.body);
    expect(res.body.id).toBe(user);
    expect(res.body.memberships).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/password|session|token_hash/);
  });
  it("rejects missing/invalid/expired/wrong-issuer/audience/algorithm/signature/claims tokens", async () => {
    const c = config(),
      now = Math.floor(Date.now() / 1000);
    const signed = (
      changes: Record<string, unknown>,
      secret = c.secret,
      algorithm: "HS256" | "HS384" = "HS256",
    ) =>
      sign(
        Object.fromEntries(
          Object.entries({ ...claims, ...changes }).filter(
            ([, v]) => v !== undefined,
          ),
        ),
        secret,
        { algorithm },
      );
    const tokens = [
      "",
      "garbage",
      token.slice(0, -8) + "AAAAAAAA",
      signed({ iss: "other" }),
      signed({ aud: "other" }),
      signed({ exp: now - 1 }),
      signed({}, "other-secret".repeat(4)),
      signed({}, c.secret, "HS384"),
      signed({ sub: 12 }),
      signed({ sid: "bad" }),
      signed({ jti: undefined }),
      signed({ exp: undefined }),
      signed({ iat: now + 3600, exp: now + 4500 }),
      signed({ exp: now + 9000 }),
      signed({ aud: [c.audience, "other"] }),
    ];
    for (const candidate of tokens) {
      const req = request(p.gateway.getHttpServer()).get("/api/users/me");
      if (candidate) req.set("Authorization", "Bearer " + candidate);
      const res = await req;
      expect(res.status).toBe(401);
      contract("Error", res.body);
    }
  });
  it("rejects duplicate Authorization even when Node normalized headers choose one value", async () => {
    const url = new URL("/api/users/me", await p.gateway.getUrl());
    const status = await new Promise<number>((resolve, reject) => {
      const req = rawRequest(
        url,
        { headers: { Authorization: ["Bearer " + token, "Bearer " + token] } },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(401);
  });
  it("reads current LOCKED status and does not accept absent Identity context", async () => {
    await request(p.identity.getHttpServer()).get("/users/me").expect(401);
    await p.db.user.update({ where: { id: user }, data: { status: "LOCKED" } });
    try {
      await request(p.gateway.getHttpServer())
        .get("/api/users/me")
        .set("Authorization", "Bearer " + token)
        .expect(403);
    } finally {
      await p.db.user.update({
        where: { id: user },
        data: { status: "ACTIVE" },
      });
    }
  });
  it("serves canonical Swagger without internal/public health proxy routes", async () => {
    const res = await request(p.gateway.getHttpServer()).get("/docs-json");
    expect(res.status).toBe(200);
    expect(res.body.paths["/api/users/me"]).toBeDefined();
    expect(
      Object.keys(res.body.paths).some((p) => p.includes("internal")),
    ).toBe(false);
    await request(p.gateway.getHttpServer())
      .get("/api/internal/authorization/check")
      .set("Authorization", "Bearer " + token)
      .expect(404);
    await request(p.gateway.getHttpServer()).get("/api/healthz").expect(404);
  });
  it("strips all untrusted context on public routes and normalizes correlation ID", async () => {
    let received: Record<string, unknown> = {};
    const upstream = createServer((req, res) => {
      received = req.headers;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ user_id: randomUUID() }));
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const app = await createGatewayApp({
      ...config(),
      identityUrl:
        "http://127.0.0.1:" + (upstream.address() as { port: number }).port,
    });
    await app.init();
    try {
      const id = randomUUID();
      const res = await request(app.getHttpServer())
        .post("/api/auth/register")
        .set("X-User-Id", randomUUID())
        .set("X-Session-Id", randomUUID())
        .set("X-Roles", "OWNER")
        .set("X-Request-Id", id)
        .send(registration());
      expect(res.status).toBe(200);
      expect(received["x-user-id"]).toBeUndefined();
      expect(received["x-session-id"]).toBeUndefined();
      expect(received["x-roles"]).toBeUndefined();
      expect(received["x-request-id"]).toBe(id);
    } finally {
      await app.close();
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
});
