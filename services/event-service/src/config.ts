import type { Config as RuntimeConfig } from "@lamu/runtime";

// Event Service does not verify JWTs (the Gateway does), so it cannot use
// validateConfig() from @lamu/runtime, which requires JWT_SECRET.
export interface EventConfig {
  port: number;
  databaseUrl: string;
  identityUrl: string;
  timeoutMs: number;
  appEnv: string;
  rateLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): EventConfig {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name] ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new Error("Invalid " + name);
    const n = Number(raw);
    if (n < min || n > max) throw new Error("Invalid " + name);
    return n;
  };

  const databaseUrl = env.DATABASE_URL ?? "";
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid DATABASE_URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    database.pathname.length < 2 ||
    database.hash
  )
    throw new Error("Invalid DATABASE_URL");

  // Needed from phase 5 (authorization check); optional until then.
  const identityUrl = env.IDENTITY_URL ?? "";
  if (identityUrl) {
    const u = new URL(identityUrl);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error("Invalid IDENTITY_URL");
  }

  return {
    port: integer("PORT", 8080, 1, 65535),
    databaseUrl,
    identityUrl,
    timeoutMs: integer("UPSTREAM_TIMEOUT_MS", 3000, 1, 60000),
    appEnv: env.APP_ENV ?? "production",
    rateLimit: integer("RATE_LIMIT_MAX", 100, 1, 100000),
  };
}

// setupHttp() from @lamu/runtime only reads rateLimit/authRateLimit; the JWT
// fields are unused here and deliberately left empty.
export function toRuntimeConfig(config: EventConfig): RuntimeConfig {
  return {
    port: config.port,
    secret: "",
    issuer: "",
    audience: "",
    databaseUrl: config.databaseUrl,
    identityUrl: config.identityUrl,
    timeoutMs: config.timeoutMs,
    appEnv: config.appEnv,
    rateLimit: config.rateLimit,
    authRateLimit: config.rateLimit,
  };
}
