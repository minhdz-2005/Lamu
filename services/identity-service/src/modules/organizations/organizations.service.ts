import { mediaDisplay } from "../../media/cloudinary";
import { Inject, Injectable, HttpException } from "@nestjs/common";
import { fail, UUID } from "@lamu/runtime";
import { randomUUID, createHash } from "node:crypto";
import { DATABASE, type Database } from "../../database";
import type { Prisma } from "../../generated/client";
import type { components } from "../../../../../shared/contracts/http/generated/identity";
import {
  AuthorizationService,
  type Transaction,
} from "./authorization.service";
import {
  CreateOrganizationDto,
  ReplaceRolesDto,
  type Assignment,
} from "./dto/organization.dto";
import {
  EVENT_CONTEXT,
  ORGANIZATION_CLOCK,
  type EventContextResolver,
} from "./event-context";

type StoredAssignment = Prisma.MembershipRoleGetPayload<{
  include: { role: true };
}>;
type MutationResult = { status: number; body: Prisma.InputJsonObject };
type Operation = "CREATE_ORGANIZATION" | "REPLACE_MEMBER_ROLES";
@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly authorization: AuthorizationService,
    @Inject(EVENT_CONTEXT)
    private readonly resolver: EventContextResolver | null,
    @Inject(ORGANIZATION_CLOCK) private readonly now: () => Date,
  ) {}
  private assignments(rows: StoredAssignment[], org: string): Assignment[] {
    return rows
      .map(
        (a) =>
          ({
            code: a.role.code,
            resource_type: a.resource_type,
            resource_id: a.resource_id ?? org,
          }) as Assignment,
      )
      .sort((a, b) => this.sortKey(a).localeCompare(this.sortKey(b)));
  }
  private sortKey(a: {
    code: string;
    resource_type: string;
    resource_id: string;
  }) {
    return `${a.code}:${a.resource_type}:${a.resource_id}`;
  }
  normalize(dto: ReplaceRolesDto, org: string): Assignment[] {
    const roles = dto.roles
      .map((a) => {
        if (
          a.code === "OWNER" || a.code === "ADMIN"
            ? a.resource_type !== "ORG" || a.resource_id !== org
            : a.resource_type !== "EVENT"
        )
          fail(400, "VALIDATION_FAILED", "Invalid role scope");
        return {
          code: a.code,
          resource_type: a.resource_type,
          resource_id: a.resource_id,
        } as Assignment;
      })
      .sort((a, b) => this.sortKey(a).localeCompare(this.sortKey(b)));
    if (new Set(roles.map((a) => this.sortKey(a))).size !== roles.length)
      fail(400, "VALIDATION_FAILED", "Duplicate assignment");
    return roles;
  }
  async get(
    actor: string,
    org: string,
  ): Promise<components["schemas"]["Organization"]> {
    await this.authorization.requireOrg(actor, org, undefined);
    const row = await this.db.organization.findUniqueOrThrow({
      where: { id: org },
      include: {
        cover_asset: true,
        memberships: {
          where: { user_id: actor },
          include: { assignments: { include: { role: true } } },
        },
      },
    });
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      cover: mediaDisplay(row.cover_asset, row.cover_revision),
      my_roles: [
        ...new Set(
          this.assignments(row.memberships[0].assignments, org).map(
            (a) => a.code,
          ),
        ),
      ].sort(),
    };
  }
  async members(
    actor: string,
    org: string,
    limit: number,
    offset: number,
  ): Promise<components["schemas"]["OrganizationMembers"]> {
    await this.authorization.requireOrg(actor, org, "org.member.read");
    // A consistent page + total from one database snapshot.
    return this.db.$transaction(
      async (tx) => {
        const total = await tx.membership.count({
          where: { organization_id: org },
        });
        const rows = await tx.membership.findMany({
          where: { organization_id: org },
          orderBy: { user_id: "asc" },
          take: limit,
          skip: offset,
          include: {
            user: { select: { display_name: true } },
            assignments: { include: { role: true } },
          },
        });
        return {
          total,
          limit,
          offset,
          items: rows.map((m) => ({
            user_id: m.user_id,
            display_name: m.user.display_name,
            status: m.status as "ACTIVE" | "INACTIVE",
            roles: this.assignments(m.assignments, org),
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async publicOrganization(
    slug: string,
  ): Promise<components["schemas"]["PublicOrganization"]> {
    const row = await this.db.organization.findUnique({
      where: { slug },
      select: {
        name: true,
        slug: true,
        cover_asset: true,
        cover_revision: true,
      },
    });
    if (!row) fail(404, "NOT_FOUND", "Organization unavailable");
    return {
      name: row.name,
      slug: row.slug,
      cover: mediaDisplay(row.cover_asset, row.cover_revision),
    };
  }
  async publicUser(id: string): Promise<components["schemas"]["PublicUser"]> {
    const row = await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        display_name: true,
        status: true,
        avatar_asset: true,
        avatar_revision: true,
      },
    });
    if (!row || row.status !== "ACTIVE")
      fail(404, "NOT_FOUND", "User unavailable");
    return {
      id: row.id,
      display_name: row.display_name,
      avatar: mediaDisplay(row.avatar_asset, row.avatar_revision),
    };
  }
  private async lockOrg(tx: Transaction, org: string) {
    try {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org}::uuid FOR UPDATE`;
    } catch (e) {
      this.lockError(e, "CONFLICT");
    }
  }
  private async lockUsers(tx: Transaction, ids: string[]) {
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
  }
  private lockError(e: unknown, code: string): never {
    const error = e as {
      code?: string;
      meta?: {
        code?: string;
        driverAdapterError?: { cause?: { originalCode?: string } };
      };
    };
    if (
      error.code === "55P03" ||
      error.meta?.code === "55P03" ||
      error.meta?.driverAdapterError?.cause?.originalCode === "55P03"
    )
      fail(409, code, "Concurrent operation; retry with the same key");
    throw e;
  }
  private async event(
    tx: Transaction,
    event_type: string,
    aggregate_type: string,
    aggregate_id: string,
    payload: Prisma.InputJsonObject,
  ) {
    await tx.outboxEvent.create({
      data: {
        event_id: randomUUID(),
        event_type,
        version: 1,
        occurred_at: this.now(),
        aggregate_type,
        aggregate_id,
        producer: "identity-service",
        payload,
      },
    });
  }
  async membershipEvent(
    tx: Transaction,
    id: string,
    change_type: "CREATED" | "ROLES_REPLACED",
  ) {
    const m = await tx.membership.findUniqueOrThrow({
      where: { id },
      include: { assignments: { include: { role: true } } },
    });
    if (m.membership_revision > BigInt(Number.MAX_SAFE_INTEGER))
      fail(409, "CONFLICT", "Membership revision exhausted");
    await this.event(tx, "MembershipChanged", "membership", id, {
      membership_id: id,
      organization_id: m.organization_id,
      user_id: m.user_id,
      status: "ACTIVE",
      membership_revision: Number(m.membership_revision),
      change_type,
      roles: this.assignments(m.assignments, m.organization_id),
    });
  }
  // All supported mutations acquire key -> org -> users -> memberships. The key
  // hash is only a PostgreSQL serialization mechanism; uniqueness is also in DDL.
  private async mutation(
    actor: string,
    operation: Operation,
    key: string,
    target: { org?: string; user?: string },
    body: Prisma.InputJsonObject,
    run: (tx: Transaction) => Promise<MutationResult | null>,
  ): Promise<MutationResult | null> {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          method: operation === "CREATE_ORGANIZATION" ? "POST" : "PUT",
          operation,
          org: target.org ?? null,
          user: target.user ?? null,
          body,
        }),
      )
      .digest("hex");
    try {
      return await this.db.$transaction(
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
          const live =
            previous && previous.expires_at > this.now() ? previous : null;
          // On a conflict, check authorization for the requested target and the stored
          // target, in stable order, before returning any cached result or conflict.
          const orgs = [
            ...new Set(
              [
                target.org,
                ...(live ? [live.target_organization_id] : []),
              ].filter((x): x is string => !!x),
            ),
          ].sort();
          for (const org of orgs) await this.lockOrg(tx, org);
          await this.lockUsers(tx, [
            actor,
            ...(target.user ? [target.user] : []),
          ]);
          await this.authorization.activeActor(actor, tx);
          for (const org of orgs)
            await this.authorization.requireOrg(
              actor,
              org,
              operation === "CREATE_ORGANIZATION"
                ? undefined
                : "org.member.manage",
              tx,
            );
          if (live) {
            if (live.request_hash !== hash)
              fail(409, "CONFLICT", "Idempotency key used for another request");
            return {
              status: live.response_status,
              body: live.response_body as Prisma.InputJsonObject,
            };
          }
          const result = await run(tx);
          if (result === null) return null; // EVENT verification must occur outside locks.
          const org = target.org ?? String(result.body.organization_id),
            completed = this.now();
          const data = {
            actor_user_id: actor,
            operation,
            idempotency_key: key,
            request_hash: hash,
            target_organization_id: org,
            target_user_id: target.user ?? null,
            response_status: result.status,
            response_body: result.body,
            completed_at: completed,
            expires_at: new Date(completed.getTime() + 86400000),
          };
          await tx.idempotencyRecord.upsert({
            where,
            create: { id: randomUUID(), ...data },
            update: data,
          });
          return result;
        },
        { maxWait: 3000, timeout: 10000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.lockError(e, "CONFLICT");
    }
  }
  async create(actor: string, key: string, dto: CreateOrganizationDto) {
    const base = dto.name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const generatedBase = (
      base.length === 0
        ? "organization"
        : base.length < 3
          ? "org-" + base
          : base
    )
      .slice(0, 63)
      .replace(/-+$/g, "");
    // A unique-index race rolls back the entire transaction before retry.
    // The hash uses the request, so generated collision suffixes never break replay.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return (await this.mutation(
          actor,
          "CREATE_ORGANIZATION",
          key,
          {},
          { name: dto.name, slug: dto.slug ?? null },
          async (tx) => {
            let slug = dto.slug ?? generatedBase;
            if (
              dto.slug === undefined &&
              (attempt > 0 ||
                (await tx.organization.findUnique({ where: { slug } })))
            ) {
              slug =
                generatedBase.slice(0, 26).replace(/-+$/g, "") +
                "-" +
                randomUUID();
            }
            const org = await tx.organization.create({
              data: {
                id: randomUUID(),
                name: dto.name,
                slug,
                created_by: actor,
              },
            });
            const m = await tx.membership.create({
              data: {
                id: randomUUID(),
                organization_id: org.id,
                user_id: actor,
              },
            });
            const owner = await tx.role.findFirstOrThrow({
              where: { code: "OWNER", organization_id: null, scope: "ORG" },
            });
            await tx.membershipRole.create({
              data: {
                id: randomUUID(),
                membership_id: m.id,
                role_id: owner.id,
                resource_type: "ORG",
                resource_id: null,
              },
            });
            await this.event(
              tx,
              "OrganizationCreated",
              "organization",
              org.id,
              {
                organization_id: org.id,
                slug: org.slug,
                created_by: actor,
              },
            );
            await this.membershipEvent(tx, m.id, "CREATED");
            return { status: 201, body: { organization_id: org.id } };
          },
        ))!;
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          if (dto.slug !== undefined)
            fail(409, "SLUG_TAKEN", "Slug already used");
          if (attempt < 4) continue;
          fail(
            409,
            "CONFLICT",
            "Unable to allocate slug; retry with the same key",
          );
        }
        throw e;
      }
    }
    throw new Error("Slug allocation attempts exhausted");
  }
  async verifyEvents(org: string, roles: Assignment[]) {
    if (!this.resolver)
      fail(409, "EVENT_SCOPE_UNVERIFIED", "Event resolver is not configured");
    for (const id of new Set(
      roles
        .filter((a) => a.resource_type === "EVENT")
        .map((a) => a.resource_id),
    )) {
      let context: unknown;
      try {
        context = await this.resolver.resolve(id);
      } catch (e) {
        if (e instanceof HttpException) throw e;
        fail(502, "UPSTREAM_UNAVAILABLE", "Event resolver unavailable");
      }
      if (
        !context ||
        typeof context !== "object" ||
        !("event_id" in context) ||
        !("organization_id" in context) ||
        typeof context.event_id !== "string" ||
        typeof context.organization_id !== "string" ||
        !UUID.test(context.event_id) ||
        !UUID.test(context.organization_id) ||
        context.event_id.toLowerCase() !== id
      )
        fail(502, "UPSTREAM_UNAVAILABLE", "Invalid Event context");
      if (context.organization_id.toLowerCase() !== org)
        fail(403, "FORBIDDEN", "Event belongs to another organization");
    }
  }
  async replace(
    actor: string,
    org: string,
    user: string,
    key: string,
    dto: ReplaceRolesDto,
  ) {
    const roles = this.normalize(dto, org);
    let verified = !roles.some((a) => a.resource_type === "EVENT");
    const attempt = () =>
      this.mutation(
        actor,
        "REPLACE_MEMBER_ROLES",
        key,
        { org, user },
        { roles },
        async (tx) => {
          const m = await tx.membership.findUnique({
            where: {
              organization_id_user_id: { organization_id: org, user_id: user },
            },
            include: {
              user: { select: { status: true } },
              assignments: { include: { role: true } },
            },
          });
          if (!m) fail(404, "NOT_FOUND", "Membership unavailable");
          if (m.status !== "ACTIVE" || m.user.status !== "ACTIVE")
            fail(403, "FORBIDDEN", "Target is not active");
          if (!verified) return null;
          await tx.$queryRaw`SELECT id FROM memberships WHERE id=${m.id}::uuid FOR UPDATE`;
          const before = this.assignments(m.assignments, org);
          if (JSON.stringify(before) === JSON.stringify(roles))
            return { status: 200, body: { status: "OK" } };
          if (
            before.some((a) => a.code === "OWNER") &&
            !roles.some((a) => a.code === "OWNER")
          ) {
            const remaining = await tx.membership.count({
              where: {
                organization_id: org,
                id: { not: m.id },
                status: "ACTIVE",
                user: { status: "ACTIVE" },
                assignments: {
                  some: {
                    resource_type: "ORG",
                    resource_id: null,
                    role: {
                      code: "OWNER",
                      organization_id: null,
                      scope: "ORG",
                    },
                  },
                },
              },
            });
            if (!remaining)
              fail(
                409,
                "LAST_OWNER_REQUIRED",
                "At least one active OWNER is required",
              );
          }
          if (m.membership_revision >= BigInt(Number.MAX_SAFE_INTEGER))
            fail(409, "CONFLICT", "Membership revision exhausted");
          await tx.membershipRole.deleteMany({
            where: { membership_id: m.id },
          });
          for (const a of roles) {
            const r = await tx.role.findFirstOrThrow({
              where: {
                code: a.code,
                organization_id: null,
                scope: a.resource_type,
              },
            });
            await tx.membershipRole.create({
              data: {
                id: randomUUID(),
                membership_id: m.id,
                role_id: r.id,
                resource_type: a.resource_type,
                resource_id: a.resource_type === "ORG" ? null : a.resource_id,
              },
            });
          }
          await tx.membership.update({
            where: { id: m.id },
            data: { membership_revision: { increment: 1 } },
          });
          await this.membershipEvent(tx, m.id, "ROLES_REPLACED");
          return { status: 200, body: { status: "OK" } };
        },
      );
    let result = await attempt();
    if (result === null) {
      await this.verifyEvents(org, roles);
      verified = true;
      result = await attempt();
    }
    return result!;
  }
}
