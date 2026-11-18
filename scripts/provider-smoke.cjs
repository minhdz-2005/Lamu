// Explicit manual smoke only. Never called from npm test or CI.
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const nodemailer = require("nodemailer");
async function main() {
  if (process.argv[2] !== "gmail")
    throw new Error("Use provider-smoke.cjs gmail");
  const env = parseEnv(fs.readFileSync(".env", "utf8"));
  if (
    env.SMTP_HOST !== "smtp.gmail.com" ||
    env.SMTP_PORT !== "465" ||
    env.SMTP_SECURE !== "true" ||
    !env.SMTP_USER ||
    !env.SMTP_PASSWORD ||
    !env.MAIL_FROM
  )
    throw new Error("Invalid Gmail configuration");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    await transport.verify();
    console.log("Gmail TLS/authentication: PASS");
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: env.SMTP_USER,
      subject: "[Lamu TEST] Backend SMTP smoke test",
      text: "This is one authorized Lamu backend test email sent to the SMTP account itself. No action is required. This email contains no password, OTP, or personal data.",
    });
    console.log(
      JSON.stringify({
        smtpAccepted:
          Array.isArray(info.accepted) && info.accepted.length === 1,
        rejectedCount: info.rejected?.length ?? 0,
        inboxConfirmed: false,
      }),
    );
  } finally {
    transport.close();
  }
}
main().catch(() => {
  console.error("Gmail smoke FAILED (provider details redacted)");
  process.exitCode = 1;
});
