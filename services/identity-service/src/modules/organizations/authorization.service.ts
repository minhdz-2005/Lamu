import { Inject, Injectable } from "@nestjs/common";
import { fail } from "@lamu/runtime";
import { DATABASE, type Database } from "../../database";
import type { Prisma } from "../../generated/client";
import type { components } from "../../../../../shared/contracts/http/generated/identity";
import { AuthorizationDto } from "./dto/organization.dto";
export type Transaction = Prisma.TransactionClient;
const matrix: Record<string, readonly string[]> = {
  ORG: [
    "org.read",
    "org.profile.update",
    "org.member.read",
    "org.member.manage",
    "event.create",
    "event.read",
  ],
  EVENT: [
    "event.read",
    "event.update",
    "event.publish",
    "event.cancel",
    "ticket.checkin",
    "payment.refund",
  ],
};
@Injectable()
export class AuthorizationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async check(
    dto: AuthorizationDto,
    db: Transaction | Database = this.db,
  ): Promise<components["schemas"]["AuthorizationResult"]> {
    if (
      !matrix[dto.resource_type]?.includes(dto.permission) ||
      (dto.resource_type === "ORG" && dto.resource_id !== dto.organization_id)
    )
      fail(400, "VALIDATION_FAILED", "Invalid permission scope");
    const user = await db.user.findUnique({
      where: { id: dto.user_id },
      select: { status: true },
    });
    if (!user) return { allowed: false, reason: "USER_NOT_FOUND" };
    if (user.status !== "ACTIVE")
      return { allowed: false, reason: "USER_LOCKED" };
    const membership = await db.membership.findUnique({
      where: {
        organization_id_user_id: {
          organization_id: dto.organization_id,
          user_id: dto.user_id,
        },
      },
      include: {
        assignments: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!membership || membership.status !== "ACTIVE")
      return { allowed: false, reason: "NO_ACTIVE_MEMBERSHIP" };
    const allowed = membership.assignments.some((a) => {
      const r = a.role;
      if (
        r.organization_id !== null ||
        !["OWNER", "ADMIN", "SPEAKER", "ATTENDEE"].includes(r.code) ||
        r.scope !== a.resource_type
      )
        return false;
      const scope =
        a.resource_type === "ORG"
          ? a.resource_id === null
          : a.resource_type === "EVENT" &&
            dto.resource_type === "EVENT" &&
            a.resource_id === dto.resource_id;
      return (
        scope && r.permissions.some((p) => p.permission.code === dto.permission)
      );
    });
    return allowed
      ? { allowed: true, reason: "PERMISSION_GRANTED" }
      : { allowed: false, reason: "PERMISSION_DENIED" };
  }
  async activeActor(id: string, db: Transaction | Database = this.db) {
    const u = await db.user.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!u) fail(401, "UNAUTHENTICATED", "User unavailable");
    if (u.status !== "ACTIVE") fail(403, "FORBIDDEN", "Account unavailable");
  }
  async requireOrg(
    actor: string,
    org: string,
    permission: string | undefined,
    db: Transaction | Database = this.db,
  ) {
    await this.activeActor(actor, db);
    if (
      !(await db.organization.findUnique({
        where: { id: org },
        select: { id: true },
      }))
    )
      fail(404, "NOT_FOUND", "Organization unavailable");
    if (permission) {
      const result = await this.check(
        {
          user_id: actor,
          organization_id: org,
          resource_type: "ORG",
          resource_id: org,
          permission,
        },
        db,
      );
      if (!result.allowed) fail(403, "FORBIDDEN", "Permission denied");
    } else {
      const m = await db.membership.findUnique({
        where: {
          organization_id_user_id: { organization_id: org, user_id: actor },
        },
      });
      if (m?.status !== "ACTIVE")
        fail(403, "FORBIDDEN", "Membership unavailable");
    }
  }
}
