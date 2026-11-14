import { validateConfig } from "@lamu/runtime";
import { createIdentityApp } from "./app";
async function main() {
  const config = validateConfig(process.env, "identity");
  const app = await createIdentityApp(config);
  await app.listen(config.port, "0.0.0.0");
}
main().catch(() => {
  process.stderr.write(
    "Identity startup failed; check configuration and dependencies\n",
  );
  process.exitCode = 1;
});
