import { createEventApp } from "./app";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig(process.env);
  const app = await createEventApp(config);
  await app.listen(config.port, "0.0.0.0");
  process.stdout.write(`Event Service listening on :${config.port}\n`);
}

main().catch((error: unknown) => {
  // Print only the message: a config error must never echo DATABASE_URL.
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`Event startup failed: ${message}\n`);
  process.exitCode = 1;
});
