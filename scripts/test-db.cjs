// Isolated disposable DB; never targets the Compose/demo volumes.
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const name = "lamu-m1-test-" + Date.now();
function run(bin, args, env = process.env) {
  const command = bin === "npm" ? process.execPath : bin;
  const argv =
    bin === "npm"
      ? [
          process.env.npm_execpath ||
            require("node:path").join(
              require("node:path").dirname(process.execPath),
              "node_modules/npm/bin/npm-cli.js",
            ),
          ...args,
        ]
      : args;
  const r = spawnSync(command, argv, { env, encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(bin + " exited " + r.status);
  return r.stdout.trim();
}
(async () => {
  let started = false;
  try {
    const password = randomBytes(24).toString("hex");
    run("docker", [
      "run",
      "-d",
      "--name",
      name,
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-e",
      "POSTGRES_DB=identity_test",
      "-e",
      "POSTGRES_USER=identity_test",
      "-e",
      "POSTGRES_PASSWORD=" + password,
      "-p",
      "127.0.0.1::5432",
      "postgres:16-alpine",
    ]);
    started = true;
    const port = run("docker", ["port", name, "5432/tcp"]).split(":").pop();
    const env = {
      ...process.env,
      DATABASE_URL:
        "postgresql://identity_test:" +
        password +
        "@127.0.0.1:" +
        port +
        "/identity_test",
      JWT_SECRET: randomBytes(48).toString("hex"),
      JWT_ISSUER: "lamu-test",
      JWT_AUDIENCE: "test-client",
      APP_ENV: "local",
      RATE_LIMIT_MAX: "100000",
      AUTH_RATE_LIMIT_MAX: "100000",
    };
    const db = new Pool({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 1000,
    });
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        await db.query("SELECT 1");
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await db.end();
    if (!ready) throw new Error("Test database startup failed");
    const args = process.argv.slice(2);
    const migrate = args.includes("--migrate");
    const seed = args.includes("--seed");
    if (migrate) run("npm", ["run", "db:deploy", "-w", "@lamu/identity"], env);
    if (seed) {
      run("npm", ["run", "db:seed", "-w", "@lamu/identity"], env);
      run("npm", ["run", "db:seed", "-w", "@lamu/identity"], env);
    }
    run(
      "npm",
      [
        "test",
        "--",
        ...args.filter((a) => !["--migrate", "--seed"].includes(a)),
      ],
      env,
    );
  } catch (e) {
    process.stderr.write(e.message + "\n");
    process.exitCode = 1;
  } finally {
    if (started) run("docker", ["rm", "-f", name]);
  }
})();
