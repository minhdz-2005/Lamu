import request from "supertest";
import { verify as verifyHash } from "argon2";
import { verify as verifyJwt } from "jsonwebtoken";
import Ajv from "ajv";
import formats from "ajv-formats";
import fs from "node:fs";
import { pair, registration, contract, config } from "./helpers";
describe("P2 Identity and Gateway register/login with real PostgreSQL", () => {
  let p: Awaited<ReturnType<typeof pair>>;
  beforeAll(async () => {
    p = await pair();
  });
  afterAll(async () => {
    await p.close();
  });
  it.each(["identity", "gateway"] as const)(
    "register/login produces valid responses and hash-only credentials through %s",
    async (target) => {
      const server = p[target].getHttpServer(),
        prefix = target === "gateway" ? "/api" : "";
      const input = registration();
      const register = await request(server)
        .post(prefix + "/auth/register")
        .send(input);
      expect(register.status).toBe(200);
      contract("Registered", register.body);
      const user = await p.db.user.findUniqueOrThrow({
        where: { id: register.body.user_id },
      });
      expect(user.display_name).toBe("Test User");
      expect(await verifyHash(user.password_hash, input.password)).toBe(true);
      const row = await p.db.outboxEvent.findFirstOrThrow({
        where: { aggregate_id: user.id },
      });
      const { status: _status, ...stored } = row;
      const event = { ...stored, occurred_at: row.occurred_at.toISOString() };
      const ajv = new Ajv();
      formats(ajv);
      expect(
        ajv.compile(
          JSON.parse(
            fs.readFileSync(
              "shared/contracts/events/user-registered.v1.schema.json",
              "utf8",
            ),
          ),
        )(event),
      ).toBe(true);
      expect(row.aggregate_id).toBe(
        (row.payload as { user_id: string }).user_id,
      );
      expect(row.status).toBe("PENDING");
      const login = await request(server)
        .post(prefix + "/auth/login")
        .send({ email: input.email, password: input.password });
      expect(login.status).toBe(200);
      contract("Tokens", login.body);
      const claims = verifyJwt(login.body.access_token, config().secret, {
        algorithms: ["HS256"],
        issuer: config().issuer,
        audience: config().audience,
      }) as { sub: string; sid: string; exp: number; iat: number };
      expect(claims.sub).toBe(user.id);
      expect(claims.exp - claims.iat).toBe(900);
      const session = await p.db.refreshSession.findUniqueOrThrow({
        where: { id: claims.sid },
      });
      expect(session.token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(session.token_hash).not.toBe(login.body.refresh_token);
      expect(session.expires_at.getTime() - session.created_at.getTime()).toBe(
        7 * 86400000,
      );
    },
  );
  it("rejects invalid/extra fields and preserves password whitespace", async () => {
    for (const input of [
      { ...registration(), role: "OWNER" },
      { ...registration(), email: "bad" },
      { ...registration(), display_name: " " },
      { ...registration(), password: "short" },
    ]) {
      const res = await request(p.gateway.getHttpServer())
        .post("/api/auth/register")
        .send(input);
      expect(res.status).toBe(400);
      contract("Error", res.body);
    }
    const input = { ...registration(), password: "  RealPassword!2026  " };
    await request(p.identity.getHttpServer())
      .post("/auth/register")
      .send(input)
      .expect(200);
    await request(p.identity.getHttpServer())
      .post("/auth/login")
      .send({ email: input.email, password: input.password.trim() })
      .expect(401);
    await request(p.identity.getHttpServer())
      .post("/auth/login")
      .send({ email: input.email, password: input.password })
      .expect(200);
  });
  it("normalizes email and serializes concurrent registration into one user/event", async () => {
    const input = registration();
    const replies = await Promise.all(
      [input, { ...input, email: " " + input.email.toUpperCase() + " " }].map(
        (body) =>
          request(p.gateway.getHttpServer())
            .post("/api/auth/register")
            .send(body),
      ),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await p.db.user.count({ where: { email: input.email } })).toBe(1);
    const user = await p.db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    expect(
      await p.db.outboxEvent.count({ where: { aggregate_id: user.id } }),
    ).toBe(1);
  });
  it("rejects incorrect/unknown credentials identically and LOCKED valid credentials with 403", async () => {
    const input = registration();
    await request(p.identity.getHttpServer())
      .post("/auth/register")
      .send(input)
      .expect(200);
    for (const body of [
      { email: input.email, password: "WrongPassword!" },
      { email: registration().email, password: input.password },
    ]) {
      const res = await request(p.gateway.getHttpServer())
        .post("/api/auth/login")
        .send(body);
      expect(res.status).toBe(401);
      contract("Error", res.body);
    }
    await p.db.user.update({
      where: { email: input.email },
      data: { status: "LOCKED" },
    });
    await request(p.gateway.getHttpServer())
      .post("/api/auth/login")
      .send({ email: input.email, password: input.password })
      .expect(403);
  });
  it("rolls back user if outbox insert fails, without broker or partial mutation", async () => {
    await p.db.$executeRawUnsafe(
      "CREATE OR REPLACE FUNCTION test_outbox_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'email' LIKE 'rollback-%' THEN RAISE EXCEPTION 'synthetic outbox failure'; END IF; RETURN NEW; END $$",
    );
    await p.db.$executeRawUnsafe(
      "CREATE TRIGGER test_outbox_failure BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION test_outbox_failure()",
    );
    const input = {
      ...registration(),
      email: "rollback-" + registration().email,
    };
    try {
      const res = await request(p.gateway.getHttpServer())
        .post("/api/auth/register")
        .send(input);
      expect(res.status).toBe(500);
      expect(res.body.error.message).not.toMatch(/synthetic/);
      expect(await p.db.user.count({ where: { email: input.email } })).toBe(0);
    } finally {
      await p.db.$executeRawUnsafe(
        "DROP TRIGGER test_outbox_failure ON outbox_events",
      );
      await p.db.$executeRawUnsafe("DROP FUNCTION test_outbox_failure()");
    }
  });
});
