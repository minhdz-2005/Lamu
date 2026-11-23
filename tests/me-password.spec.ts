import request from "supertest";
import { randomUUID } from "node:crypto";
import { contract, pair, registration } from "./helpers";

describe("Change own password through Gateway and Identity", () => {
  let apps: Awaited<ReturnType<typeof pair>>;
  const api = () => request(apps.gateway.getHttpServer());
  const path = "/api/users/me/password";
  const replacement = " Mật khẩu mới hợp lệ 🔒 ";
  beforeAll(async () => {
    apps = await pair();
  });
  afterAll(async () => {
    await apps?.close();
  });

  async function account() {
    const { display_name, ...credentials } = registration();
    const registered = await api()
      .post("/api/auth/register")
      .send({ ...credentials, display_name })
      .expect(200);
    const login = (password = credentials.password) =>
      api()
        .post("/api/auth/login")
        .send({ email: credentials.email, password });
    return { credentials, login, userId: registered.body.user_id as string };
  }

  it("validates auth, retains the session after a wrong password and atomically revokes concurrent sessions and recovery", async () => {
    const { credentials, login, userId } = await account();
    const first = (await login().expect(200)).body;
    const second = (await login().expect(200)).body;
    const challengeId = randomUUID();
    await apps.db.passwordResetChallenge.create({
      data: {
        id: challengeId,
        user_id: userId,
        generation: randomUUID(),
        code_digest: "a".repeat(64),
        verified_at: new Date(),
        token_digest: "b".repeat(64),
        expires_at: new Date(Date.now() + 60_000),
        token_expires_at: new Date(Date.now() + 60_000),
      },
    });
    const before = await apps.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const payload = {
      current_password: credentials.password,
      new_password: replacement,
    };
    await api().post(path).send(payload).expect(401);
    await api()
      .post(path)
      .auth(first.access_token, { type: "bearer" })
      .send({ ...payload, new_password: "short" })
      .expect(400);
    const wrong = await api()
      .post(path)
      .auth(first.access_token, { type: "bearer" })
      .send({ ...payload, current_password: "incorrect-old-password" })
      .expect(400);
    expect(wrong.body.error.code).toBe("CURRENT_PASSWORD_INCORRECT");
    await api()
      .get("/api/users/me")
      .auth(first.access_token, { type: "bearer" })
      .expect(200);
    const unchanged = await apps.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(unchanged.password_hash).toBe(before.password_hash);

    const candidates = [replacement, "Another NewPassword!2026"];
    const results = await Promise.all(
      [first, second].map((token, index) =>
        api()
          .post(path)
          .auth(token.access_token, { type: "bearer" })
          .send({ ...payload, new_password: candidates[index] }),
      ),
    );
    const winner = results.findIndex((result) => result.status === 200);
    expect(winner).toBeGreaterThanOrEqual(0);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    contract("PasswordChanged", results[winner].body);
    expect(results[winner].headers["cache-control"]).toBe("no-store");
    const challenge = await apps.db.passwordResetChallenge.findUniqueOrThrow({
      where: { id: challengeId },
    });
    expect(challenge.consumed_at).toBeInstanceOf(Date);
    for (const session of [first, second]) {
      await api()
        .get("/api/users/me")
        .auth(session.access_token, { type: "bearer" })
        .expect(401);
      await api()
        .post("/api/auth/refresh")
        .send({ refresh_token: session.refresh_token })
        .expect(401);
    }
    await login().expect(401);
    await login(candidates[1 - winner]).expect(401);
    await login(candidates[winner]).expect(200);
  });

  it("shares the attempt limit across distinct sessions of the same user", async () => {
    const { login } = await account();
    const first = (await login().expect(200)).body;
    const second = (await login().expect(200)).body;
    const body = {
      current_password: "incorrect-old-password",
      new_password: replacement,
    };
    for (let i = 0; i < 5; i++)
      await api()
        .post(path)
        .auth(first.access_token, { type: "bearer" })
        .send(body)
        .expect(400);
    const limited = await api()
      .post(path)
      .auth(second.access_token, { type: "bearer" })
      .send(body)
      .expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    await api()
      .get("/api/users/me")
      .auth(second.access_token, { type: "bearer" })
      .expect(200);
  });
});
