// Configuration preflight only: never prints values, sends mail or mutates providers.
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");

function validate(env) {
  const errors = [];
  const warnings = [];
  const required = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "CLOUDINARY_AVATAR_UPLOAD_PRESET",
    "CLOUDINARY_ORG_COVER_UPLOAD_PRESET",
    "CLOUDINARY_ASSET_PREFIX",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "MAIL_FROM",
    "PASSWORD_RESET_OTP_HMAC_KEY",
    "MAIL_JOB_ENCRYPTION_KEY",
  ];
  for (const key of required) {
    if (!env[key]?.trim()) errors.push(`${key}: missing`);
  }
  for (const key of [
    "PASSWORD_RESET_OTP_HMAC_KEY",
    "MAIL_JOB_ENCRYPTION_KEY",
  ]) {
    if (!/^[a-f\d]{64}$/i.test(env[key] || ""))
      errors.push(`${key}: expected 32 bytes encoded as 64 hex characters`);
  }
  if (
    env.PASSWORD_RESET_OTP_HMAC_KEY &&
    env.PASSWORD_RESET_OTP_HMAC_KEY.toLowerCase() ===
      env.MAIL_JOB_ENCRYPTION_KEY?.toLowerCase()
  ) {
    errors.push("Recovery keys must be independent");
  }
  for (const key of [
    "PASSWORD_RESET_OTP_HMAC_KEY",
    "MAIL_JOB_ENCRYPTION_KEY",
  ]) {
    if (env[key] && env[key] === env.JWT_SECRET)
      errors.push(`${key}: must not reuse JWT_SECRET`);
  }
  for (const key of [
    "MEDIA_UPLOAD_INTENT_TTL_SECONDS",
    "AVATAR_MAX_BYTES",
    "ORG_COVER_MAX_BYTES",
    "PASSWORD_RESET_OTP_TTL_SECONDS",
    "PASSWORD_RESET_TOKEN_TTL_SECONDS",
    "PASSWORD_RESET_MAX_ATTEMPTS",
    "PASSWORD_RESET_RESEND_COOLDOWN_SECONDS",
    "PASSWORD_RESET_EMAIL_HOURLY_LIMIT",
    "PASSWORD_RESET_IP_HOURLY_LIMIT",
    "SMTP_PORT",
  ]) {
    if (
      !/^\d+$/.test(env[key] || "") ||
      !Number.isSafeInteger(Number(env[key])) ||
      Number(env[key]) <= 0
    ) {
      errors.push(`${key}: expected a positive integer`);
    }
  }
  if (Number(env.SMTP_PORT) > 65535)
    errors.push("SMTP_PORT: outside valid port range");
  if (!["true", "false"].includes(env.SMTP_SECURE))
    errors.push("SMTP_SECURE: expected true or false");
  const from = env.MAIL_FROM?.trim() || "";
  const address = from.includes("<")
    ? from.match(/^[^<>\r\n]*<([^<>\r\n]+)>$/)?.[1]
    : from;
  if (
    !address ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ||
    /[\r\n]/.test(from)
  ) {
    errors.push("MAIL_FROM: invalid mailbox syntax");
  }
  if (env.SMTP_HOST === "smtp.gmail.com") {
    if (env.SMTP_PORT !== "465" || env.SMTP_SECURE !== "true")
      errors.push(
        "Gmail setup selected by this project requires port 465 and SMTP_SECURE=true",
      );
    if (address?.toLowerCase() !== env.SMTP_USER?.trim().toLowerCase()) {
      warnings.push(
        "MAIL_FROM differs from SMTP_USER: use the same Gmail address or verify the send-as alias before delivery testing",
      );
    }
  }
  return { errors, warnings };
}

if (require.main === module) {
  try {
    const env = parseEnv(
      fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8"),
    );
    const result = validate(env);
    for (const error of result.errors) console.error(`FAIL ${error}`);
    for (const warning of result.warnings) console.warn(`WARN ${warning}`);
    console.log(
      `Configuration: ${result.errors.length} error(s), ${result.warnings.length} warning(s). No connection or feature test performed.`,
    );
    process.exitCode = result.errors.length ? 1 : 0;
  } catch {
    console.error("Cannot read/parse root .env; no values printed.");
    process.exitCode = 1;
  }
}
module.exports = { validate };
