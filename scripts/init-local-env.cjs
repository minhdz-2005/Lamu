const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const template = fs.readFileSync(".env.example", "utf8");
const value = template
  .replace(/^JWT_SECRET=.*$/m, "JWT_SECRET=" + randomBytes(48).toString("hex"))
  .replace(
    /^PASSWORD_RESET_OTP_HMAC_KEY=.*$/m,
    "PASSWORD_RESET_OTP_HMAC_KEY=" + randomBytes(32).toString("hex"),
  )
  .replace(
    /^MAIL_JOB_ENCRYPTION_KEY=.*$/m,
    "MAIL_JOB_ENCRYPTION_KEY=" + randomBytes(32).toString("hex"),
  )
  .replace(
    /^POSTGRES_PASSWORD=.*$/m,
    "POSTGRES_PASSWORD=" + randomBytes(24).toString("hex"),
  );
try {
  fs.writeFileSync(".env", value, { flag: "wx", mode: 0o600 });
  console.log(
    "Created local .env with random JWT/database secrets; no values printed.",
  );
} catch (e) {
  if (e.code === "EEXIST") {
    console.error(
      ".env already exists; preserve it and configure JWT_SECRET manually.",
    );
    process.exitCode = 1;
  } else throw e;
}
