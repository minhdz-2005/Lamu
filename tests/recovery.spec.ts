import request from "supertest";
import { randomBytes } from "node:crypto";
import { createIdentityApp } from "../services/identity-service/src/app";
import { createGatewayApp } from "../gateway/src/app";
import { createDatabase } from "../services/identity-service/src/database";
import {
  recoveryConfig,
  mailConfig,
} from "../services/identity-service/src/security/config";
import {
  SecurityMailWorker,
  SmtpSecurityMailSender,
} from "../services/identity-service/src/security/mail.worker";
import { open, seal } from "../services/identity-service/src/security/crypto";
import { RecoveryService } from "../services/identity-service/src/security/recovery.service";
import { Pool } from "pg";
import { config, contract, registration } from "./helpers";
const env = {
  ...process.env,
  PASSWORD_RESET_OTP_HMAC_KEY:
    process.env.PASSWORD_RESET_OTP_HMAC_KEY ?? randomBytes(32).toString("hex"),
  MAIL_JOB_ENCRYPTION_KEY:
    process.env.MAIL_JOB_ENCRYPTION_KEY ?? randomBytes(32).toString("hex"),
};
describe("Identity durable recovery through Gateway without messaging", () => {
  const settings = recoveryConfig(env);
  const db = createDatabase(process.env.DATABASE_URL!);
  let identity: Awaited<ReturnType<typeof createIdentityApp>>,
    gateway: Awaited<ReturnType<typeof createGatewayApp>>;
  const captured: Array<{ to: string; code: string | null }> = [];
  let worker: SecurityMailWorker;
  beforeAll(async () => {
    identity = await createIdentityApp(config(), db, {}, settings);
    await identity.listen(0, "127.0.0.1");
    gateway = await createGatewayApp({
      ...config(),
      identityUrl: await identity.getUrl(),
    });
    await gateway.init();
    worker = new SecurityMailWorker(db, settings, {
      send: async (p) => {
        captured.push(p);
      },
    });
  });
  afterAll(async () => {
    await gateway?.close();
    await identity?.close();
  });
  const post = (path: string, body: object) =>
    request(gateway.getHttpServer())
      .post("/api/auth/" + path)
      .send(body);
  async function account() {
    const input = registration();
    await post("register", input).expect(200);
    const login = await post(
      "login",
      input.password ? { email: input.email, password: input.password } : {},
    ).expect(200);
    return { input, tokens: login.body };
  }
  async function code(email: string) {
    await post("forgot-password", { email }).expect(202);
    await worker.tick();
    const c = captured.filter((p) => p.to === email).at(-1)?.code;
    expect(c).toMatch(/^\d{6}$/);
    return c!;
  }
  it("resets once, revokes access/refresh immediately and accepts only new password", async () => {
    const { input, tokens } = await account();
    const otp = await code(input.email);
    const v = await post("verify-reset-code", {
      email: input.email.toUpperCase(),
      code: otp,
    }).expect(200);
    contract("ResetVerified", v.body);
    expect(v.headers["cache-control"]).toBe("no-store");
    await post("verify-reset-code", { email: input.email, code: otp }).expect(
      400,
    );
    const body = {
      reset_token: v.body.reset_token,
      new_password: "ChangedPassword!2026",
    };
    const results = await Promise.all([
      post("reset-password", body),
      post("reset-password", body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    await request(gateway.getHttpServer())
      .get("/api/users/me")
      .auth(tokens.access_token, { type: "bearer" })
      .expect(401);
    await post("refresh", { refresh_token: tokens.refresh_token }).expect(401);
    await post("login", {
      email: input.email,
      password: input.password,
    }).expect(401);
    await post("login", {
      email: input.email,
      password: body.new_password,
    }).expect(200);
    await worker.tick();
    expect(captured.some((p) => p.to === input.email && p.code === null)).toBe(
      true,
    );
    const jobs = await db.securityMailJob.findMany({
      where: { status: "SENT" },
    });
    expect(jobs.every((j) => j.ciphertext === null)).toBe(true);
  });
  it("generic unknown/cooldown, validation, trusted IP, database budgets persist across instances", async () => {
    const { input } = await account();
    const known = await post("forgot-password", { email: input.email })
      .set("X-Client-IP", "fake")
      .expect(202);
    const unknown = await post("forgot-password", {
      email: "absent@test.example",
    }).expect(202);
    expect(known.body).toEqual(unknown.body);
    const count = await db.securityMailJob.count();
    await post("forgot-password", { email: input.email }).expect(202);
    expect(await db.securityMailJob.count()).toBe(count);
    await post("verify-reset-code", {
      email: input.email,
      code: 123456,
    }).expect(400);
    await post("reset-password", {
      reset_token: "a".repeat(43),
      new_password: "short",
    }).expect(400);
    const throttled = new RecoveryService(db, { ...settings, ipLimit: 1 });
    await throttled.forgot("one@test.example", "isolated-ip");
    await expect(
      new RecoveryService(db, { ...settings, ipLimit: 1 }).forgot(
        "two@test.example",
        "isolated-ip",
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("wrong attempts, expiry, resend invalidates token and verify concurrency has one winner", async () => {
    const { input } = await account();
    const otp = await code(input.email);
    for (let i = 0; i < 5; i++)
      await post("verify-reset-code", {
        email: input.email,
        code: otp === "000000" ? "000001" : "000000",
      }).expect(400);
    await post("verify-reset-code", { email: input.email, code: otp }).expect(
      400,
    );
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    await db.passwordResetChallenge.updateMany({
      where: { user_id: user.id },
      data: { failed_attempts: 0 },
    });
    const res = await Promise.all([
      post("verify-reset-code", { email: input.email, code: otp }),
      post("verify-reset-code", { email: input.email, code: otp }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 400]);
    const token = res.find((r) => r.status === 200)!.body.reset_token;
    await db.passwordResetChallenge.updateMany({
      where: { user_id: user.id },
      data: { token_expires_at: new Date(Date.now() - 1000) },
    });
    await post("reset-password", {
      reset_token: token,
      new_password: "NewPassword!2026",
    }).expect(400);
    const expired = await account(),
      expiredCode = await code(expired.input.email);
    const expiredUser = await db.user.findUniqueOrThrow({
      where: { email: expired.input.email },
    });
    await db.passwordResetChallenge.updateMany({
      where: { user_id: expiredUser.id },
      data: {
        created_at: new Date(Date.now() - 1200000),
        expires_at: new Date(Date.now() - 1000),
      },
    });
    await post("verify-reset-code", {
      email: expired.input.email,
      code: expiredCode,
    }).expect(400);
  });
  it("worker retries on failure, survives restart, skips expired/replaced jobs, authenticates ciphertext", async () => {
    const { input } = await account();
    await post("forgot-password", { email: input.email }).expect(202);
    const user = await db.user.findUniqueOrThrow({
        where: { email: input.email },
      }),
      challenge = await db.passwordResetChallenge.findFirstOrThrow({
        where: { user_id: user.id },
      });
    const failing = new SecurityMailWorker(db, settings, {
      send: async () => {
        throw new Error("provider timeout");
      },
    });
    await failing.tick();
    let job = await db.securityMailJob.findFirstOrThrow({
      where: { challenge_id: challenge.id },
    });
    expect(job.status).toBe("PENDING");
    expect(job.ciphertext).toBeTruthy();
    await db.securityMailJob.update({
      where: { id: job.id },
      data: {
        status: "SENDING",
        lease_owner: crypto.randomUUID(),
        lease_until: new Date(Date.now() - 1000),
      },
    });
    await worker.tick();
    job = await db.securityMailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(job.status).toBe("SENT");
    expect(job.ciphertext).toBeNull();
    const sealed = seal({ code: "012345" }, settings.encryption, "bound");
    expect(open(sealed, settings.encryption, "bound")).toEqual({
      code: "012345",
    });
    expect(() => open(sealed, settings.encryption, "other")).toThrow();
  });
  it("resend invalidates an issued reset token and keeps email verify budget", async () => {
    const { input } = await account();
    const otp = await code(input.email);
    const verified = await post("verify-reset-code", {
      email: input.email,
      code: otp,
    }).expect(200);
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    await db.passwordResetChallenge.updateMany({
      where: { user_id: user.id },
      data: { created_at: new Date(Date.now() - 120000) },
    });
    const resend = new RecoveryService(db, { ...settings, cooldown: 1 });
    await resend.forgot(input.email, "resend-isolated");
    await worker.tick();
    await post("reset-password", {
      reset_token: verified.body.reset_token,
      new_password: "ResentPassword!2026",
    }).expect(400);
    const fresh = captured.filter((p) => p.to === input.email).at(-1)!.code!;
    await post("verify-reset-code", { email: input.email, code: fresh }).expect(
      200,
    );
  });
  it("reset, login and refresh races leave no session authenticated with the old password", async () => {
    const { input, tokens } = await account(),
      otp = await code(input.email);
    const verified = await post("verify-reset-code", {
      email: input.email,
      code: otp,
    }).expect(200);
    const results = await Promise.all([
      post("reset-password", {
        reset_token: verified.body.reset_token,
        new_password: "RacePassword!2026",
      }),
      post("login", { email: input.email, password: input.password }),
      post("refresh", { refresh_token: tokens.refresh_token }),
    ]);
    expect(results[0].status).toBe(200);
    expect([200, 401]).toContain(results[1].status);
    expect([200, 401]).toContain(results[2].status);
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
    });
    expect(
      await db.refreshSession.count({
        where: { user_id: user.id, revoked_at: null },
      }),
    ).toBe(0);
  });
  it("DB failure rolls back password, token consumption, session revocation and confirmation job", async () => {
    const { input, tokens } = await account(),
      otp = await code(input.email);
    const verified = await post("verify-reset-code", {
      email: input.email,
      code: otp,
    }).expect(200);
    const user = await db.user.findUniqueOrThrow({
        where: { email: input.email },
      }),
      sql = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await sql.query(
        "CREATE FUNCTION security_reset_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='PASSWORD_CHANGED' THEN RAISE EXCEPTION 'test fault'; END IF; RETURN NEW; END $$",
      );
      await sql.query(
        "CREATE TRIGGER security_reset_fault BEFORE INSERT ON security_mail_jobs FOR EACH ROW EXECUTE FUNCTION security_reset_fault()",
      );
      const body = {
        reset_token: verified.body.reset_token,
        new_password: "FailurePassword!2026",
      };
      await post("reset-password", body).expect(500);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
          .password_hash,
      ).toBe(user.password_hash);
      expect(
        (
          await db.passwordResetChallenge.findFirstOrThrow({
            where: { user_id: user.id },
          })
        ).consumed_at,
      ).toBeNull();
      await request(gateway.getHttpServer())
        .get("/api/users/me")
        .auth(tokens.access_token, { type: "bearer" })
        .expect(200);
      await sql.query(
        "DROP TRIGGER security_reset_fault ON security_mail_jobs",
      );
      await sql.query("DROP FUNCTION security_reset_fault()");
      await post("reset-password", body).expect(200);
    } finally {
      await sql.query(
        "DROP TRIGGER IF EXISTS security_reset_fault ON security_mail_jobs",
      );
      await sql.query("DROP FUNCTION IF EXISTS security_reset_fault()");
      await sql.end();
    }
  });
  it("mail expiry, replaced generation and terminal retry remove encrypted secrets", async () => {
    for (const kind of ["expired", "replaced", "failed"]) {
      const { input } = await account();
      await post("forgot-password", { email: input.email }).expect(202);
      const user = await db.user.findUniqueOrThrow({
          where: { email: input.email },
        }),
        c = await db.passwordResetChallenge.findFirstOrThrow({
          where: { user_id: user.id },
        }),
        j = await db.securityMailJob.findFirstOrThrow({
          where: { challenge_id: c.id },
        });
      if (kind === "expired")
        await db.securityMailJob.update({
          where: { id: j.id },
          data: { expires_at: new Date(Date.now() - 1000) },
        });
      if (kind === "replaced")
        await db.passwordResetChallenge.update({
          where: { id: c.id },
          data: { consumed_at: new Date() },
        });
      if (kind === "failed")
        await db.securityMailJob.update({
          where: { id: j.id },
          data: { attempts: 4 },
        });
      await new SecurityMailWorker(db, settings, {
        send: async () => {
          throw new Error("provider unavailable");
        },
      }).tick();
      const result = await db.securityMailJob.findUniqueOrThrow({
        where: { id: j.id },
      });
      expect(result.status).toBe(
        kind === "expired"
          ? "EXPIRED"
          : kind === "replaced"
            ? "CANCELLED"
            : "FAILED",
      );
      expect(result.ciphertext).toBeNull();
    }
  });
  it("SMTP accepted then DB completion failure retries the same job/code after lease expiry", async () => {
    const { input } = await account();
    await post("forgot-password", { email: input.email }).expect(202);
    const user = await db.user.findUniqueOrThrow({
        where: { email: input.email },
      }),
      c = await db.passwordResetChallenge.findFirstOrThrow({
        where: { user_id: user.id },
      }),
      job = await db.securityMailJob.findFirstOrThrow({
        where: { challenge_id: c.id },
      });
    const sql = new Pool({ connectionString: process.env.DATABASE_URL }),
      delivered: string[] = [];
    const sender = {
      send: async (
        p: { to: string; code: string | null },
        j: { id: string },
      ) => {
        if (j.id === job.id) delivered.push(p.code!);
      },
    };
    try {
      await sql.query(
        `CREATE FUNCTION security_mail_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${job.id}'::uuid AND NEW.status='SENT' THEN RAISE EXCEPTION 'test mail acknowledgement fault'; END IF; RETURN NEW; END $$`,
      );
      await sql.query(
        "CREATE TRIGGER security_mail_fault BEFORE UPDATE ON security_mail_jobs FOR EACH ROW EXECUTE FUNCTION security_mail_fault()",
      );
      await expect(
        new SecurityMailWorker(db, settings, sender).tick(),
      ).rejects.toThrow();
      await sql.query("DROP TRIGGER security_mail_fault ON security_mail_jobs");
      await sql.query("DROP FUNCTION security_mail_fault()");
      await db.securityMailJob.update({
        where: { id: job.id },
        data: { lease_until: new Date(Date.now() - 1000) },
      });
      await new SecurityMailWorker(db, settings, sender).tick();
      expect(delivered).toHaveLength(2);
      expect(delivered[0] === delivered[1]).toBe(true);
      expect(
        (await db.securityMailJob.findUniqueOrThrow({ where: { id: job.id } }))
          .ciphertext,
      ).toBeNull();
    } finally {
      await sql.query(
        "DROP TRIGGER IF EXISTS security_mail_fault ON security_mail_jobs",
      );
      await sql.query("DROP FUNCTION IF EXISTS security_mail_fault()");
      await sql.end();
    }
  });
  (process.env.MAILPIT_URL ? it : it.skip)(
    "SMTP sends OTP to isolated Mailpit and completes Gateway recovery",
    async () => {
      const { input } = await account();
      await post("forgot-password", { email: input.email }).expect(202);
      const smtp = new SmtpSecurityMailSender(mailConfig(env));
      try {
        await new SecurityMailWorker(db, settings, smtp).tick();
        const list = (await (
          await fetch(process.env.MAILPIT_URL + "/api/v1/messages")
        ).json()) as {
          messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
        };
        const msg = list.messages.find((m) =>
          m.To.some((t) => t.Address === input.email),
        );
        expect(msg).toBeDefined();
        const detail = (await (
          await fetch(process.env.MAILPIT_URL + "/api/v1/message/" + msg!.ID)
        ).json()) as { Text: string };
        const otp = detail.Text.match(/\b\d{6}\b/)![0];
        const v = await post("verify-reset-code", {
          email: input.email,
          code: otp,
        }).expect(200);
        await post("reset-password", {
          reset_token: v.body.reset_token,
          new_password: "MailpitPassword!2026",
        }).expect(200);
      } finally {
        smtp.transport.close();
      }
    },
  );
});
