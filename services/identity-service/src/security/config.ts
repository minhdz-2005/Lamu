export const SECURITY_CONFIG = Symbol("SECURITY_CONFIG");
export function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min = 1,
  max = 86400,
) {
  const raw = env[name] ?? String(fallback);
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max)
    throw new Error("Invalid " + name);
  return n;
}
export function key(env: NodeJS.ProcessEnv, name: string) {
  const raw = env[name] ?? "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("Invalid " + name);
  return raw.toLowerCase();
}
function mailKeyId(env: NodeJS.ProcessEnv) {
  const id = env.MAIL_JOB_KEY_ID ?? "v1";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id))
    throw new Error("Invalid MAIL_JOB_KEY_ID");
  return id;
}
export function recoveryConfig(env: NodeJS.ProcessEnv) {
  const hmac = key(env, "PASSWORD_RESET_OTP_HMAC_KEY"),
    encryption = key(env, "MAIL_JOB_ENCRYPTION_KEY");
  if (
    hmac === encryption ||
    hmac === env.JWT_SECRET ||
    encryption === env.JWT_SECRET
  )
    throw new Error("Recovery keys must be independent");
  return {
    hmac,
    encryption,
    keyId: mailKeyId(env),
    otpTtl: integer(env, "PASSWORD_RESET_OTP_TTL_SECONDS", 600),
    tokenTtl: integer(env, "PASSWORD_RESET_TOKEN_TTL_SECONDS", 300),
    attempts: integer(env, "PASSWORD_RESET_MAX_ATTEMPTS", 5, 1, 20),
    cooldown: integer(env, "PASSWORD_RESET_RESEND_COOLDOWN_SECONDS", 60),
    emailLimit: integer(env, "PASSWORD_RESET_EMAIL_HOURLY_LIMIT", 5),
    ipLimit: integer(env, "PASSWORD_RESET_IP_HOURLY_LIMIT", 20),
  };
}
export type RecoveryConfig = ReturnType<typeof recoveryConfig>;
export function mailConfig(env: NodeJS.ProcessEnv) {
  const encryption = key(env, "MAIL_JOB_ENCRYPTION_KEY");
  if (!env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  const database = new URL(env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    database.pathname.length < 2
  )
    throw new Error("Invalid DATABASE_URL");
  if (!env.SMTP_HOST || !env.MAIL_FROM)
    throw new Error("Missing SMTP_HOST/MAIL_FROM");
  if (!["true", "false"].includes(env.SMTP_SECURE ?? ""))
    throw new Error("Invalid SMTP_SECURE");
  const local = ["local", "test"].includes(env.APP_ENV ?? "");
  const secure = env.SMTP_SECURE === "true";
  if (!local && (!secure || !env.SMTP_USER || !env.SMTP_PASSWORD))
    throw new Error("SMTP TLS/auth required");
  if (
    env.SMTP_HOST === "smtp.gmail.com" &&
    (!secure || env.SMTP_PORT !== "465" || !env.SMTP_USER || !env.SMTP_PASSWORD)
  )
    throw new Error("Gmail requires TLS/auth");
  const keyId = mailKeyId(env);
  const keys: Record<string, string> = Object.create(null);
  if (env.MAIL_JOB_PREVIOUS_KEYS_JSON) {
    const parsed: unknown = JSON.parse(env.MAIL_JOB_PREVIOUS_KEYS_JSON);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid previous mail keys");
    for (const [id, value] of Object.entries(parsed)) {
      if (
        typeof value !== "string" ||
        !/^[a-f0-9]{64}$/i.test(value) ||
        id === keyId
      )
        throw new Error("Invalid previous mail key");
      keys[id] = value;
    }
  }
  keys[keyId] = encryption;
  return {
    encryption,
    keyId,
    keys,
    databaseUrl: env.DATABASE_URL,
    host: env.SMTP_HOST,
    port: integer(env, "SMTP_PORT", 465, 1, 65535),
    secure,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.MAIL_FROM,
  };
}
