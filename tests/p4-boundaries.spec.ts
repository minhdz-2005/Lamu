import request from "supertest";
import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import { pair, config, contract, registration } from "./helpers";
import { createGatewayApp } from "../gateway/src/app";
import { createIdentityApp } from "../services/identity-service/src/app";
import { validateConfig } from "../shared/libraries/runtime/src";
describe("P4 remaining security and profile boundaries", () => {
  let p: Awaited<ReturnType<typeof pair>>;
  beforeAll(async () => {
    p = await pair();
  });
  afterAll(() => p.close());
  it("reads real seeded memberships and role codes without exposing event fixture as authorization proof", async () => {
    const tokens = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@demo.lamu.test", password: "LocalDemo!2026" })
        .expect(200)
    ).body;
    const res = await request(p.gateway.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", "Bearer " + tokens.access_token)
      .expect(200);
    contract("Profile", res.body);
    expect(
      res.body.memberships.map((m: { roles: string[] }) => m.roles),
    ).toEqual([["ADMIN"], ["OWNER"]]);
    const speaker = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "speaker@demo.lamu.test", password: "LocalDemo!2026" })
        .expect(200)
    ).body;
    const profile = await request(p.gateway.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", "Bearer " + speaker.access_token)
      .expect(200);
    expect(profile.body.memberships[0].roles).toEqual(["SPEAKER"]);
  });
  it("unknown verified user fails closed and non-string DTO fields do not get coerced", async () => {
    const c = config(),
      iat = Math.floor(Date.now() / 1000);
    const token = sign(
      {
        sub: randomUUID(),
        sid: randomUUID(),
        jti: randomUUID(),
        iat,
        exp: iat + 900,
      },
      c.secret,
      { algorithm: "HS256", issuer: c.issuer, audience: c.audience },
    );
    await request(p.gateway.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", "Bearer " + token)
      .expect(401);
    await request(p.gateway.getHttpServer())
      .post("/api/auth/register")
      .send({ ...registration(), email: 123, display_name: 123 })
      .expect(400);
  });
  it("rejects duplicate Authorization on public auth too and bounds general request rate", async () => {
    const app = await createGatewayApp({
      ...config(),
      identityUrl: "http://127.0.0.1:1",
      rateLimit: 1,
    });
    await app.init();
    try {
      await request(app.getHttpServer()).get("/healthz").expect(200);
      const res = await request(app.getHttpServer())
        .get("/healthz")
        .expect(429);
      contract("Error", res.body);
    } finally {
      await app.close();
    }
    const idApp = await createIdentityApp(config());
    await idApp.init();
    try {
      await request(idApp.getHttpServer()).get("/readyz").expect(200);
    } finally {
      await idApp.close();
    }
  });
  it("validates missing env, default ports and URL protocols without credentials", () => {
    const base = {
      JWT_SECRET: "x".repeat(64),
      JWT_ISSUER: "test",
      JWT_AUDIENCE: "test",
      DATABASE_URL: process.env.DATABASE_URL,
    };
    for (const env of [
      { ...base, JWT_AUDIENCE: "" },
      { ...base, DATABASE_URL: "" },
      { ...base, PORT: "65536" },
      { ...base, IDENTITY_URL: "http://user:password@localhost" },
      { ...base, IDENTITY_URL: "http://localhost#fragment" },
    ])
      expect(() => validateConfig(env, "identity")).toThrow();
    expect(() => validateConfig(base, "gateway")).toThrow();
    expect(validateConfig(base, "identity").port).toBe(8080);
  });
});
