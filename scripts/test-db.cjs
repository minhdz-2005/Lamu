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
  let mailStarted = false;
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
    if (process.argv.includes("--cloudinary-smoke")) {
      const configured = require("node:util").parseEnv(
        require("node:fs").readFileSync(".env", "utf8"),
      );
      for (const key of [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "CLOUDINARY_AVATAR_UPLOAD_PRESET",
        "CLOUDINARY_ORG_COVER_UPLOAD_PRESET",
        "CLOUDINARY_ASSET_PREFIX",
      ])
        env[key] = configured[key];
      env.REAL_CLOUDINARY_SMOKE = "1";
    }
    if (process.argv.includes("--security")) {
      run("docker", [
        "run",
        "-d",
        "--name",
        name + "-mail",
        "-p",
        "127.0.0.1::1025",
        "-p",
        "127.0.0.1::8025",
        "axllent/mailpit:v1.27.10",
      ]);
      mailStarted = true;
      env.SMTP_HOST = "127.0.0.1";
      env.SMTP_PORT = run("docker", ["port", name + "-mail", "1025/tcp"])
        .split(":")
        .pop();
      env.MAILPIT_URL =
        "http://127.0.0.1:" +
        run("docker", ["port", name + "-mail", "8025/tcp"])
          .split(":")
          .pop();
      env.SMTP_SECURE = "false";
      env.SMTP_USER = "";
      env.SMTP_PASSWORD = "";
      env.MAIL_FROM = "Lamu Test <security@lamu.test>";
      env.MAIL_JOB_ENCRYPTION_KEY = randomBytes(32).toString("hex");
      env.PASSWORD_RESET_OTP_HMAC_KEY = randomBytes(32).toString("hex");
    }
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
    if (args.includes("--schema-check"))
      run(
        "npm",
        [
          "exec",
          "-w",
          "@lamu/identity",
          "--",
          "prisma",
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          "prisma/schema.prisma",
          "--exit-code",
        ],
        env,
      );
    if (seed) {
      run("npm", ["run", "db:seed", "-w", "@lamu/identity"], env);
      run("npm", ["run", "db:seed", "-w", "@lamu/identity"], env);
    }
    run(
      "npm",
      [
        "test",
        "--",
        ...args.filter(
          (a) =>
            ![
              "--migrate",
              "--seed",
              "--security",
              "--cloudinary-smoke",
              "--schema-check",
            ].includes(a),
        ),
      ],
      env,
    );
  } catch (e) {
    process.stderr.write(e.message + "\n");
    process.exitCode = 1;
  } finally {
    if (mailStarted) run("docker", ["rm", "-f", name + "-mail"]);
    if (started) run("docker", ["rm", "-f", name]);
  }
})();
