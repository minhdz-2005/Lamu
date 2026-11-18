import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Inject,
} from "@nestjs/common";
import type { Request } from "express";
import { fail, headerValues, UUID } from "@lamu/runtime";
import { DATABASE, type Database } from "../database";
export interface IdentityRequest extends Request {
  identity: { sub: string; sid: string };
}
@Injectable()
export class ContextGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IdentityRequest>();
    const user = headerValues(req, "x-user-id"),
      session = headerValues(req, "x-session-id");
    if (
      user.length !== 1 ||
      session.length !== 1 ||
      !UUID.test(user[0]) ||
      !UUID.test(session[0])
    )
      fail(401, "UNAUTHENTICATED", "Missing verified identity");
    req.identity = { sub: user[0], sid: session[0] };
    const row = await this.db.refreshSession.findUnique({
      where: { id: session[0] },
      include: { user: true },
    });
    // Logout remains idempotent for the already revoked session only.
    const logout = req.method === "POST" && req.path === "/auth/logout";
    if (
      !row ||
      row.user_id !== user[0] ||
      (!logout && row.revoked_at) ||
      row.expires_at <= new Date()
    )
      fail(401, "UNAUTHENTICATED", "Session unavailable");
    if (row.user.status !== "ACTIVE")
      fail(403, "FORBIDDEN", "Account unavailable");
    return true;
  }
}
