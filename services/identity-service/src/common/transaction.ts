import { randomInt } from "node:crypto";
import type { Database } from "../database";
import type { Prisma } from "../generated/client";
// Only retry transactions PostgreSQL/Prisma explicitly aborted. Never retry an ambiguous commit.
export async function transactionRetry<T>(
  db: Database,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work);
    } catch (error) {
      const e = error as {
        code?: string;
        meta?: {
          code?: string;
          driverAdapterError?: { cause?: { originalCode?: string } };
        };
      };
      const code =
        e.meta?.driverAdapterError?.cause?.originalCode ?? e.meta?.code;
      if (
        attempt >= 2 ||
        !(e.code === "P2034" || code === "40P01" || code === "40001")
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 10 * (attempt + 1) + randomInt(0, 20)),
      );
    }
  }
}
