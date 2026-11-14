import "reflect-metadata";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  type INestApplication,
  ValidationPipe,
} from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface Config {
  port: number;
  secret: string;
  issuer: string;
  audience: string;
  databaseUrl: string;
  identityUrl: string;
  timeoutMs: number;
  appEnv: string;
  rateLimit: number;
  authRateLimit: number;
}
export function validateConfig(
  env: NodeJS.ProcessEnv,
  kind: "identity" | "gateway",
): Config {
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = env[name] ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new Error("Invalid " + name);
    const n = Number(raw);
    if (n < min || n > max) throw new Error("Invalid " + name);
    return n;
  };
  const secret = env.JWT_SECRET ?? "";
  if (
    Buffer.byteLength(secret) < 32 ||
    /local_dev_only|change_me|placeholder/i.test(secret)
  )
    throw new Error("Invalid JWT_SECRET");
  if (!env.JWT_ISSUER?.trim() || !env.JWT_AUDIENCE?.trim())
    throw new Error("Missing JWT issuer/audience");
  const databaseUrl = env.DATABASE_URL ?? "";
  const identityUrl = env.IDENTITY_URL ?? "";
  if (kind === "identity") {
    const database = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !database.hostname ||
      database.pathname.length < 2 ||
      database.hash
    )
      throw new Error("Invalid DATABASE_URL");
  }
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
  } else if (kind === "gateway") throw new Error("Missing IDENTITY_URL");
  return {
    port: integer("PORT", 8080, 1, 65535),
    secret,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    databaseUrl,
    identityUrl,
    timeoutMs: integer("UPSTREAM_TIMEOUT_MS", 3000, 1, 60000),
    appEnv: env.APP_ENV ?? "production",
    rateLimit: integer("RATE_LIMIT_MAX", 100, 1, 100000),
    authRateLimit: integer("AUTH_RATE_LIMIT_MAX", 20, 1, 100000),
  };
}
export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
const defaultCode: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  502: "UPSTREAM_UNAVAILABLE",
  503: "SERVICE_UNAVAILABLE",
  504: "UPSTREAM_TIMEOUT",
};
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const custom =
      body && typeof body === "object" && "code" in body
        ? (body as { code: string; message: string })
        : null;
    res.status(status).json({
      error: {
        code: custom?.code ?? defaultCode[status] ?? "INTERNAL_ERROR",
        message:
          custom?.message ??
          (status === 500
            ? "Internal server error"
            : status === 400
              ? "Invalid request"
              : "Request rejected"),
        request_id: res.getHeader("X-Request-Id"),
      },
    });
  }
}
export function headerValues(req: Request, name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2)
    if (req.rawHeaders[i].toLowerCase() === name.toLowerCase())
      values.push(req.rawHeaders[i + 1]);
  return values;
}
export function setupHttp(app: INestApplication, config: Config) {
  app.use(helmet());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ids = headerValues(req, "x-request-id");
    const id = ids.length === 1 && UUID.test(ids[0]) ? ids[0] : randomUUID();
    res.setHeader("X-Request-Id", id);
    const started = Date.now();
    res.on("finish", () => {
      if (process.env.HTTP_LOG === "1")
        process.stdout.write(
          JSON.stringify({
            request_id: id,
            method: req.method,
            status: res.statusCode,
            duration_ms: Date.now() - started,
          }) + "\n",
        );
    });
    next();
  });
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: config.rateLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            request_id: res.getHeader("X-Request-Id"),
          },
        }),
    }),
  );
  app.use(
    ["/auth", "/api/auth"],
    rateLimit({
      windowMs: 60000,
      limit: config.authRateLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many authentication requests",
            request_id: res.getHeader("X-Request-Id"),
          },
        }),
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
}
