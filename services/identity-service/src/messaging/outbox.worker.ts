import { type OnApplicationShutdown } from "@nestjs/common";
import { type Claim, OutboxRepository } from "./outbox.repository";
import { validEnvelope } from "./event-contract";
import { DeliveryError } from "./confirm.publisher";

export interface Publisher {
  readonly ready: boolean;
  ensure(): Promise<void>;
  publish(claim: Claim): Promise<void>;
  close(): Promise<void>;
}
export function retryDelay(attempt: number, random = Math.random): number {
  return Math.floor(
    Math.min(300000, 1000 * 2 ** Math.min(30, attempt - 1)) *
      (0.5 + random() * 0.5),
  );
}
export class OutboxWorker implements OnApplicationShutdown {
  private stopping = false;
  private running?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private reconnects = 0;
  private shutdown?: Promise<void>;
  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: Publisher,
    private readonly log: (entry: Record<string, unknown>) => void = () => {},
  ) {}
  start() {
    const tick = async () => {
      if (this.stopping) return;
      let delay = 1000;
      try {
        await this.runOnce();
        this.reconnects = 0;
      } catch {
        delay = Math.floor(
          Math.min(30000, 1000 * 2 ** Math.min(10, this.reconnects++)) *
            (0.5 + Math.random() * 0.5),
        );
        this.log({ event: "outbox_poll_failed", code: "WORKER_UNAVAILABLE" });
      }
      if (!this.stopping) this.timer = setTimeout(() => void tick(), delay);
    };
    void tick();
  }
  async runOnce(): Promise<void> {
    if (this.stopping) return;
    if (this.running) return this.running;
    const work = this.poll();
    this.running = work;
    try {
      await work;
    } finally {
      if (this.running === work) this.running = undefined;
    }
  }
  private async poll() {
    await this.publisher.ensure();
    if (this.stopping || !this.publisher.ready) return;
    const claims = await this.repository.claim(10, 60000);
    await Promise.all(
      claims.map(async (claim) => {
        try {
          if (!validEnvelope(claim.envelope)) {
            await this.repository.finish(claim, "PARKED", "INVALID_SCHEMA");
            return;
          }
          let outcome: "SENT" | "PENDING" | "PARKED" = "SENT";
          let code: string | null = null;
          try {
            await this.publisher.publish(claim);
          } catch (e) {
            code = e instanceof DeliveryError ? e.code : "PUBLISH_FAILED";
            outcome = claim.attempt_count >= 20 ? "PARKED" : "PENDING";
          }
          const owned = await this.repository.finish(
            claim,
            outcome,
            code,
            outcome === "PENDING" ? retryDelay(claim.attempt_count) : 0,
          );
          this.log({
            event: "outbox_attempt",
            event_id: claim.event_id,
            attempt_id: claim.claim_token,
            status: owned ? outcome : "OWNERSHIP_LOST",
            code,
          });
        } catch {
          this.log({
            event: "outbox_finalize_failed",
            event_id: claim.event_id,
            attempt_id: claim.claim_token,
            code: "DB_FINALIZE_FAILED",
          });
        }
      }),
    );
  }
  onApplicationShutdown(): Promise<void> {
    this.shutdown ??= this.drain();
    return this.shutdown;
  }
  private async drain() {
    this.stopping = true;
    clearTimeout(this.timer);
    let deadline: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.running ?? Promise.resolve(),
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 15000);
        }),
      ]);
    } finally {
      clearTimeout(deadline);
      await this.publisher.close();
    }
  }
}
