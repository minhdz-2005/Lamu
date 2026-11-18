const { randomBytes } = require("node:crypto");
// Only synthetic values; this helper never reads the user's .env or sends email.
module.exports = () => ({
  PASSWORD_RESET_OTP_HMAC_KEY: randomBytes(32).toString("hex"),
  MAIL_JOB_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  CLOUDINARY_CLOUD_NAME: "test",
  CLOUDINARY_API_KEY: "synthetic",
  CLOUDINARY_API_SECRET: "synthetic-test-secret",
  CLOUDINARY_AVATAR_UPLOAD_PRESET: "avatar",
  CLOUDINARY_ORG_COVER_UPLOAD_PRESET: "cover",
  CLOUDINARY_ASSET_PREFIX: "lamu/test",
  SMTP_HOST: "mailpit",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  MAIL_FROM: "Lamu Test <security@lamu.test>",
});
