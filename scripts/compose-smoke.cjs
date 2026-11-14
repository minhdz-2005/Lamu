const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");
const project = "lamu-m1-smoke-" + Date.now();
const env = {
  ...process.env,
  JWT_SECRET: randomBytes(48).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  GATEWAY_PORT: "0",
};
function docker(args) {
  const r = spawnSync("docker", args, {
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error("Docker command failed: " + r.stderr);
  return r.stdout.trim();
}
const args = [
  "compose",
  "--env-file",
  ".env.example",
  "-p",
  project,
  "--profile",
  "m1",
];
function compose(more) {
  return docker([...args, ...more]);
}
(async () => {
  try {
    console.log("Starting isolated Compose project " + project);
    console.log(
      compose([
        "up",
        "--build",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
        "gateway",
      ]),
    );
    const port = compose(["port", "gateway", "8080"]).split(":").pop();
    let base = "http://127.0.0.1:" + port;
    assert.equal((await fetch(base + "/healthz")).status, 200);
    assert.equal((await fetch(base + "/readyz")).status, 200);
    const inside = compose([
      "exec",
      "-T",
      "identity-service",
      "node",
      "-e",
      "fetch('http://localhost:8080/readyz').then(r=>{if(!r.ok)process.exit(1);console.log('identity ready')})",
    ]);
    console.log(inside);
    for (const service of ["identity-service", "gateway"]) {
      compose([
        "exec",
        "-T",
        service,
        "node",
        "-e",
        "const fs=require('node:fs');if(fs.existsSync('/app/node_modules/jest')||fs.existsSync('/app/node_modules/tsx'))process.exit(1)",
      ]);
    }
    console.log("PASS: Jest/tsx absent from application runtime images");
    for (const service of ["identity-service", "identity-db"]) {
      const id = compose(["ps", "-q", service]);
      const ports = JSON.parse(docker(["inspect", id]))[0].NetworkSettings
        .Ports;
      assert.ok(
        Object.values(ports).every((v) => v === null),
        "Internal service published a host port",
      );
    }
    const sql = (query) =>
      compose([
        "exec",
        "-T",
        "identity-db",
        "psql",
        "-U",
        env.POSTGRES_USER || "lumasoa",
        "-d",
        "identity_db",
        "-At",
        "-c",
        query,
      ]);
    const snapshot = () =>
      sql(
        "SELECT json_build_object('users',(SELECT json_agg(json_build_array(id,email,password_hash)) FROM users),'sessions',(SELECT json_agg(json_build_array(id,user_id,token_hash,expires_at,revoked_at)) FROM refresh_sessions),'outbox',(SELECT json_agg(json_build_array(event_id,aggregate_id,payload,status)) FROM outbox_events))",
      );
    const send = async (path, body, token) => {
      const res = await fetch(base + "/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: res.status, body: await res.json() };
    };
    const input = {
      email: "smoke-" + Date.now() + "@example.test",
      password: "SyntheticPassword!2026",
      display_name: "Smoke",
    };
    const registered = await send("/auth/register", input);
    assert.equal(registered.status, 200);
    const A = await send("/auth/login", {
        email: input.email,
        password: input.password,
      }),
      B = await send("/auth/login", {
        email: input.email,
        password: input.password,
      });
    assert.equal(A.status, 200);
    assert.equal(B.status, 200);
    assert.equal(
      (await send("/users/me", null, A.body.access_token)).body.id,
      registered.body.user_id,
    );
    assert.equal(
      (
        await send(
          "/auth/logout",
          { refresh_token: B.body.refresh_token },
          A.body.access_token,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await send(
          "/auth/logout",
          { refresh_token: A.body.refresh_token },
          A.body.access_token,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await send(
          "/auth/logout",
          { refresh_token: A.body.refresh_token },
          A.body.access_token,
        )
      ).status,
      200,
    );
    assert.equal(
      (await send("/auth/refresh", { refresh_token: A.body.refresh_token }))
        .status,
      401,
    );
    const rotation = await send("/auth/refresh", {
      refresh_token: B.body.refresh_token,
    });
    assert.equal(rotation.status, 200);
    const original = snapshot();
    compose(["run", "--rm", "--no-deps", "identity-migrate"]);
    assert.ok(snapshot() === original, "Migration redeploy changed data");
    compose(["restart", "identity-db", "identity-service", "gateway"]);
    base =
      "http://127.0.0.1:" +
      compose(["port", "gateway", "8080"]).split(":").pop();
    async function ready() {
      for (let i = 0; i < 100; i++) {
        try {
          if (
            (
              await fetch(base + "/readyz", {
                signal: AbortSignal.timeout(3000),
              })
            ).ok
          )
            return;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      throw Error(
        "Applications did not become ready after intentional restart",
      );
    }
    await ready();
    assert.ok(snapshot() === original, "Restart changed users/sessions/outbox");
    assert.equal(
      (
        await send("/auth/refresh", {
          refresh_token: rotation.body.refresh_token,
        })
      ).status,
      200,
    );
    compose([
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "APP_ENV=local",
      "identity-migrate",
      "npm",
      "run",
      "db:seed",
      "-w",
      "@lamu/identity",
    ]);
    const seedSnapshot = snapshot();
    compose([
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "APP_ENV=local",
      "identity-migrate",
      "npm",
      "run",
      "db:seed",
      "-w",
      "@lamu/identity",
    ]);
    assert.ok(
      snapshot() === seedSnapshot,
      "Second seed changed users/sessions/outbox",
    );
    console.log(
      "PASS: full container auth flow; migrate redeploy/restart preserve IDs/hashes/sessions/backlog; seed twice preserves state",
    );
    compose(["stop", "identity-db"]);
    assert.equal((await fetch(base + "/healthz")).status, 200);
    assert.equal((await fetch(base + "/readyz")).status, 503);
    const downReady = compose([
      "exec",
      "-T",
      "identity-service",
      "node",
      "-e",
      "Promise.all([fetch('http://localhost:8080/healthz'),fetch('http://localhost:8080/readyz')]).then(([a,b])=>{if(a.status!==200||b.status!==503)process.exit(1);console.log('PASS: Identity liveness 200/readiness 503 during intentional DB outage')})",
    ]);
    console.log(downReady);
    compose(["start", "identity-db"]);
    await ready();
    const image = JSON.parse(
      docker(["inspect", compose(["ps", "-a", "-q", "identity-migrate"])]),
    )[0].Config.Image;
    const bench = docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--cpus",
      "2",
      "--memory",
      "256m",
      image,
      "npm",
      "run",
      "benchmark",
      "-w",
      "@lamu/identity",
    ]);
    require("node:fs").writeFileSync(
      "services/identity-service/report/M1_ARGON2_BASELINE_01.txt",
      "Container limits: cpus=2, memory=256m; image Node 24.19.0-bookworm-slim\n" +
        bench +
        "\n",
    );
    console.log("PASS: Argon2 container baseline recorded (no SLA assertion)");
    const evidence = {
      project,
      completed_at: new Date().toISOString(),
      postgres: sql("SELECT version()"),
      images: Object.fromEntries(
        ["identity-db", "identity-service", "gateway", "identity-migrate"].map(
          (service) => [
            service,
            JSON.parse(
              docker(["inspect", compose(["ps", "-a", "-q", service])]),
            )[0].Image,
          ],
        ),
      ),
      checks: [
        "apps healthy",
        "migration deploy and redeploy",
        "internal ports unpublished",
        "full auth/profile/rotation/logout flow",
        "restart persistence",
        "seed twice",
        "DB outage/recovery",
        "Argon2 baseline",
        "Jest/tsx absent from runtimes",
      ],
      scope: "isolated synthetic Compose project; no RabbitMQ/frontend/Event",
    };
    require("node:fs").writeFileSync(
      "services/identity-service/report/M1_COMPOSE_EVIDENCE_01.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(
      "PASS: app health, database readiness, migration one-shot, no Identity/DB host ports; RabbitMQ not started",
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (!/^lamu-m1-smoke-\d+$/.test(project))
      throw Error("Invalid cleanup project");
    console.log(compose(["down", "-v", "--remove-orphans"]));
  }
})();
