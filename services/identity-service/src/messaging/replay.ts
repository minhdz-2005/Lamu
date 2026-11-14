import { Pool } from "pg";
import { OutboxRepository } from "./outbox.repository";

export async function replayCli(
  args: string[],
  databaseUrl: string | undefined,
) {
  if (
    !databaseUrl ||
    args.length < 2 ||
    args.length > 3 ||
    (args[2] !== undefined && args[2] !== "--apply")
  )
    throw new Error(
      "Usage: replay <event_id> <reason> [--apply]; DATABASE_URL required",
    );
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    query_timeout: 3000,
  });
  try {
    const eligible = await new OutboxRepository(pool).replay(
      args[0],
      args[1],
      args[2] === "--apply",
    );
    return { eligible, applied: eligible && args[2] === "--apply" };
  } finally {
    await pool.end();
  }
}
if (require.main === module)
  void replayCli(process.argv.slice(2), process.env.DATABASE_URL)
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + "\n");
      if (!result.eligible) process.exitCode = 2;
    })
    .catch(() => {
      process.stderr.write(
        "Replay failed; use event_id, non-secret reason and optional --apply with DATABASE_URL\n",
      );
      process.exitCode = 1;
    });
