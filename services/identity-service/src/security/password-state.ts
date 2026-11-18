import type { Prisma } from "../generated/client";

// Call while holding the user row lock shared by login, refresh and recovery.
export async function replacePassword(
  tx: Prisma.TransactionClient,
  userId: string,
  password_hash: string,
  at: Date,
) {
  await tx.user.update({ where: { id: userId }, data: { password_hash } });
  await tx.refreshSession.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: at },
  });
  await tx.passwordResetChallenge.updateMany({
    where: { user_id: userId, consumed_at: null },
    data: { consumed_at: at },
  });
}
