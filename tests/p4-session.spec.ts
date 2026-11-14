import request from "supertest";
import { decode, sign } from "jsonwebtoken";
import { pair, registration, contract, config } from "./helpers";
describe("P4 session rotation/logout on PostgreSQL", () => {
  let p: Awaited<ReturnType<typeof pair>>;
  beforeAll(async () => {
    p = await pair();
  });
  afterAll(() => p.close());
  async function account() {
    const input = registration();
    await request(p.gateway.getHttpServer())
      .post("/api/auth/register")
      .send(input)
      .expect(200);
    return {
      input,
      login: async () => {
        const r = await request(p.gateway.getHttpServer())
          .post("/api/auth/login")
          .send({ email: input.email, password: input.password });
        expect(r.status).toBe(200);
        return r.body as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };
      },
    };
  }
  const refresh = (token: string) =>
    request(p.gateway.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refresh_token: token });
  const logout = (access: string, refreshToken: string) =>
    request(p.gateway.getHttpServer())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer " + access)
      .send({ refresh_token: refreshToken });
  it("rotates one winner, preserves session ID and absolute expiry, rejects replay", async () => {
    const a = await account(),
      tokens = await a.login(),
      sid = (decode(tokens.access_token) as { sid: string }).sid;
    const before = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: sid },
    });
    const res = await Promise.all([
      refresh(tokens.refresh_token),
      refresh(tokens.refresh_token),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 401]);
    const winner = res.find((r) => r.status === 200)!;
    contract("Tokens", winner.body);
    expect(winner.body.refresh_token).not.toBe(tokens.refresh_token);
    expect((decode(winner.body.access_token) as { sid: string }).sid).toBe(sid);
    const after = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: sid },
    });
    expect(after.expires_at).toEqual(before.expires_at);
    expect(after.created_at).toEqual(before.created_at);
    await refresh(tokens.refresh_token).expect(401);
  });
  it("requires access/refresh from same user and session; retry revoke keeps timestamp; B survives A", async () => {
    const a = await account(),
      A = await a.login(),
      B = await a.login(),
      other = await account(),
      C = await other.login();
    await logout(A.access_token, B.refresh_token).expect(401);
    await logout(A.access_token, C.refresh_token).expect(401);
    const sid = (decode(A.access_token) as { sid: string }).sid;
    const r = await logout(A.access_token, A.refresh_token);
    expect(r.status).toBe(200);
    contract("LoggedOut", r.body);
    const before = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: sid },
    });
    await logout(A.access_token, A.refresh_token).expect(200);
    const after = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: sid },
    });
    expect(after.revoked_at).toEqual(before.revoked_at);
    await refresh(A.refresh_token).expect(401);
    await refresh(B.refresh_token).expect(200);
    await refresh(C.refresh_token).expect(200);
    await request(p.gateway.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", "Bearer " + A.access_token)
      .expect(200);
  });
  it("rejects old rotated refresh for logout; expired access can refresh before correct logout", async () => {
    const a = await account(),
      A = await a.login();
    const next = await refresh(A.refresh_token).expect(200);
    await logout(next.body.access_token, A.refresh_token).expect(401);
    const claims = decode(next.body.access_token) as Record<string, unknown>,
      iat = Math.floor(Date.now() / 1000) - 1000;
    const expired = sign({ ...claims, iat, exp: iat + 900 }, config().secret, {
      algorithm: "HS256",
    });
    await logout(expired, next.body.refresh_token).expect(401);
    const again = await refresh(next.body.refresh_token).expect(200);
    await logout(again.body.access_token, again.body.refresh_token).expect(200);
  });
  it("does not rotate valid credential for LOCKED user; invalid/expired credentials remain 401", async () => {
    const a = await account(),
      A = await a.login(),
      claims = decode(A.access_token) as { sub: string; sid: string };
    const before = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    await p.db.user.update({
      where: { id: claims.sub },
      data: { status: "LOCKED" },
    });
    await refresh(A.refresh_token).expect(403);
    await refresh("x".repeat(43)).expect(401);
    const after = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    expect(after.token_hash).toBe(before.token_hash);
    await p.db.refreshSession.update({
      where: { id: claims.sid },
      data: {
        created_at: new Date(Date.now() - 8 * 86400000),
        expires_at: new Date(Date.now() - 1),
      },
    });
    await refresh(A.refresh_token).expect(401);
    await logout(A.access_token, A.refresh_token).expect(401);
  });
  it("serializes refresh/logout race without restoring a revoked session", async () => {
    const a = await account(),
      A = await a.login();
    const [rotated, revoked] = await Promise.all([
      refresh(A.refresh_token),
      logout(A.access_token, A.refresh_token),
    ]);
    expect([rotated.status, revoked.status].sort()).toEqual([200, 401]);
    const sid = (decode(A.access_token) as { sid: string }).sid,
      row = await p.db.refreshSession.findUniqueOrThrow({ where: { id: sid } });
    if (revoked.status === 200) {
      expect(row.revoked_at).not.toBeNull();
      await refresh(A.refresh_token).expect(401);
    } else {
      expect(row.revoked_at).toBeNull();
      await logout(
        rotated.body.access_token,
        rotated.body.refresh_token,
      ).expect(200);
    }
  });
  it("rolls back failed rotation, keeping previous refresh usable", async () => {
    const a = await account(),
      A = await a.login(),
      sid = (decode(A.access_token) as { sid: string }).sid;
    const before = await p.db.refreshSession.findUniqueOrThrow({
      where: { id: sid },
    });
    await p.db.$executeRawUnsafe(
      "CREATE OR REPLACE FUNCTION test_session_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic session failure'; END $$",
    );
    await p.db.$executeRawUnsafe(
      "CREATE TRIGGER test_session_failure BEFORE UPDATE ON refresh_sessions FOR EACH ROW EXECUTE FUNCTION test_session_failure()",
    );
    try {
      await refresh(A.refresh_token).expect(500);
      const after = await p.db.refreshSession.findUniqueOrThrow({
        where: { id: sid },
      });
      expect(after.token_hash).toBe(before.token_hash);
    } finally {
      await p.db.$executeRawUnsafe(
        "DROP TRIGGER test_session_failure ON refresh_sessions",
      );
      await p.db.$executeRawUnsafe("DROP FUNCTION test_session_failure()");
    }
    await refresh(A.refresh_token).expect(200);
  });
  it("validates refresh/logout DTOs and requires access for logout", async () => {
    await refresh("bad").expect(400);
    await request(p.gateway.getHttpServer())
      .post("/api/auth/logout")
      .send({ refresh_token: "x".repeat(43) })
      .expect(401);
    const a = await account(),
      A = await a.login();
    await request(p.gateway.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refresh_token: A.refresh_token, user_id: "forged" })
      .expect(400);
  });
});
