import { createDatabase } from "../database";
import { mailConfig } from "./config";
import { SecurityMailWorker, SmtpSecurityMailSender } from "./mail.worker";
async function main() {
  const config = mailConfig(process.env),
    db = createDatabase(config.databaseUrl),
    sender = new SmtpSecurityMailSender(config),
    worker = new SecurityMailWorker(db, config, sender);
  let stopping = false,
    lastMetrics = 0;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopping = true;
    });
  try {
    while (!stopping) {
      try {
        await worker.tick(() => stopping);
        if (Date.now() - lastMetrics > 30000) {
          const rows = await db.$queryRaw<
            Array<{ status: string; count: number; oldest_age_seconds: number }>
          >`SELECT status,count(*)::int AS count,COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(created_at)),0)::float8 AS oldest_age_seconds FROM security_mail_jobs GROUP BY status`;
          process.stdout.write(
            JSON.stringify({ worker: "security-mail", queues: rows }) + "\n",
          );
          lastMetrics = Date.now();
        }
      } catch {
        process.stderr.write("Security mail poll failed; retrying\n");
      }
      if (!stopping) await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    sender.transport.close();
    await db.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write("Mail worker startup failed; check configuration\n");
  process.exitCode = 1;
});
