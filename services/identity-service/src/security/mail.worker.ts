import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import type { Database } from "../database";
import type { SecurityMailJob } from "../generated/client";
import { open } from "./crypto";
import type { mailConfig } from "./config";
export interface SecurityMailSender {
  send(
    payload: { to: string; code: string | null },
    job: { id: string; kind: string },
  ): Promise<void>;
}
export class SmtpSecurityMailSender implements SecurityMailSender {
  readonly transport;
  constructor(private readonly config: ReturnType<typeof mailConfig>) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure && !!config.user,
      auth: config.user
        ? { user: config.user, pass: config.password }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      logger: false,
      debug: false,
    });
  }
  async send(
    payload: { to: string; code: string | null },
    job: { id: string; kind: string },
  ) {
    const otp = job.kind === "OTP";
    const message: SendMailOptions & { signal: AbortSignal } = {
      signal: AbortSignal.timeout(15000),
      from: this.config.from,
      to: payload.to,
      messageId: `<${job.id}@security.lamu>`,
      subject: otp
        ? "Lamu - Password recovery code"
        : "Lamu - Password changed",
      text: otp
        ? `Your recovery code is ${payload.code}. Only the newest code is valid. It expires shortly. If you did not request this, ignore this email.`
        : "Your Lamu password has been changed and all sessions have been revoked. If this was not you, request password recovery immediately.",
    };
    await this.transport.sendMail(message);
  }
}
export class SecurityMailWorker {
  constructor(
    private readonly db: Database,
    private readonly config: {
      encryption: string;
      keyId: string;
      keys?: Record<string, string>;
    },
    private readonly sender: SecurityMailSender,
  ) {}
  async tick(stopping: () => boolean = () => false) {
    const owner = randomUUID();
    const jobs = await this.db.$queryRaw<
      SecurityMailJob[]
    >`UPDATE security_mail_jobs SET status='SENDING',lease_owner=${owner}::uuid,lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM security_mail_jobs WHERE (status='PENDING' AND next_attempt_at<=clock_timestamp() OR status='SENDING' AND lease_until<clock_timestamp()) ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`;
    // Send serially; renew each claim before SMTP so later batch entries retain a full lease.
    for (const job of jobs) {
      if (stopping()) break;
      const owned = await this.db.securityMailJob.updateMany({
        where: { id: job.id, lease_owner: owner },
        data: { lease_until: new Date(Date.now() + 60000) },
      });
      if (!owned.count) continue;
      let status = "SENT";
      try {
        if (job.expires_at <= new Date()) status = "EXPIRED";
        else if (job.attempts > 5) status = "FAILED";
        else {
          const c = job.challenge_id
            ? await this.db.passwordResetChallenge.findUnique({
                where: { id: job.challenge_id },
              })
            : null;
          if (
            job.kind === "OTP" &&
            (!c ||
              c.generation !== job.generation ||
              c.consumed_at ||
              c.verified_at ||
              c.expires_at <= new Date())
          )
            status = "CANCELLED";
          else {
            const key =
              this.config.keys?.[job.key_id] ??
              (job.key_id === this.config.keyId
                ? this.config.encryption
                : undefined);
            if (!key || !job.ciphertext)
              throw new Error("MAIL_PAYLOAD_UNAVAILABLE");
            const payload = open<{ to: string; code: string | null }>(
              job.ciphertext,
              key,
              `${job.id}:${job.challenge_id ?? ""}:${job.generation}:${job.kind}`,
            );
            await this.sender.send(payload, job);
          }
        }
      } catch {
        status = job.attempts >= 5 ? "FAILED" : "PENDING";
      }
      await this.db.securityMailJob.updateMany({
        where: { id: job.id, lease_owner: owner },
        data: {
          status,
          lease_owner: null,
          lease_until: null,
          ciphertext: status === "PENDING" ? job.ciphertext : null,
          finished_at: status === "PENDING" ? null : new Date(),
          next_attempt_at: new Date(
            Date.now() +
              Math.min(60000, 1000 * 2 ** job.attempts) +
              Math.floor(Math.random() * 1000),
          ),
        },
      });
    }
    // Retention: clear expired secrets even if a job was never claimed.
    await this.db.securityMailJob.updateMany({
      where: { expires_at: { lte: new Date() }, status: { in: ["PENDING"] } },
      data: { status: "EXPIRED", ciphertext: null, finished_at: new Date() },
    });
    const retention = new Date(Date.now() - 7 * 86400000);
    await this.db.securityMailJob.deleteMany({
      where: { finished_at: { lt: retention } },
    });
    await this.db.passwordResetChallenge.deleteMany({
      where: { expires_at: { lt: retention }, jobs: { none: {} } },
    });
    await this.db.securityRateBucket.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    return jobs.length;
  }
}
