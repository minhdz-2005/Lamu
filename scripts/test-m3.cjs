// Dedicated Compose project and volumes. Never reads .env or touches demo resources.
const { spawnSync } = require("node:child_process");
const { randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const amqp = require("amqplib");
const { Pool } = require("pg");
const project = "lamu-m3-test-" + Date.now();
const composeOnly = process.argv.includes("--compose-only");
const dir = "services/identity-service/report/M3_P7_RUN_" + project;
fs.mkdirSync(dir, { recursive: false });
const env = {
  ...process.env,
  JWT_SECRET: randomBytes(48).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  RABBITMQ_USER: "m3test",
  RABBITMQ_PASSWORD: randomBytes(24).toString("hex"),
  GATEWAY_PORT: "0",
  RABBITMQ_MANAGEMENT_PORT: "0",
  APP_ENV: "local",
  JWT_ISSUER: "lamu-test",
  JWT_AUDIENCE: "test-client",
  RATE_LIMIT_MAX: "100000",
  AUTH_RATE_LIMIT_MAX: "100000",
  M3_EVIDENCE_DIR: dir,
};
const args = [
  "compose",
  "--env-file",
  ".env.example",
  "-p",
  project,
  "-f",
  "docker-compose.yml",
  "-f",
  "tests/m3-compose.yml",
  "--profile",
  "m3",
];
function docker(argv) {
  const r = spawnSync("docker", argv, {
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error("Docker action failed: " + r.stderr);
  return r.stdout.trim();
}
const compose = (more) => docker([...args, ...more]);
function refreshPorts() {
  const dbPort = compose(["port", "identity-db", "5432"]).split(":").pop();
  const rabbitPort = compose(["port", "rabbitmq", "5672"]).split(":").pop();
  env.DATABASE_URL = `postgresql://lumasoa:${env.POSTGRES_PASSWORD}@127.0.0.1:${dbPort}/identity_db`;
  env.M3_RABBIT_URL = `amqp://${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}@127.0.0.1:${rabbitPort}`;
}
function npm(argv, file) {
  const r = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath ||
        require("node:path").join(
          require("node:path").dirname(process.execPath),
          "node_modules/npm/bin/npm-cli.js",
        ),
      ...argv,
    ],
    { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  fs.writeFileSync(dir + "/" + file, (r.stdout || "") + (r.stderr || ""));
  if (r.status !== 0) throw Error("npm failed; see " + dir + "/" + file);
}
async function broker() {
  for (let n = 0; n < 100; n++) {
    try {
      const c = await amqp.connect(env.M3_RABBIT_URL, { timeout: 1000 });
      c.on("error", () => {});
      return c;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw Error("Isolated RabbitMQ startup timeout");
}
async function lifecycle() {
  const {
    EXCHANGE,
    QUEUE,
    ROUTES,
  } = require("../services/identity-service/dist/messaging/event-contract");
  const cases = [];
  const lifecycleQueue = "identity.m3.lifecycle.v1";
  for (const mode of ["restart", "recreate", "down-up"]) {
    const connection = await broker();
    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(lifecycleQueue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: { "x-queue-type": "classic" },
    });
    await channel.bindQueue(lifecycleQueue, EXCHANGE, ROUTES.UserRegistered);
    const body = {
      ...JSON.parse(
        fs.readFileSync(
          "shared/contracts/events/fixtures/user-registered.v1.json",
          "utf8",
        ),
      ),
      event_id: randomUUID(),
    };
    await new Promise((resolve, reject) =>
      channel.publish(
        EXCHANGE,
        ROUTES.UserRegistered,
        Buffer.from(JSON.stringify(body)),
        { messageId: body.event_id, persistent: true, mandatory: true },
        (err) => (err ? reject(err) : resolve()),
      ),
    );
    await connection.close();
    const before = compose(["ps", "-q", "rabbitmq"]);
    const mountBefore = JSON.parse(
      docker(["inspect", before, "--format", "{{json .Mounts}}"]),
    ).find((x) => x.Destination === "/var/lib/rabbitmq").Name;
    if (mode === "restart") compose(["restart", "rabbitmq"]);
    if (mode === "recreate")
      compose(["up", "-d", "--no-deps", "--force-recreate", "rabbitmq"]);
    if (mode === "down-up") {
      compose(["down", "--remove-orphans"]);
      compose([
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
        "rabbitmq",
        "identity-db",
      ]);
    }
    refreshPorts();
    const next = await broker();
    const ch = await next.createChannel();
    const message = await ch.get(lifecycleQueue, { noAck: false });
    assert.ok(message);
    assert.equal(message.properties.messageId, body.event_id);
    assert.deepEqual(JSON.parse(message.content), body);
    ch.ack(message);
    await ch.checkQueue(lifecycleQueue);
    await next.close();
    const after = compose(["ps", "-q", "rabbitmq"]);
    const mountAfter = JSON.parse(
      docker(["inspect", after, "--format", "{{json .Mounts}}"]),
    ).find((x) => x.Destination === "/var/lib/rabbitmq").Name;
    assert.equal(mountAfter, mountBefore);
    if (mode !== "restart") assert.notEqual(before, after);
    cases.push({
      case: mode,
      queue: lifecycleQueue,
      expected: "same persistent message ID/body and named volume/node survive",
      actual: "PASS",
      event_id: body.event_id,
      before,
      after,
      volume: mountAfter,
      node: compose([
        "exec",
        "-T",
        "rabbitmq",
        "rabbitmqctl",
        "eval",
        "node().",
      ]),
    });
    fs.writeFileSync(
      dir + "/lifecycle.json",
      JSON.stringify(cases, null, 2) + "\n",
    );
  }
}
(async () => {
  try {
    console.log("M3 isolated project " + project + "; artifacts " + dir);
    fs.writeFileSync(
      dir + "/startup.txt",
      compose([
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
        "identity-db",
        "rabbitmq",
      ]),
    );
    const port = compose(["port", "identity-db", "5432"]).split(":").pop();
    const rabbitPort = compose(["port", "rabbitmq", "5672"]).split(":").pop();
    env.DATABASE_URL = `postgresql://lumasoa:${env.POSTGRES_PASSWORD}@127.0.0.1:${port}/identity_db`;
    env.M3_RABBIT_URL = `amqp://${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}@127.0.0.1:${rabbitPort}`;
    const versions = {
      project,
      mode: composeOnly ? "compose-only" : "full",
      recorded_at_utc: new Date().toISOString(),
      node: process.version,
      images: [],
      broker_version: compose([
        "exec",
        "-T",
        "rabbitmq",
        "rabbitmqctl",
        "version",
      ]),
      node_identity: compose([
        "exec",
        "-T",
        "rabbitmq",
        "rabbitmqctl",
        "eval",
        "node().",
      ]),
    };
    for (const svc of ["rabbitmq", "identity-db"])
      versions.images.push({
        service: svc,
        image: docker([
          "inspect",
          compose(["ps", "-q", svc]),
          "--format",
          "{{.Image}}",
        ]),
      });
    fs.writeFileSync(
      dir + "/versions.json",
      JSON.stringify(versions, null, 2) + "\n",
    );
    npm(["run", "db:deploy", "-w", "@lamu/identity"], "migrate.txt");
    npm(["run", "db:seed", "-w", "@lamu/identity"], "seed.txt");
    if (!composeOnly)
      npm(
        [
          "test",
          "--",
          "--coverage",
          "--testMatch",
          "**/tests/**/*.spec.ts",
          "**/tests/**/*.spec.cjs",
          "**/tests/m3-broker.integration.cjs",
        ],
        "regression.txt",
      );
    if (!composeOnly) {
      await lifecycle();
      console.log(
        "PASS: full regression and independent restart/recreate/down-up",
      );
    } else
      console.log(
        "Compose-only: regression/lifecycle not run in this invocation",
      );
    // Compose app flow runs after lifecycle, using the same preserved test DB.
    fs.writeFileSync(
      dir + "/compose-build.txt",
      compose([
        "up",
        "--build",
        "-d",
        "--wait",
        "--wait-timeout",
        "180",
        "gateway",
        "identity-worker",
      ]),
    );
    const gateway = compose(["port", "gateway", "8080"]).split(":").pop();
    const base = "http://127.0.0.1:" + gateway;
    const send = async (path, body, token, key) => {
      const r = await fetch(base + "/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await r.json();
      assert.ok(r.ok, "HTTP " + r.status);
      return data;
    };
    const connection = await broker();
    await connection.close();
    compose(["stop", "rabbitmq"]);
    const account = {
      email: randomUUID() + "@synthetic.test",
      password: "SyntheticM3!2026",
      display_name: "M3 test",
    };
    const user = await send("/auth/register", account);
    const login = await send("/auth/login", {
      email: account.email,
      password: account.password,
    });
    const org = await send(
      "/organizations",
      { name: "M3 isolated", slug: "m3-" + randomUUID() },
      login.access_token,
      randomUUID(),
    );
    const sql = new Pool({ connectionString: env.DATABASE_URL });
    assert.equal(
      Number(
        (
          await sql.query(
            "SELECT count(*) FROM outbox_events WHERE status<>'SENT' AND (aggregate_id=$1 OR payload->>'organization_id'=$2)",
            [user.user_id, org.organization_id],
          )
        ).rows[0].count,
      ),
      3,
    );
    compose(["start", "rabbitmq"]);
    refreshPorts();
    let delivered = false;
    for (let n = 0; n < 160; n++) {
      if (
        Number(
          (
            await sql.query(
              "SELECT count(*) FROM outbox_events WHERE status='SENT' AND (aggregate_id=$1 OR payload->>'organization_id'=$2)",
              [user.user_id, org.organization_id],
            )
          ).rows[0].count,
        ) === 3
      ) {
        delivered = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(delivered, "Worker reconnect did not flush API backlog");
    const expectedIds = new Set(
      (
        await sql.query(
          "SELECT event_id FROM outbox_events WHERE aggregate_id=$1 OR payload->>'organization_id'=$2",
          [user.user_id, org.organization_id],
        )
      ).rows.map((x) => x.event_id),
    );
    assert.equal(expectedIds.size, 3);
    const c = await broker();
    const ch = await c.createChannel();
    const bodies = [];
    let backlogObserved = 0;
    for (let n = 0; n < 2000; n++) {
      const m = await ch.get("identity.m3.delivery.v1", { noAck: false });
      if (!m) break;
      const body = JSON.parse(m.content);
      assert.equal(m.properties.messageId, body.event_id);
      if (expectedIds.has(body.event_id)) bodies.push(body);
      else backlogObserved++;
      ch.ack(m);
    }
    assert.equal(new Set(bodies.map((x) => x.event_id)).size, 3);
    await c.close();
    const apiState = {
      user_id: user.user_id,
      organization_id: org.organization_id,
      received_ids: bodies.map((x) => x.event_id),
      earlier_backlog_messages_received: backlogObserved,
      expected:
        "API commits user/org and 3 outbox records offline; worker reconnect delivers all",
      actual: "PASS",
      worker_image: docker([
        "inspect",
        compose(["ps", "-q", "identity-worker"]),
        "--format",
        "{{.Image}}",
      ]),
      app_images: Object.fromEntries(
        ["gateway", "identity-service", "identity-worker"].map((svc) => [
          svc,
          docker([
            "inspect",
            compose(["ps", "-q", svc]),
            "--format",
            "{{.Image}}",
          ]),
        ]),
      ),
      runtime_node: compose([
        "exec",
        "-T",
        "identity-worker",
        "node",
        "--version",
      ]),
      topology: {
        queues: compose([
          "exec",
          "-T",
          "rabbitmq",
          "rabbitmqctl",
          "list_queues",
          "name",
          "durable",
          "auto_delete",
          "messages",
        ]),
        exchanges: compose([
          "exec",
          "-T",
          "rabbitmq",
          "rabbitmqctl",
          "list_exchanges",
          "name",
          "type",
          "durable",
          "auto_delete",
        ]),
        bindings: compose([
          "exec",
          "-T",
          "rabbitmq",
          "rabbitmqctl",
          "list_bindings",
          "source_name",
          "destination_name",
          "routing_key",
        ]),
      },
    };
    fs.writeFileSync(
      dir + "/compose-flow.json",
      JSON.stringify(apiState, null, 2) + "\n",
    );
    await sql.end();
    const workerId = compose(["ps", "-q", "identity-worker"]);
    const stoppingAt = Date.now();
    compose(["stop", "identity-worker"]);
    const exitCode = Number(
      docker(["inspect", workerId, "--format", "{{.State.ExitCode}}"]),
    );
    assert.equal(exitCode, 0);
    fs.writeFileSync(
      dir + "/shutdown.json",
      JSON.stringify(
        {
          provider: "real Linux Compose worker SIGTERM",
          expected: "drain/close without forced kill, exit 0 within grace20s",
          actual: "PASS",
          exit_code: exitCode,
          elapsed_ms: Date.now() - stoppingAt,
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      dir + "/worker-logs.txt",
      compose(["logs", "--no-color", "identity-worker"]),
    );
    console.log(
      "PASS: API offline commits, worker reconnect and real Compose delivery",
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    try {
      compose(["down", "--remove-orphans"]);
      console.log(
        "Stopped isolated project; named volumes retained for evidence: " +
          project,
      );
    } catch {
      process.exitCode = 1;
    }
  }
})();
