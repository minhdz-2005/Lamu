import { randomUUID } from "node:crypto";
import type { Database } from "../database";
import type { MediaCleanupJob } from "../generated/client";
import type { MediaProvider } from "./cloudinary";
export class MediaCleanupWorker {
  constructor(
    private readonly db: Database,
    private readonly provider: MediaProvider,
    private readonly prefix: string,
  ) {}
  async tick(stopping: () => boolean = () => false) {
    const owner = randomUUID();
    const jobs = await this.db.$queryRaw<
      MediaCleanupJob[]
    >`UPDATE media_cleanup_jobs SET status='RUNNING',lease_owner=${owner}::uuid,lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM media_cleanup_jobs WHERE (status='PENDING' AND next_attempt_at<=clock_timestamp() OR status='RUNNING' AND lease_until<clock_timestamp()) ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`;
    for (const job of jobs) {
      if (stopping()) break;
      try {
        const intent = await this.db.$transaction(async (tx) => {
          // Commit and cleanup contend on this row. Expiring intent makes cleanup irreversible.
          await tx.$queryRaw`SELECT id FROM media_upload_intents WHERE id=${job.intent_id}::uuid FOR UPDATE`;
          const i = await tx.mediaUploadIntent.findUniqueOrThrow({
            where: { id: job.intent_id },
          });
          const owned = await tx.mediaCleanupJob.updateMany({
            where: { id: job.id, lease_owner: owner },
            data: { lease_until: new Date(Date.now() + 60000) },
          });
          if (!owned.count) return null;
          if (i.state === "PENDING" && i.expires_at > new Date()) return null;
          if (i.asset_id) {
            const users = await tx.user.count({
                where: { avatar_asset_id: i.asset_id },
              }),
              orgs = await tx.organization.count({
                where: { cover_asset_id: i.asset_id },
              });
            if (users || orgs) return null;
            await tx.mediaAsset.update({
              where: { id: i.asset_id },
              data: { status: "DELETING" },
            });
          }
          if (i.state === "PENDING")
            await tx.mediaUploadIntent.update({
              where: { id: i.id },
              data: { state: "EXPIRED" },
            });
          return i;
        });
        if (!intent) {
          await this.defer(job.id, owner, 300000);
          continue;
        }
        if (!intent.expected_public_id.startsWith(this.prefix + "/"))
          throw new Error("NAMESPACE_MISMATCH");
        // Repeated destroy/not-found until signature window plus buffer closes, including late uploads.
        await this.provider.destroy(intent.expected_public_id);
        if (intent.asset_id)
          await this.db.mediaAsset.update({
            where: { id: intent.asset_id },
            data: { status: "DELETED" },
          });
        const done = intent.watch_until <= new Date();
        await this.db.mediaCleanupJob.updateMany({
          where: { id: job.id, lease_owner: owner },
          data: {
            status: done ? "DONE" : "PENDING",
            next_attempt_at: new Date(Date.now() + 60000),
            lease_owner: null,
            lease_until: null,
          },
        });
      } catch {
        await this.defer(
          job.id,
          owner,
          Math.min(3600000, 1000 * 2 ** Math.min(job.attempts, 12)),
        );
      }
    }
    return jobs.length;
  }
  private defer(id: string, owner: string, delay: number) {
    return this.db.mediaCleanupJob.updateMany({
      where: { id, lease_owner: owner },
      data: {
        status: "PENDING",
        next_attempt_at: new Date(
          Date.now() + delay + Math.floor(Math.random() * 1000),
        ),
        lease_owner: null,
        lease_until: null,
      },
    });
  }
}
