import { transactionRetry } from "../common/transaction";
import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { hash } from "argon2";
import { fail } from "@lamu/runtime";
import { DATABASE, type Database } from "../database";
import type { Prisma } from "../generated/client";
import {
  hashOptions,
  refreshToken,
  tokenHash,
} from "../modules/auth/auth.service";
import { SECURITY_CONFIG, type RecoveryConfig } from "./config";
import { equalDigest, otpDigest, seal } from "./crypto";
type Tx = Prisma.TransactionClient;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
@Injectable()
export class RecoveryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SECURITY_CONFIG) private readonly config: RecoveryConfig,
  ) {}
  private bucketKey(scope: string, value: string, window: number) {
    return createHmac("sha256", Buffer.from(this.config.hmac, "hex"))
      .update(scope + ":" + value + ":" + window)
      .digest("hex");
  }
  private async bucket(
    tx: Tx,
    scope: string,
    value: string,
    limit: number,
    seconds = 3600,
  ) {
    const window = Math.floor(Date.now() / (seconds * 1000)),
      key = this.bucketKey(scope, value, window),
      expires = new Date((window + 1) * seconds * 1000);
    const rows = await tx.$queryRaw<
      Array<{ count: number }>
    >`INSERT INTO security_rate_buckets(key,count,expires_at) VALUES(${key},1,${expires}) ON CONFLICT(key) DO UPDATE SET count=LEAST(security_rate_buckets.count+1,1000000) RETURNING count`;
    return rows[0].count <= limit;
  }
  async mail(
    tx: Tx,
    kind: "OTP" | "PASSWORD_CHANGED",
    to: string,
    code: string | null,
    expires: Date,
    challenge?: { id: string; generation: string },
  ) {
    const id = randomUUID(),
      generation = challenge?.generation ?? randomUUID();
    await tx.securityMailJob.create({
      data: {
        id,
        challenge_id: challenge?.id,
        generation,
        kind,
        key_id: this.config.keyId,
        expires_at: expires,
        ciphertext: seal(
          { to, code },
          this.config.encryption,
          `${id}:${challenge?.id ?? ""}:${generation}:${kind}`,
        ),
      },
    });
  }
  async forgot(email: string, ip: string) {
    const started = Date.now(),
      responseFloor = 75 + randomInt(0, 26);
    email = normalizeEmail(email);
    const result = await transactionRetry(this.db, async (tx) => {
      const allowedIp = await this.bucket(
        tx,
        "forgot-ip",
        ip,
        this.config.ipLimit,
      );
      const allowedEmail = await this.bucket(
        tx,
        "forgot-email",
        email,
        this.config.emailLimit,
      );
      const cooldown = await this.bucket(
        tx,
        "forgot-cooldown",
        email,
        1,
        this.config.cooldown,
      );
      if (!allowedIp) return "THROTTLED";
      if (!allowedEmail || !cooldown) return "OK";
      const users = await tx.$queryRaw<
        Array<{ id: string; status: string; email: string }>
      >`SELECT id,status,email FROM users WHERE email=${email}::citext FOR UPDATE`;
      const user = users[0];
      if (!user || user.status !== "ACTIVE") return "OK";
      const at = new Date(),
        last = await tx.passwordResetChallenge.findFirst({
          where: { user_id: user.id },
          orderBy: { created_at: "desc" },
        });
      if (
        last &&
        at.getTime() - last.created_at.getTime() < this.config.cooldown * 1000
      )
        return "OK";
      await tx.passwordResetChallenge.updateMany({
        where: { user_id: user.id, consumed_at: null },
        data: { consumed_at: at },
      });
      const id = randomUUID(),
        generation = randomUUID(),
        code = String(randomInt(0, 1000000)).padStart(6, "0"),
        expires = new Date(at.getTime() + this.config.otpTtl * 1000);
      await tx.passwordResetChallenge.create({
        data: {
          id,
          user_id: user.id,
          generation,
          code_digest: otpDigest(this.config.hmac, id, code),
          created_at: at,
          expires_at: expires,
        },
      });
      await this.mail(tx, "OTP", user.email, code, expires, { id, generation });
      return "OK";
    });
    if (Date.now() - started < responseFloor)
      await new Promise((resolve) =>
        setTimeout(resolve, responseFloor - (Date.now() - started)),
      );
    if (result === "THROTTLED") fail(429, "RATE_LIMITED", "Too many requests");
    return { status: "OK" as const };
  }
  async verify(email: string, code: string, ip: string) {
    email = normalizeEmail(email);
    const result = await transactionRetry(this.db, async (tx) => {
      const a = await this.bucket(tx, "verify-ip", ip, 100),
        b = await this.bucket(tx, "verify-email", email, 20);
      if (!a || !b) return { throttled: true };
      const users = await tx.$queryRaw<
        Array<{ id: string; status: string }>
      >`SELECT id,status FROM users WHERE email=${email}::citext FOR UPDATE`;
      if (!users[0] || users[0].status !== "ACTIVE") return {};
      const c = await tx.passwordResetChallenge.findFirst({
          where: { user_id: users[0].id },
          orderBy: { created_at: "desc" },
        }),
        at = new Date();
      if (
        !c ||
        c.consumed_at ||
        c.verified_at ||
        c.expires_at <= at ||
        c.failed_attempts >= this.config.attempts
      )
        return {};
      if (
        !equalDigest(c.code_digest, otpDigest(this.config.hmac, c.id, code))
      ) {
        await tx.passwordResetChallenge.update({
          where: { id: c.id },
          data: { failed_attempts: { increment: 1 } },
        });
        return {};
      }
      const token = refreshToken();
      await tx.passwordResetChallenge.update({
        where: { id: c.id },
        data: {
          verified_at: at,
          token_digest: tokenHash(token),
          token_expires_at: new Date(
            at.getTime() + this.config.tokenTtl * 1000,
          ),
        },
      });
      return { token };
    });
    if (result.throttled) fail(429, "RATE_LIMITED", "Too many requests");
    if (!result.token)
      fail(400, "INVALID_RECOVERY", "Invalid or expired recovery credentials");
    return { reset_token: result.token, expires_in: this.config.tokenTtl };
  }
  async reset(token: string, password: string, ip: string) {
    const allowed = await transactionRetry(this.db, (tx) =>
      this.bucket(tx, "reset-ip", ip, 30),
    );
    if (!allowed) fail(429, "RATE_LIMITED", "Too many requests");
    const digest = tokenHash(token),
      found = await this.db.passwordResetChallenge.findUnique({
        where: { token_digest: digest },
      });
    if (!found)
      fail(400, "INVALID_RECOVERY", "Invalid or expired recovery credentials");
    const password_hash = await hash(password, hashOptions);
    await transactionRetry(this.db, async (tx) => {
      const users = await tx.$queryRaw<
        Array<{ status: string; email: string }>
      >`SELECT status,email FROM users WHERE id=${found.user_id}::uuid FOR UPDATE`;
      const c = await tx.passwordResetChallenge.findUnique({
          where: { id: found.id },
        }),
        at = new Date();
      if (
        !c ||
        c.consumed_at ||
        !c.verified_at ||
        !c.token_expires_at ||
        c.token_expires_at <= at ||
        users[0]?.status !== "ACTIVE"
      )
        fail(
          400,
          "INVALID_RECOVERY",
          "Invalid or expired recovery credentials",
        );
      await tx.user.update({
        where: { id: c.user_id },
        data: { password_hash },
      });
      await tx.refreshSession.updateMany({
        where: { user_id: c.user_id, revoked_at: null },
        data: { revoked_at: at },
      });
      await tx.passwordResetChallenge.updateMany({
        where: { user_id: c.user_id, consumed_at: null },
        data: { consumed_at: at },
      });
      await this.mail(
        tx,
        "PASSWORD_CHANGED",
        users[0].email,
        null,
        new Date(at.getTime() + 86400000),
      );
    });
    return { status: "OK" as const };
  }
}
