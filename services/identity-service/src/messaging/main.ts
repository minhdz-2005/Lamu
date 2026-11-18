import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { MessagingModule } from "./messaging.module";
import { workerConfig } from "./config";
import { OutboxWorker } from "./outbox.worker";

async function main() {
  const app = await NestFactory.createApplicationContext(
    MessagingModule.register(workerConfig(process.env)),
    { logger: false, abortOnError: false },
  );
  const worker = app.get(OutboxWorker);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    // Process-level deadline also bounds a hung broker close handshake. The
    // unresolved attempt remains recoverable by lease; never synthesize SENT.
    const deadline = setTimeout(() => process.exit(1), 18000);
    deadline.unref();
    await worker.onApplicationShutdown();
    await app.close();
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(
      signal,
      () =>
        void close().catch(() => {
          process.exitCode = 1;
        }),
    );
  worker.start();
}
void main().catch(() => {
  process.stderr.write(
    '{"event":"outbox_startup_failed","code":"INVALID_CONFIG_OR_DATABASE"}\n',
  );
  process.exitCode = 1;
});
