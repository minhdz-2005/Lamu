import { randomBytes, createHash } from "node:crypto";
import {
  recoveryConfig,
  mailConfig,
} from "../services/identity-service/src/security/config";
import {
  CloudinaryProvider,
  mediaConfig,
} from "../services/identity-service/src/media/cloudinary";
import { SmtpSecurityMailSender } from "../services/identity-service/src/security/mail.worker";
import { createServer, type Socket } from "node:net";
import { transactionRetry } from "../services/identity-service/src/common/transaction";
import type { Database } from "../services/identity-service/src/database";
describe("Security process configuration and Cloudinary adapter boundaries", () => {
  const recovery = {
    PASSWORD_RESET_OTP_HMAC_KEY: randomBytes(32).toString("hex"),
    MAIL_JOB_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  };
  const media = {
    CLOUDINARY_CLOUD_NAME: "test",
    CLOUDINARY_ASSET_PREFIX: "lamu/test",
    CLOUDINARY_API_KEY: "public",
    CLOUDINARY_API_SECRET: "private-test",
    CLOUDINARY_AVATAR_UPLOAD_PRESET: "avatar",
    CLOUDINARY_ORG_COVER_UPLOAD_PRESET: "cover",
  };
  const smtp = {
    MAIL_JOB_ENCRYPTION_KEY: recovery.MAIL_JOB_ENCRYPTION_KEY,
    DATABASE_URL: "postgresql://test:test@localhost/test",
    APP_ENV: "test",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    MAIL_FROM: "test@lamu.test",
  };
  afterEach(() => jest.restoreAllMocks());
  it("retries only explicitly aborted DB transactions, with a bounded budget", async () => {
    const aborted = Object.assign(new Error("deadlock"), { code: "P2034" }),
      tx = jest
        .fn()
        .mockRejectedValueOnce(aborted)
        .mockResolvedValueOnce("committed");
    expect(
      await transactionRetry(
        { $transaction: tx } as unknown as Database,
        async () => "result",
      ),
    ).toBe("committed");
    expect(tx).toHaveBeenCalledTimes(2);
    tx.mockReset().mockRejectedValue(new Error("ambiguous commit"));
    await expect(
      transactionRetry(
        { $transaction: tx } as unknown as Database,
        async () => "result",
      ),
    ).rejects.toThrow("ambiguous");
    expect(tx).toHaveBeenCalledTimes(1);
    tx.mockReset().mockRejectedValue(aborted);
    await expect(
      transactionRetry(
        { $transaction: tx } as unknown as Database,
        async () => "result",
      ),
    ).rejects.toThrow("deadlock");
    expect(tx).toHaveBeenCalledTimes(3);
  });
  it("validates API independently from SMTP and mail worker independently from JWT/HMAC/media", () => {
    expect(recoveryConfig(recovery).otpTtl).toBe(600);
    expect(mailConfig(smtp).secure).toBe(false);
    for (const e of [
      { ...recovery, PASSWORD_RESET_OTP_HMAC_KEY: "" },
      {
        ...recovery,
        MAIL_JOB_ENCRYPTION_KEY: recovery.PASSWORD_RESET_OTP_HMAC_KEY,
      },
      { ...recovery, PASSWORD_RESET_MAX_ATTEMPTS: "0" },
      { ...recovery, PASSWORD_RESET_OTP_TTL_SECONDS: "bad" },
    ])
      expect(() => recoveryConfig(e)).toThrow();
    for (const e of [
      { ...smtp, DATABASE_URL: "" },
      { ...smtp, SMTP_HOST: "" },
      { ...smtp, SMTP_SECURE: "yes" },
      { ...smtp, APP_ENV: "production" },
      { ...smtp, SMTP_HOST: "smtp.gmail.com" },
    ])
      expect(() => mailConfig(e)).toThrow();
    const old = randomBytes(32).toString("hex");
    expect(
      mailConfig({
        ...smtp,
        MAIL_JOB_PREVIOUS_KEYS_JSON: JSON.stringify({ old }),
      }).keys.old,
    ).toBe(old);
    for (const value of ["[]", "null", '{"v1":"bad"}'])
      expect(() =>
        mailConfig({ ...smtp, MAIL_JOB_PREVIOUS_KEYS_JSON: value }),
      ).toThrow();
    expect(() =>
      mediaConfig({ ...media, CLOUDINARY_ASSET_PREFIX: "../escape" }),
    ).toThrow();
    expect(() =>
      mediaConfig({ ...media, CLOUDINARY_API_SECRET: "" }),
    ).toThrow();
  });
  it("signs exactly server parameters, accepts not-found, rejects provider errors and namespace escape", async () => {
    const settings = mediaConfig(media),
      p = new CloudinaryProvider(settings),
      params = {
        timestamp: 123,
        public_id: "lamu/test/unique",
        overwrite: false,
        upload_preset: "avatar",
      };
    expect(p.sign(params)).toBe(
      createHash("sha256")
        .update(
          "overwrite=false&public_id=lamu/test/unique&timestamp=123&upload_preset=avatar" +
            settings.secret,
        )
        .digest("hex"),
    );
    const fake = jest.spyOn(global, "fetch");
    fake.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await p.metadata(params.public_id)).toBeNull();
    fake.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    await expect(p.metadata(params.public_id)).rejects.toMatchObject({
      status: 502,
    });
    fake.mockRejectedValueOnce(new Error("provider failed"));
    await expect(p.metadata(params.public_id)).rejects.toMatchObject({
      status: 502,
    });
    fake.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: "not found" }), { status: 200 }),
    );
    await p.destroy(params.public_id);
    await expect(p.destroy("outside/namespace")).rejects.toThrow("Namespace");
    fake.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(p.destroy(params.public_id)).rejects.toThrow();
    fake.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: "bad" }), { status: 200 }),
    );
    await expect(p.destroy(params.public_id)).rejects.toThrow();
  });
  it("SMTP stalls fail within the lease budget without authenticating or using Gmail", async () => {
    const sockets = new Set<Socket>(),
      server = createServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const sender = new SmtpSecurityMailSender(
      mailConfig({
        ...smtp,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String((server.address() as { port: number }).port),
      }),
    );
    try {
      const started = Date.now();
      await expect(
        sender.send(
          { to: "synthetic@test.example", code: "012345" },
          { id: "synthetic", kind: "OTP" },
        ),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(16000);
    } finally {
      sender.transport.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20000);
});
