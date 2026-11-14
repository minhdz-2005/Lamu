import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { fail, headerValues, UUID } from "@lamu/runtime";
export interface IdentityRequest extends Request {
  identity: { sub: string; sid: string };
}
@Injectable()
export class ContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
    return true;
  }
}
