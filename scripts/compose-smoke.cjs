const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");
const p6 = process.argv.includes("--p6");
const evidenceRun =
  process.argv.find((a) => a.startsWith("--evidence-run="))?.split("=")[1] ??
  "01";
if (!/^[0-9]{2}$/.test(evidenceRun)) throw Error("Invalid evidence run suffix");
const p5 = process.argv.includes("--p5") || p6;
const project = "lamu-m1-smoke-" + Date.now();
const env = {
  ...process.env,
  ...require("./security-test-env.cjs")(),
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
        "SELECT json_build_object('users',(SELECT json_agg(json_build_array(id,email,password_hash) ORDER BY id) FROM users),'sessions',(SELECT json_agg(json_build_array(id,user_id,token_hash,expires_at,revoked_at) ORDER BY id) FROM refresh_sessions),'outbox',(SELECT json_agg(json_build_array(event_id,aggregate_id,payload,status) ORDER BY event_id) FROM outbox_events),'orgs',(SELECT json_agg(row_to_json(o) ORDER BY id) FROM organizations o),'members',(SELECT json_agg(row_to_json(m) ORDER BY id) FROM memberships m),'roles',(SELECT json_agg(row_to_json(r) ORDER BY id) FROM membership_roles r),'idempotency',(SELECT json_agg(row_to_json(i) ORDER BY id) FROM idempotency_records i),'invitations',(SELECT json_agg(row_to_json(i) ORDER BY id) FROM organization_invitations i))",
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
    if (p5) {
      const key = "compose-p5-create",
        input = { name: "Compose P5", slug: "compose-p5" };
      const post = () =>
        fetch(base + "/api/organizations", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: "Bearer " + rotation.body.access_token,
            "Idempotency-Key": key,
          },
          body: JSON.stringify(input),
        });
      const first = await post();
      assert.equal(first.status, 201);
      const created = await first.json();
      const replay = await post();
      assert.equal(replay.status, 201);
      assert.deepEqual(await replay.json(), created);
      const org = created.organization_id;
      assert.equal(
        (await send("/organizations/" + org, null, rotation.body.access_token))
          .status,
        200,
      );
      assert.equal(
        (
          await send(
            "/organizations/" + org + "/members?limit=1",
            null,
            rotation.body.access_token,
          )
        ).body.total,
        1,
      );
      assert.deepEqual((await send("/public/organizations/compose-p5")).body, {
        name: "Compose P5",
        slug: "compose-p5",
      });
      const roleKey = "compose-p5-role";
      const replace = (roles) =>
        fetch(
          base +
            `/api/organizations/${org}/members/${registered.body.user_id}/roles`,
          {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              Authorization: "Bearer " + rotation.body.access_token,
              "Idempotency-Key": roleKey,
            },
            body: JSON.stringify({ roles }),
          },
        );
      assert.equal(
        (
          await replace([
            { code: "OWNER", resource_type: "ORG", resource_id: org },
          ])
        ).status,
        200,
      );
      const blocked = await replace([]);
      assert.equal(blocked.status, 409);
      assert.equal((await blocked.json()).error.code, "CONFLICT");
      assert.equal(
        (
          await fetch(base + "/api/internal/authorization/check", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          })
        ).status,
        404,
      );
      const swagger = await (await fetch(base + "/docs-json")).json();
      assert.ok(
        !Object.keys(swagger.paths).some((p) => p.includes("/internal/")),
      );
      assert.equal(
        sql(
          "SELECT count(*) FROM outbox_events WHERE event_type IN ('OrganizationCreated','MembershipChanged')",
        ),
        "2",
      );
      console.log(
        "PASS: P5 real container create/replay/read/members/public/roles/no-op/conflict/outbox/internal isolation",
      );
    }
    if (p6) {
      const authToken = rotation.body.access_token;
      const recipientInput = {
        email: "p6-recipient-" + Date.now() + "@example.test",
        password: "SyntheticPassword!2026",
        display_name: "P6 recipient",
      };
      const recipient = await send("/auth/register", recipientInput);
      assert.equal(recipient.status, 200);
      const login = await send("/auth/login", {
        email: recipientInput.email,
        password: recipientInput.password,
      });
      assert.equal(login.status, 200);
      const command = async (path, body, token, key) => {
        const r = await fetch(base + "/api" + path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: "Bearer " + token,
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: await r.json() };
      };
      const org = sql("SELECT id FROM organizations WHERE slug='compose-p5'");
      const path = "/organizations/" + org + "/members/invitations";
      const created = await command(
        path,
        {
          email: recipientInput.email,
          roles: [{ code: "ADMIN", resource_type: "ORG", resource_id: org }],
        },
        authToken,
        "p6-create",
      );
      assert.equal(created.status, 201);
      assert.deepEqual(
        await command(
          path,
          {
            email: recipientInput.email,
            roles: [{ code: "ADMIN", resource_type: "ORG", resource_id: org }],
          },
          authToken,
          "p6-create",
        ),
        created,
      );
      const list = await send(
        "/users/me/invitations",
        null,
        login.body.access_token,
      );
      assert.equal(list.status, 200);
      assert.equal(list.body.items[0].id, created.body.invitation_id);
      const acceptPath =
        "/users/me/invitations/" + created.body.invitation_id + "/accept";
      const accepted = await command(
        acceptPath,
        {},
        login.body.access_token,
        "p6-accept",
      );
      assert.equal(accepted.status, 200);
      assert.deepEqual(
        await command(acceptPath, {}, login.body.access_token, "p6-accept"),
        accepted,
      );
      const fresh = await command(
        acceptPath,
        {},
        login.body.access_token,
        "p6-new-key",
      );
      assert.equal(fresh.status, 409);
      assert.equal(fresh.body.error.code, "INVITATION_NOT_PENDING");
      const profile = await send("/users/me", null, login.body.access_token);
      assert.ok(
        profile.body.memberships.some(
          (m) => m.organization_id === org && m.roles.includes("ADMIN"),
        ),
      );
      assert.equal(
        sql(
          "SELECT count(*) FROM outbox_events WHERE event_type='MembershipChanged' AND payload->>'user_id'='" +
            recipient.body.user_id +
            "'",
        ),
        "1",
      );
      assert.equal(
        sql(
          "SELECT membership_revision FROM memberships WHERE id='" +
            accepted.body.membership_id +
            "'",
        ),
        "1",
      );
      for (const kind of ["decline", "revoke"]) {
        const input = {
          ...recipientInput,
          email: kind + "-" + Date.now() + "@example.test",
        };
        await send("/auth/register", input);
        const logged = await send("/auth/login", {
          email: input.email,
          password: input.password,
        });
        const invitation = await command(
          path,
          { email: input.email, roles: [] },
          authToken,
          "p6-" + kind + "-create",
        );
        assert.equal(invitation.status, 201);
        const action =
          kind === "decline"
            ? "/users/me/invitations/" +
              invitation.body.invitation_id +
              "/decline"
            : path + "/" + invitation.body.invitation_id + "/revoke";
        const done = await command(
          action,
          {},
          kind === "decline" ? logged.body.access_token : authToken,
          "p6-" + kind,
        );
        assert.equal(done.status, 200);
        assert.equal(done.body.status, kind.toUpperCase() + "D");
      }
      console.log(
        "PASS: P6 real Compose create/list/accept/replay/profile/decline/revoke, revision 1 and exactly one MembershipChanged",
      );
    }
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
      "services/identity-service/report/" +
        (p6
          ? `M2_P6_ARGON2_BASELINE_${evidenceRun}.txt`
          : p5
            ? "M2_P5_ARGON2_BASELINE_01.txt"
            : "M1_ARGON2_BASELINE_01.txt"),
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
        ...(p6
          ? [
              "P6 create/list/accept/replay/profile/decline/revoke",
              "P6 membership revision 1 and one MembershipChanged",
              "P6 invitation persistence across restart/redeploy",
            ]
          : []),
        ...(p5
          ? [
              "P5 create/replay/read/members/public/roles/no-op/conflict",
              "P5 revision/idempotency/org state persists across restart",
              "P5 internal routes absent from Gateway and Swagger",
            ]
          : []),
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
      "services/identity-service/report/" +
        (p6
          ? `M2_P6_COMPOSE_EVIDENCE_${evidenceRun}.json`
          : p5
            ? "M2_P5_COMPOSE_EVIDENCE_01.json"
            : "M1_COMPOSE_EVIDENCE_01.json"),
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
