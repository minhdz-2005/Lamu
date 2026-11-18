const { spawnSync } = require("node:child_process");
const { randomBytes, randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const project = "lamu-security-test-" + Date.now();
const env = {
  ...process.env,
  ...require("./security-test-env.cjs")(),
  JWT_SECRET: randomBytes(48).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  APP_ENV: "local",
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
  "tests/media-recovery-compose.yml",
  "--profile",
  "m1",
];
function compose(more) {
  const r = spawnSync("docker", [...args, ...more], {
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error("Isolated Compose action failed: " + r.stderr);
  return r.stdout.trim();
}
async function main() {
  try {
    console.log("Starting isolated recovery Compose project " + project);
    compose([
      "up",
      "--build",
      "-d",
      "--wait",
      "--wait-timeout",
      "180",
      "gateway",
      "identity-mail-worker",
      "identity-media-cleanup-worker",
      "mailpit",
    ]);
    const base =
      "http://127.0.0.1:" +
      compose(["port", "gateway", "8080"]).split(":").pop();
    const mailbox =
      "http://127.0.0.1:" +
      compose(["port", "mailpit", "8025"]).split(":").pop();
    const services = compose(["ps", "--services", "--status", "running"]).split(
      /\r?\n/,
    );
    assert(!services.includes("rabbitmq"));
    assert(!services.some((s) => s.startsWith("notification")));
    async function post(path, body, status) {
      const r = await fetch(base + "/api/auth/" + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, status, path);
      return r.json();
    }
    const email = randomUUID() + "@test.example",
      password = "ComposePassword!2026";
    await post(
      "register",
      { email, password, display_name: "Compose synthetic" },
      200,
    );
    const login = await post("login", { email, password }, 200);
    compose(["stop", "identity-mail-worker"]);
    await post("forgot-password", { email }, 202);
    compose(["start", "identity-mail-worker"]);
    let otp;
    for (let n = 0; n < 60; n++) {
      const list = await (await fetch(mailbox + "/api/v1/messages")).json();
      const msg = list.messages?.find((m) =>
        m.To.some((t) => t.Address === email),
      );
      if (msg) {
        const detail = await (
          await fetch(mailbox + "/api/v1/message/" + msg.ID)
        ).json();
        otp = detail.Text.match(/\b\d{6}\b/)?.[0];
        if (otp) break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    assert(otp, "mail worker restart must deliver pending OTP");
    const verified = await post("verify-reset-code", { email, code: otp }, 200);
    await post(
      "reset-password",
      {
        reset_token: verified.reset_token,
        new_password: "ChangedCompose!2026",
      },
      200,
    );
    await post("login", { email, password }, 401);
    await post("login", { email, password: "ChangedCompose!2026" }, 200);
    const stale = await fetch(base + "/api/users/me", {
      headers: { authorization: "Bearer " + login.access_token },
    });
    assert.equal(stale.status, 401);
    compose(["restart", "identity-service"]);
    for (let n = 0; n < 60; n++) {
      try {
        if ((await fetch(base + "/readyz")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    await post("login", { email, password: "ChangedCompose!2026" }, 200);
    console.log(
      "PASS: container Gateway recovery + Mailpit; mail worker restart, API restart, revoked sessions; no RabbitMQ/Notification",
    );
  } finally {
    compose(["down", "-v", "--remove-orphans"]);
  }
}
main().catch((error) => {
  let message = String(error.message);
  for (const value of Object.values(env))
    if (typeof value === "string" && value.length > 6)
      message = message.replaceAll(value, "[redacted]");
  console.error("Recovery Compose acceptance FAILED: " + message.slice(-3000));
  process.exitCode = 1;
});
