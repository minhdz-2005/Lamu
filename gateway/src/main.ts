import { validateConfig } from "@lamu/runtime";
import { createGatewayApp } from "./app";
async function main() {
  const config = validateConfig(process.env, "gateway");
  const app = await createGatewayApp(config);
  await app.listen(config.port, "0.0.0.0");
}
main().catch(() => {
  process.stderr.write(
    "Gateway startup failed; check configuration and dependencies\n",
  );
  process.exitCode = 1;
});
