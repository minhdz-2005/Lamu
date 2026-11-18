import { Inject, Injectable, HttpException } from "@nestjs/common";
import { fail } from "@lamu/runtime";
import { createHash, randomUUID } from "node:crypto";
import { DATABASE, type Database } from "../../database";
import type { Prisma, OrganizationInvitation } from "../../generated/client";
import type { components } from "../../../../../shared/contracts/http/generated/identity";
import {
  AuthorizationService,
  type Transaction,
} from "./authorization.service";
import { OrganizationsService } from "./organizations.service";
import { ORGANIZATION_CLOCK } from "./event-context";
import { CreateInvitationDto } from "./dto/invitation.dto";
import type { Assignment } from "./dto/organization.dto";
type Operation =
  | "CREATE_INVITATION"
  | "ACCEPT_INVITATION"
  | "DECLINE_INVITATION"
  | "REVOKE_INVITATION";
type Result = { status: number; body: Prisma.InputJsonObject };
type Outcome =
  | Result
  | { verify: Assignment[]; org: string }
  | { expired: true };

function invitationSnapshot(
  row: OrganizationInvitation,
  now: Date,
): Omit<
  components["schemas"]["Invitation"],
  "organization_name" | "organization_slug"
> {
  const expired = row.status === "PENDING" && row.expires_at <= now;
  return {
    id: row.id,
    organization_id: row.organization_id,
    inviter_user_id: row.inviter_user_id,
    roles: row.roles as Assignment[],
    status: (expired
      ? "EXPIRED"
      : row.status) as components["schemas"]["Invitation"]["status"],
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    processed_at:
      (expired ? row.expires_at : row.processed_at)?.toISOString() ?? null,
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly organizations: OrganizationsService,
    @Inject(ORGANIZATION_CLOCK) private readonly now: () => Date,
  ) {}
  private async owner(tx: Transaction, actor: string, org: string) {
    await this.authorization.requireOrg(actor, org, "org.member.manage", tx);
    // Explicit OWNER policy, even if a future reference permission grant drifts.
    const m = await tx.membership.findUnique({
      where: {
        organization_id_user_id: { organization_id: org, user_id: actor },
      },
      include: { assignments: { include: { role: true } } },
    });
    if (
      !m?.assignments.some(
        (a) =>
          a.resource_type === "ORG" &&
          a.resource_id === null &&
          a.role.code === "OWNER" &&
          a.role.scope === "ORG" &&
          a.role.organization_id === null,
      )
    )
      fail(403, "FORBIDDEN", "OWNER required");
  }
  private async permitted(
    tx: Transaction,
    actor: string,
    operation: Operation,
    org: string,
    row: OrganizationInvitation | null,
    replay?: Prisma.JsonValue,
  ) {
    if (operation === "CREATE_INVITATION" || operation === "REVOKE_INVITATION")
      await this.owner(tx, actor, org);
    if (operation !== "CREATE_INVITATION") {
      if (!row || row.organization_id !== org)
        fail(404, "NOT_FOUND", "Invitation unavailable");
      if (operation !== "REVOKE_INVITATION" && row.invitee_user_id !== actor)
        fail(403, "FORBIDDEN", "Invitation recipient required");
    }
    if (operation === "ACCEPT_INVITATION" && replay) {
      const membership_id = (replay as { membership_id: string }).membership_id;
      const m = await tx.membership.findUnique({
        where: { id: membership_id },
      });
      if (
        !m ||
        m.user_id !== actor ||
        m.organization_id !== org ||
        m.status !== "ACTIVE"
      )
        fail(403, "FORBIDDEN", "Membership unavailable");
    }
  }
  private lockError(error: unknown, code: string): never {
    const e = error as {
      code?: string;
      meta?: {
        code?: string;
        driverAdapterError?: { cause?: { originalCode?: string } };
      };
    };
    if (
      e.code === "55P03" ||
      e.meta?.code === "55P03" ||
      e.meta?.driverAdapterError?.cause?.originalCode === "55P03"
    )
      fail(409, code, "Concurrent operation; retry with the same key");
    throw error;
  }
  async list(
    actor: string,
    limit: number,
    offset: number,
  ): Promise<components["schemas"]["Invitations"]> {
    return this.db.$transaction(
      async (tx) => {
        await this.authorization.activeActor(actor, tx);
        const total = await tx.organizationInvitation.count({
          where: { invitee_user_id: actor },
        });
        const rows = await tx.organizationInvitation.findMany({
          where: { invitee_user_id: actor },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: limit,
          skip: offset,
          include: { organization: true },
        });
        const now = this.now();
        return {
          total,
          limit,
          offset,
          items: rows.map((row) => ({
            ...invitationSnapshot(row, now),
            organization_name: row.organization.name,
            organization_slug: row.organization.slug,
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async listSent(
    actor: string,
    org: string,
    limit: number,
    offset: number,
  ): Promise<components["schemas"]["OrganizationInvitations"]> {
    return this.db.$transaction(
      async (tx) => {
        await this.owner(tx, actor, org);
        const where = { organization_id: org };
        const total = await tx.organizationInvitation.count({ where });
        const rows = await tx.organizationInvitation.findMany({
          where,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: limit,
          skip: offset,
          include: {
            invitee: { select: { display_name: true, email: true } },
          },
        });
        const now = this.now();
        return {
          total,
          limit,
          offset,
          items: rows.map((row) => ({
            ...invitationSnapshot(row, now),
            invitee_user_id: row.invitee_user_id,
            invitee_display_name: row.invitee.display_name,
            invitee_email: row.invitee.email,
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async create(
    actor: string,
    org: string,
    key: string,
    dto: CreateInvitationDto,
  ) {
    const roles = this.organizations.normalize(dto, org);
    return this.command(
      actor,
      "CREATE_INVITATION",
      key,
      { org },
      { email: dto.email, roles },
    );
  }
  async action(
    actor: string,
    id: string,
    kind: "accept" | "decline" | "revoke",
    key: string,
    org?: string,
  ) {
    const operations = {
      accept: "ACCEPT_INVITATION",
      decline: "DECLINE_INVITATION",
      revoke: "REVOKE_INVITATION",
    } as const;
    return this.command(actor, operations[kind], key, { id, org }, {});
  }
  private async command(
    actor: string,
    operation: Operation,
    key: string,
    target: { id?: string; org?: string },
    body: Prisma.InputJsonObject,
  ): Promise<Result> {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          method: "POST",
          operation,
          org: target.org ?? null,
          invitation: target.id ?? null,
          body,
        }),
      )
      .digest("hex");
    let verified: string | undefined;
    for (;;) {
      let result: Outcome;
      try {
        result = await this.db.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT set_config('lock_timeout','2s',true)`;
            try {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actor, operation, key])},0))`;
            } catch (e) {
              this.lockError(e, "IDEMPOTENCY_IN_PROGRESS");
            }
            const where = {
              actor_user_id_operation_idempotency_key: {
                actor_user_id: actor,
                operation,
                idempotency_key: key,
              },
            };
            const previous = await tx.idempotencyRecord.findUnique({ where });
            const liveBefore =
              previous && previous.expires_at > this.now() ? previous : null;
            const lookup = (id: string) =>
              tx.organizationInvitation.findUnique({ where: { id } });
            const initial = target.id ? await lookup(target.id) : null;
            const stored = liveBefore?.target_invitation_id
              ? await lookup(liveBefore.target_invitation_id)
              : null;
            const org = target.org ?? initial?.organization_id;
            const orgs = [
              ...new Set(
                [
                  org,
                  ...(liveBefore ? [liveBefore.target_organization_id] : []),
                ].filter((x): x is string => !!x),
              ),
            ].sort();
            for (const o of orgs)
              await tx.$queryRaw`SELECT id FROM organizations WHERE id=${o}::uuid FOR UPDATE`;
            // Lookup only for lock IDs; all eligibility/rights are checked below locks.
            const invitee =
              operation === "CREATE_INVITATION"
                ? await tx.user.findUnique({
                    where: { email: String(body.email) },
                  })
                : null;
            const ids = [
              actor,
              ...[initial, stored].flatMap((r) =>
                r ? [r.inviter_user_id, r.invitee_user_id] : [],
              ),
              ...(invitee ? [invitee.id] : []),
            ];
            for (const id of [...new Set(ids)].sort())
              await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
            for (const id of [
              ...new Set(
                [initial?.id, stored?.id].filter((x): x is string => !!x),
              ),
            ].sort())
              await tx.$queryRaw`SELECT id FROM organization_invitations WHERE id=${id}::uuid FOR UPDATE`;
            const memberships = await tx.membership.findMany({
              where: { organization_id: { in: orgs }, user_id: { in: ids } },
              select: { id: true },
              orderBy: { id: "asc" },
            });
            for (const m of memberships)
              await tx.$queryRaw`SELECT id FROM memberships WHERE id=${m.id}::uuid FOR UPDATE`;
            // Permission/ACTIVE/expiry checks follow every potentially blocking row lock.
            await this.authorization.activeActor(actor, tx);
            if (!org) fail(404, "NOT_FOUND", "Invitation unavailable");
            const row = target.id ? await lookup(target.id) : null;
            const live =
              previous && previous.expires_at > this.now() ? previous : null;
            await this.permitted(
              tx,
              actor,
              operation,
              org,
              row,
              live?.request_hash === hash ? live.response_body : undefined,
            );
            if (live) {
              if (live.target_invitation_id) {
                const cached = await lookup(live.target_invitation_id);
                await this.permitted(
                  tx,
                  actor,
                  operation,
                  live.target_organization_id,
                  cached,
                  live.response_body,
                );
              } else fail(409, "CONFLICT", "Invalid idempotency target");
              if (live.request_hash !== hash)
                fail(
                  409,
                  "CONFLICT",
                  "Idempotency key used for another request",
                );
              return {
                status: live.response_status,
                body: live.response_body as Prisma.InputJsonObject,
              };
            }
            let roles: Assignment[],
              invitation: OrganizationInvitation,
              response: Result;
            if (operation === "CREATE_INVITATION") {
              if (!invitee) fail(404, "NOT_FOUND", "Recipient unavailable");
              await this.authorization.activeActor(invitee.id, tx);
              if (
                await tx.membership.findUnique({
                  where: {
                    organization_id_user_id: {
                      organization_id: org,
                      user_id: invitee.id,
                    },
                  },
                })
              )
                fail(409, "ALREADY_MEMBER", "Membership already exists");
              const pending = await tx.organizationInvitation.findFirst({
                where: {
                  organization_id: org,
                  invitee_user_id: invitee.id,
                  status: "PENDING",
                },
              });
              if (pending && pending.expires_at > this.now())
                fail(
                  409,
                  "INVITATION_ALREADY_PENDING",
                  "Pending invitation already exists",
                );
              roles = body.roles as Assignment[];
              if (
                roles.some((r) => r.resource_type === "EVENT") &&
                verified !== JSON.stringify(roles)
              )
                return { verify: roles, org };
              if (pending)
                await tx.organizationInvitation.update({
                  where: { id: pending.id },
                  data: { status: "EXPIRED", processed_at: pending.expires_at },
                });
              const created = this.now();
              invitation = await tx.organizationInvitation.create({
                data: {
                  id: randomUUID(),
                  organization_id: org,
                  inviter_user_id: actor,
                  invitee_user_id: invitee.id,
                  roles,
                  created_at: created,
                  expires_at: new Date(created.getTime() + 7 * 86400000),
                },
              });
              response = {
                status: 201,
                body: {
                  invitation_id: invitation.id,
                  status: "PENDING",
                  expires_at: invitation.expires_at.toISOString(),
                },
              };
            } else {
              invitation = row!;
              if (invitation.status === "EXPIRED")
                fail(409, "INVITATION_EXPIRED", "Invitation expired");
              if (invitation.status !== "PENDING")
                fail(
                  409,
                  "INVITATION_NOT_PENDING",
                  "Invitation is not pending",
                );
              if (invitation.expires_at <= this.now()) {
                await tx.organizationInvitation.update({
                  where: { id: invitation.id },
                  data: {
                    status: "EXPIRED",
                    processed_at: invitation.expires_at,
                  },
                });
                return { expired: true }; // Commit only lazy expiry, throw HTTP error outside transaction.
              }
              const status =
                operation === "ACCEPT_INVITATION"
                  ? "ACCEPTED"
                  : operation === "DECLINE_INVITATION"
                    ? "DECLINED"
                    : "REVOKED";
              response = {
                status: 200,
                body: { invitation_id: invitation.id, status },
              };
              if (operation === "ACCEPT_INVITATION") {
                await this.owner(tx, invitation.inviter_user_id, org);
                const existing = await tx.membership.findUnique({
                  where: {
                    organization_id_user_id: {
                      organization_id: org,
                      user_id: actor,
                    },
                  },
                });
                if (existing)
                  fail(409, "ALREADY_MEMBER", "Membership already exists");
                roles = this.organizations.normalize(
                  { roles: invitation.roles as Assignment[] },
                  org,
                );
                if (
                  roles.some((r) => r.resource_type === "EVENT") &&
                  verified !== JSON.stringify(roles)
                )
                  return { verify: roles, org };
                const membership = await tx.membership.create({
                  data: {
                    id: randomUUID(),
                    organization_id: org,
                    user_id: actor,
                  },
                });
                for (const a of roles) {
                  const role = await tx.role.findFirstOrThrow({
                    where: {
                      organization_id: null,
                      code: a.code,
                      scope: a.resource_type,
                    },
                  });
                  await tx.membershipRole.create({
                    data: {
                      id: randomUUID(),
                      membership_id: membership.id,
                      role_id: role.id,
                      resource_type: a.resource_type,
                      resource_id:
                        a.resource_type === "ORG" ? null : a.resource_id,
                    },
                  });
                }
                await this.organizations.membershipEvent(
                  tx,
                  membership.id,
                  "CREATED",
                );
                response.body = {
                  ...response.body,
                  membership_id: membership.id,
                };
              }
              // There are no lock waits after this time check in the supported protocol.
              const processed = this.now();
              if (processed >= invitation.expires_at)
                fail(409, "INVITATION_EXPIRED", "Invitation expired");
              await tx.organizationInvitation.update({
                where: { id: invitation.id },
                data: { status, processed_at: processed },
              });
            }
            const completed = this.now();
            const data = {
              actor_user_id: actor,
              operation,
              idempotency_key: key,
              request_hash: hash,
              target_organization_id: org,
              target_user_id: invitation.invitee_user_id,
              target_invitation_id: invitation.id,
              response_status: response.status,
              response_body: response.body,
              completed_at: completed,
              expires_at: new Date(completed.getTime() + 86400000),
            };
            await tx.idempotencyRecord.upsert({
              where,
              create: { id: randomUUID(), ...data },
              update: data,
            });
            return response;
          },
          { maxWait: 3000, timeout: 10000 },
        );
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.lockError(e, "CONFLICT");
      }
      if ("expired" in result)
        fail(409, "INVITATION_EXPIRED", "Invitation expired");
      if ("verify" in result) {
        await this.organizations.verifyEvents(result.org, result.verify);
        verified = JSON.stringify(result.verify);
        continue;
      }
      return result;
    }
  }
}
