import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { fail, headerValues, UUID } from "@lamu/runtime";

// The Gateway verifies the JWT and overwrites X-User-Id / X-User-Email from
// verified claims, so a single well-formed value here is trusted as identity.
// Permission checks against Identity are added in phase 5.
export interface EventRequest extends Request {
  identity: { userId: string; email: string | null };
}

@Injectable()
export class IdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<EventRequest>();
    const users = headerValues(req, "x-user-id");
    const emails = headerValues(req, "x-user-email");
    if (users.length !== 1 || !UUID.test(users[0]) || emails.length > 1)
      fail(401, "UNAUTHENTICATED", "Missing verified identity");
    req.identity = { userId: users[0], email: emails[0] ?? null };
    return true;
  }
}
