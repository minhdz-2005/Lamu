import { createDatabase } from "../database";
import { CloudinaryProvider, mediaConfig } from "./cloudinary";
import { MediaCleanupWorker } from "./cleanup.worker";
async function main() {
  const config = mediaConfig(process.env);
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  const db = createDatabase(process.env.DATABASE_URL),
    worker = new MediaCleanupWorker(
      db,
      new CloudinaryProvider(config),
      config.prefix,
    );
  let stopping = false,
    lastMetrics = 0;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      stopping = true;
    });
  try {
    while (!stopping) {
      try {
        await worker.tick(() => stopping);
        if (Date.now() - lastMetrics > 30000) {
          const backlog = await db.mediaCleanupJob.count({
            where: { status: { not: "DONE" } },
          });
          process.stdout.write(
            JSON.stringify({ worker: "media-cleanup", backlog }) + "\n",
          );
          lastMetrics = Date.now();
        }
      } catch {
        process.stderr.write("Media cleanup poll failed; retrying\n");
      }
      if (!stopping) await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write("Media cleanup startup failed; check configuration\n");
  process.exitCode = 1;
});
