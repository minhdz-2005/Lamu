import { createHmac } from "node:crypto";
import type { Prisma } from "../generated/client";

export async function consumeSecurityAttempt(
  tx: Prisma.TransactionClient,
  secret: string | Buffer,
  scope: string,
  value: string,
  limit: number,
  seconds = 3600,
) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = createHmac("sha256", secret)
    .update(scope + ":" + value + ":" + window)
    .digest("hex");
  const expires = new Date((window + 1) * seconds * 1000);
  const rows = await tx.$queryRaw<
    Array<{ count: number }>
  >`INSERT INTO security_rate_buckets(key,count,expires_at) VALUES(${key},1,${expires}) ON CONFLICT(key) DO UPDATE SET count=LEAST(security_rate_buckets.count+1,1000000) RETURNING count`;
  return { allowed: rows[0].count <= limit, expires };
}
