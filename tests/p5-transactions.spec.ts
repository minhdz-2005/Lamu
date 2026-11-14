import { randomUUID } from "node:crypto";
import request from "supertest";
import { Pool, type PoolClient } from "pg";
import { fail } from "@lamu/runtime";
import { pair, contract } from "./helpers";
import { OrganizationsService } from "../services/identity-service/src/modules/organizations/organizations.service";
import { AuthorizationService } from "../services/identity-service/src/modules/organizations/authorization.service";
import type { AssignmentDto } from "../services/identity-service/src/modules/organizations/dto/organization.dto";

describe("P5 transaction/race and explicit fixture Event resolver", () => {
  let p: Awaited<ReturnType<typeof pair>>, service: OrganizationsService;
  let now = Date.now();
  const sql = new Pool({ connectionString: process.env.DATABASE_URL });
  const events = new Map<string, string>();
  const resolve = jest.fn(async (event_id: string): Promise<unknown> => {
    const organization_id = events.get(event_id);
    if (!organization_id) fail(404, "NOT_FOUND", "Fixture missing");
    return { event_id, organization_id };
  });
  beforeAll(async () => {
    p = await pair({ resolver: { resolve }, now: () => new Date(now) });
    service = p.identity.get(OrganizationsService);
  });
  afterAll(async () => {
    await p?.close();
    await sql.end();
  });
  const r = (
    org: string,
    code: "OWNER" | "ADMIN" = "OWNER",
  ): AssignmentDto => ({ code, resource_type: "ORG", resource_id: org });
  const e = (
    id: string,
    code: "SPEAKER" | "ATTENDEE" = "SPEAKER",
  ): AssignmentDto => ({ code, resource_type: "EVENT", resource_id: id });
  async function user() {
    return p.db.user.create({
      data: {
        id: randomUUID(),
        email: randomUUID() + "@fixture.test",
        display_name: "Fixture",
        password_hash: "synthetic-not-a-login-hash",
      },
    });
  }
  async function fixture(secondOwner = true) {
    const a = await user(),
      b = await user();
    const result = await service.create(a.id, randomUUID(), {
      name: "Fixture",
      slug: "fx-" + randomUUID(),
    });
    const org = String(result.body.organization_id);
    const role = await p.db.role.findFirstOrThrow({
      where: { organization_id: null, code: secondOwner ? "OWNER" : "ADMIN" },
    });
    const m = await p.db.membership.create({
      data: {
        id: randomUUID(),
        organization_id: org,
        user_id: b.id,
        assignments: {
          create: {
            id: randomUUID(),
            role_id: role.id,
            resource_type: "ORG",
            resource_id: null,
          },
        },
      },
    });
    return { a: a.id, b: b.id, org, m: m.id };
  }
  const replace = (
    actor: string,
    org: string,
    target: string,
    roles: AssignmentDto[],
    key = randomUUID(),
  ) => service.replace(actor, org, target, key, { roles });
  async function waitForBlocked(client: PoolClient) {
    for (let n = 0; n < 100; n++) {
      const rows = await client.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
      );
      if (Number(rows.rows[0].count) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected transaction to wait for a real PostgreSQL lock");
  }
  it("serializes two OWNER self-demotions: one commits, the last is rejected", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      replace(f.a, f.org, f.a, [r(f.org, "ADMIN")]),
      replace(f.b, f.org, f.b, [r(f.org, "ADMIN")]),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((x) => x.status === "rejected")
        .map((x) => (x as PromiseRejectedResult).reason.getResponse().code),
    ).toEqual(["LAST_OWNER_REQUIRED"]);
    expect(
      await p.db.membershipRole.count({
        where: {
          membership: { organization_id: f.org, status: "ACTIVE" },
          role: { code: "OWNER" },
        },
      }),
    ).toBe(1);
  });
  it("rechecks actor permissions after waiting for the org lock, not a stale precheck", async () => {
    const f = await fixture(),
      c = await sql.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        f.org,
      ]);
      const pending = replace(f.a, f.org, f.b, []);
      const outcome = pending.then(
        () => null,
        (e) => e,
      );
      await waitForBlocked(c);
      await c.query(
        "UPDATE membership_roles SET role_id=(SELECT id FROM roles WHERE code='ADMIN' AND organization_id IS NULL) WHERE membership_id=(SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2)",
        [f.org, f.a],
      );
      await c.query("COMMIT");
      expect(await outcome).toMatchObject({ status: 403 });
      expect(
        await p.db.membershipRole.count({
          where: { membership_id: f.m, role: { code: "OWNER" } },
        }),
      ).toBe(1);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
  it("allows the mutation that committed before demotion and denies its replay after actor loses rights", async () => {
    const f = await fixture(),
      key = randomUUID();
    await replace(f.a, f.org, f.b, [r(f.org), r(f.org, "ADMIN")], key);
    await replace(f.b, f.org, f.a, [r(f.org, "ADMIN")]);
    await expect(
      replace(f.a, f.org, f.b, [r(f.org), r(f.org, "ADMIN")], key),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await p.db.membership.findUniqueOrThrow({ where: { id: f.m } }))
        .membership_revision,
    ).toBe(2n);
  });
  it("serializes replacement idempotency race and conflicts on different target/body", async () => {
    const f = await fixture(),
      key = randomUUID();
    const results = await Promise.all([
      replace(f.a, f.org, f.b, [], key),
      replace(f.a, f.org, f.b, [], key),
    ]);
    expect(results[1]).toEqual(results[0]);
    expect(
      (await p.db.membership.findUniqueOrThrow({ where: { id: f.m } }))
        .membership_revision,
    ).toBe(2n);
    expect(await p.db.outboxEvent.count({ where: { aggregate_id: f.m } })).toBe(
      1,
    );
    await expect(replace(f.a, f.org, f.a, [], key)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      replace(f.a, f.org, f.b, [r(f.org, "ADMIN")], key),
    ).rejects.toMatchObject({ status: 409 });
    const other = await fixture();
    await expect(
      replace(f.a, other.org, other.b, [], key),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("isolates idempotency by actor and operation; replays never extend the 24h deadline", async () => {
    const f = await fixture(),
      key = randomUUID();
    await replace(f.a, f.org, f.b, [r(f.org)], key);
    await replace(f.b, f.org, f.b, [r(f.org)], key);
    const created = await service.create(f.a, key, {
      name: "Other",
      slug: "other-" + randomUUID(),
    });
    expect(created.status).toBe(201);
    expect(
      await p.db.idempotencyRecord.count({ where: { idempotency_key: key } }),
    ).toBe(3);
    const record = await p.db.idempotencyRecord.findFirstOrThrow({
      where: {
        idempotency_key: key,
        operation: "REPLACE_MEMBER_ROLES",
        actor_user_id: f.a,
      },
    });
    now += 1000;
    await replace(f.a, f.org, f.b, [r(f.org)], key);
    expect(
      (
        await p.db.idempotencyRecord.findUniqueOrThrow({
          where: { id: record.id },
        })
      ).expires_at,
    ).toEqual(record.expires_at);
    expect(record.expires_at.getTime() - record.completed_at.getTime()).toBe(
      86400000,
    );
  });
  it("reuses an expired key as a new request, with the current rights on the new target", async () => {
    const f = await fixture(),
      key = randomUUID();
    await replace(f.a, f.org, f.b, [], key);
    const other = await service.create(f.a, randomUUID(), {
      name: "New",
      slug: "new-" + randomUUID(),
    });
    const org = String(other.body.organization_id);
    // Old target is no longer readable. Expired key must not require old rights.
    await p.db.membership.update({
      where: {
        organization_id_user_id: { organization_id: f.org, user_id: f.a },
      },
      data: { status: "INACTIVE" },
    });
    now += 86400000;
    await expect(replace(f.a, org, f.a, [r(org)], key)).resolves.toMatchObject({
      status: 200,
    });
  });
  it("returns IDEMPOTENCY_IN_PROGRESS after 2s key lock timeout, without side effects", async () => {
    const f = await fixture(),
      key = randomUUID(),
      c = await sql.connect();
    const before = await p.db.outboxEvent.count({
      where: { aggregate_id: f.m },
    });
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        JSON.stringify([f.a, "REPLACE_MEMBER_ROLES", key]),
      ]);
      const started = Date.now();
      await expect(replace(f.a, f.org, f.b, [], key)).rejects.toMatchObject({
        status: 409,
        response: { code: "IDEMPOTENCY_IN_PROGRESS" },
      });
      expect(Date.now() - started).toBeGreaterThanOrEqual(1800);
      expect(
        await p.db.outboxEvent.count({ where: { aggregate_id: f.m } }),
      ).toBe(before);
      expect(
        await p.db.idempotencyRecord.count({ where: { idempotency_key: key } }),
      ).toBe(0);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
  it("verifies fixture Event scope, snapshots multiple roles and replays without resolving again", async () => {
    const f = await fixture(false),
      e1 = randomUUID(),
      e2 = randomUUID(),
      key = randomUUID();
    events.set(e1, f.org);
    events.set(e2, randomUUID());
    await replace(f.a, f.org, f.b, [e(e1), e(e1, "ATTENDEE")], key);
    const count = resolve.mock.calls.length;
    events.delete(e1);
    await replace(f.a, f.org, f.b, [e(e1, "ATTENDEE"), e(e1)], key);
    expect(resolve).toHaveBeenCalledTimes(count);
    await expect(replace(f.a, f.org, f.b, [e(e1)])).rejects.toMatchObject({
      status: 404,
    });
    await expect(replace(f.a, f.org, f.b, [e(e2)])).rejects.toMatchObject({
      status: 403,
    });
    const authorization = p.identity.get(AuthorizationService);
    expect(
      await authorization.check({
        user_id: f.b,
        organization_id: f.org,
        permission: "event.read",
        resource_type: "EVENT",
        resource_id: e1,
      }),
    ).toEqual({ allowed: true, reason: "PERMISSION_GRANTED" });
    expect(
      (
        await authorization.check({
          user_id: f.b,
          organization_id: f.org,
          permission: "event.read",
          resource_type: "EVENT",
          resource_id: e2,
        })
      ).allowed,
    ).toBe(false);
    expect(
      (
        await authorization.check({
          user_id: f.b,
          organization_id: f.org,
          permission: "event.read",
          resource_type: "ORG",
          resource_id: f.org,
        })
      ).allowed,
    ).toBe(false);
  });
  it("rejects malformed/unavailable/timed-out fixture resolvers and rechecks rights after remote resolve", async () => {
    const f = await fixture(false),
      event = randomUUID();
    for (const [status, resolver] of [
      [502, async () => ({ event_id: randomUUID(), organization_id: f.org })],
      [502, async () => ({ event_id: event })],
      [
        502,
        async () => {
          throw new Error("offline");
        },
      ],
      [504, async () => fail(504, "UPSTREAM_TIMEOUT", "Synthetic timeout")],
    ] as const) {
      resolve.mockImplementationOnce(resolver);
      await expect(replace(f.a, f.org, f.b, [e(event)])).rejects.toMatchObject({
        status,
      });
    }
    resolve.mockImplementationOnce(async () => {
      await p.db.membershipRole.updateMany({
        where: { membership: { organization_id: f.org, user_id: f.a } },
        data: {
          role_id: (
            await p.db.role.findFirstOrThrow({
              where: { code: "ADMIN", organization_id: null },
            })
          ).id,
        },
      });
      return { event_id: event, organization_id: f.org };
    });
    await expect(replace(f.a, f.org, f.b, [e(event)])).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (await p.db.membership.findUniqueOrThrow({ where: { id: f.m } }))
        .membership_revision,
    ).toBe(1n);
  });
  it("checks ACTIVE target, missing membership, last valid owner and revision overflow before writing", async () => {
    const f = await fixture();
    await p.db.user.update({ where: { id: f.b }, data: { status: "LOCKED" } });
    await expect(replace(f.a, f.org, f.b, [])).rejects.toMatchObject({
      status: 403,
    });
    await expect(replace(f.a, f.org, f.a, [])).rejects.toMatchObject({
      status: 409,
      response: { code: "LAST_OWNER_REQUIRED" },
    });
    await p.db.user.update({ where: { id: f.b }, data: { status: "ACTIVE" } });
    await p.db.membership.update({
      where: { id: f.m },
      data: { status: "INACTIVE" },
    });
    await expect(replace(f.a, f.org, f.b, [])).rejects.toMatchObject({
      status: 403,
    });
    await expect(replace(f.a, f.org, randomUUID(), [])).rejects.toMatchObject({
      status: 404,
    });
    await p.db.membership.update({
      where: { id: f.m },
      data: {
        status: "ACTIVE",
        membership_revision: BigInt(Number.MAX_SAFE_INTEGER),
      },
    });
    await expect(replace(f.a, f.org, f.b, [])).rejects.toMatchObject({
      status: 409,
      response: { code: "CONFLICT" },
    });
  });
  it("rolls back replacement, revision and idempotency result if outbox rejects the write", async () => {
    const f = await fixture(),
      key = randomUUID();
    await sql.query(
      "CREATE FUNCTION p5_role_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.aggregate_id='" +
        f.m +
        "'::uuid THEN RAISE EXCEPTION 'synthetic fault'; END IF; RETURN NEW; END $$",
    );
    await sql.query(
      "CREATE TRIGGER p5_role_fault BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION p5_role_failure()",
    );
    try {
      await expect(replace(f.a, f.org, f.b, [], key)).rejects.toThrow();
      expect(
        (await p.db.membership.findUniqueOrThrow({ where: { id: f.m } }))
          .membership_revision,
      ).toBe(1n);
      expect(
        await p.db.membershipRole.count({
          where: { membership_id: f.m, role: { code: "OWNER" } },
        }),
      ).toBe(1);
      expect(
        await p.db.idempotencyRecord.count({ where: { idempotency_key: key } }),
      ).toBe(0);
    } finally {
      await sql.query("DROP TRIGGER p5_role_fault ON outbox_events");
      await sql.query("DROP FUNCTION p5_role_failure()");
    }
    await replace(f.a, f.org, f.b, [], key);
  });
  it("serves real HTTP fixture-scope role replacement and canonical member snapshots", async () => {
    const f = await fixture(false),
      event = randomUUID();
    events.set(event, f.org);
    const res = await request(p.identity.getHttpServer())
      .put(`/organizations/${f.org}/members/${f.b}/roles`)
      .set("X-User-Id", f.a)
      .set("X-Session-Id", randomUUID())
      .set("Idempotency-Key", randomUUID())
      .send({ roles: [e(event)] })
      .expect(200);
    contract("LoggedOut", res.body);
    const members = await request(p.identity.getHttpServer())
      .get(`/organizations/${f.org}/members`)
      .set("X-User-Id", f.a)
      .set("X-Session-Id", randomUUID())
      .expect(200);
    contract("OrganizationMembers", members.body);
    const eventRow = await p.db.outboxEvent.findFirstOrThrow({
      where: { aggregate_id: f.m },
    });
    expect((eventRow.payload as any).roles).toEqual([e(event)]);
  });
});
