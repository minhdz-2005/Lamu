import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { verify, type JwtPayload } from "jsonwebtoken";
import { type Config, fail, headerValues, UUID } from "@lamu/runtime";
import { GATEWAY_CONFIG } from "../routes/proxy.service";
export interface VerifiedRequest extends Request {
  identity: { sub: string; sid: string };
}
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: Config) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<VerifiedRequest>();
    const headers = headerValues(req, "authorization");
    if (
      headers.length !== 1 ||
      headers[0].length > 4096 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
        headers[0],
      )
    )
      fail(401, "UNAUTHENTICATED", "Invalid access token");
    try {
      const claims = verify(headers[0].slice(7), this.config.secret, {
        algorithms: ["HS256"],
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as JwtPayload;
      const now = Math.floor(Date.now() / 1000);
      if (
        typeof claims !== "object" ||
        typeof claims.sub !== "string" ||
        !UUID.test(claims.sub) ||
        typeof claims.sid !== "string" ||
        !UUID.test(claims.sid) ||
        typeof claims.jti !== "string" ||
        !UUID.test(claims.jti) ||
        claims.iss !== this.config.issuer ||
        claims.aud !== this.config.audience ||
        typeof claims.iat !== "number" ||
        typeof claims.exp !== "number" ||
        !Number.isInteger(claims.iat) ||
        !Number.isInteger(claims.exp) ||
        claims.iat > now ||
        claims.exp - claims.iat !== 900
      )
        throw new Error("Invalid claims");
      req.identity = { sub: claims.sub!, sid: claims.sid as string };
      return true;
    } catch {
      fail(401, "UNAUTHENTICATED", "Invalid access token");
    }
  }
}
