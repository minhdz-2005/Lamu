import { mediaDisplay } from "../../media/cloudinary";
import { Inject, Injectable } from "@nestjs/common";
import { fail } from "@lamu/runtime";
import { type Database, DATABASE } from "../../database";
import type { components } from "../../../../../shared/contracts/http/generated/identity";
type RoleCode =
  components["schemas"]["Profile"]["memberships"][number]["roles"][number];
@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async me(id: string): Promise<components["schemas"]["Profile"]> {
    const user = await this.db.user.findUnique({
      where: { id },
      include: {
        avatar_asset: true,
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            organization: { include: { cover_asset: true } },
            assignments: { include: { role: true } },
          },
          orderBy: { organization_id: "asc" },
        },
      },
    });
    if (!user) fail(401, "UNAUTHENTICATED", "User unavailable");
    if (user.status !== "ACTIVE") fail(403, "FORBIDDEN", "Account unavailable");
    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar: mediaDisplay(user.avatar_asset, user.avatar_revision),
      memberships: user.memberships.map((m) => ({
        organization_id: m.organization_id,
        name: m.organization.name,
        slug: m.organization.slug,
        cover: mediaDisplay(
          m.organization.cover_asset,
          m.organization.cover_revision,
        ),
        roles: [
          ...new Set(m.assignments.map((a) => a.role.code as RoleCode)),
        ].sort(),
      })),
    };
  }
}
