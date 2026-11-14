import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { pair, contract } from "./helpers";
import { fixture, orgRole, type Pair } from "./p6-helpers";
import { OrganizationsService } from "../services/identity-service/src/modules/organizations/organizations.service";
import { fail } from "@lamu/runtime";
import Ajv from "ajv";
import formats from "ajv-formats";
import fs from "node:fs";
describe("P6 PostgreSQL transaction, replay, expiry and Event fixture", () => {
  let p: Pair,
    now = Date.now();
  const sql = new Pool({ connectionString: process.env.DATABASE_URL });
  const events = new Map<string, string>();
  const resolve = jest.fn(async (event_id: string): Promise<unknown> => {
    const organization_id = events.get(event_id);
    if (!organization_id) fail(404, "NOT_FOUND", "Fixture missing");
    return { event_id, organization_id };
  });
  beforeAll(async () => {
    p = await pair({ now: () => new Date(now), resolver: { resolve } });
  });
  afterAll(async () => {
    await p?.close();
    await sql.end();
  });
  async function blocked(c: PoolClient) {
    for (let n = 0; n < 100; n++) {
      if (
        Number(
          (
            await c.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()",
            )
          ).rows[0].count,
        )
      )
        return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("No PostgreSQL lock wait observed");
  }
  const state = async (org: string) => ({
    invitations: (
      await sql.query(
        "SELECT * FROM organization_invitations WHERE organization_id=$1 ORDER BY id",
        [org],
      )
    ).rows,
    members: (
      await sql.query(
        "SELECT * FROM memberships WHERE organization_id=$1 ORDER BY id",
        [org],
      )
    ).rows,
    roles: (
      await sql.query(
        "SELECT r.* FROM membership_roles r JOIN memberships m ON m.id=r.membership_id WHERE m.organization_id=$1 ORDER BY r.id",
        [org],
      )
    ).rows,
    results: (
      await sql.query(
        "SELECT * FROM idempotency_records WHERE target_organization_id=$1 ORDER BY id",
        [org],
      )
    ).rows,
    events: (
      await sql.query(
        "SELECT * FROM outbox_events WHERE payload->>'organization_id'=$1 ORDER BY event_id",
        [org],
      )
    ).rows,
  });
  it("serializes same/different-key create races and replays normalized snapshots", async () => {
    const f = await fixture(p),
      key = randomUUID(),
      roles = [orgRole(f.org), orgRole(f.org, "OWNER")];
    const [a, b] = await Promise.all([
      f.invite(roles, key),
      f.invite([...roles].reverse(), key),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.body).toEqual(a.body);
    const g = await fixture(p);
    const pair = await Promise.all([g.invite(), g.invite()]);
    expect(pair.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(
      (
        await sql.query(
          "SELECT count(*) FROM organization_invitations WHERE organization_id=$1 AND status='PENDING'",
          [g.org],
        )
      ).rows[0].count,
    ).toBe("1");
  });
  it("accepts once under same-key race, stores schema-valid snapshot event/revision and replays after expiry/inviter demotion", async () => {
    const f = await fixture(p),
      createKey = randomUUID(),
      x = (await f.invite([orgRole(f.org)], createKey).expect(201)).body
        .invitation_id,
      key = randomUUID();
    const [a, b] = await Promise.all([
      f.action(f.recipient.id, x, "accept", key),
      f.action(f.recipient.id, x, "accept", key),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toEqual(a.body);
    contract("InvitationAccepted", a.body);
    const before = await state(f.org);
    expect(before.events).toHaveLength(3);
    const event = before.events.find(
      (e) => e.aggregate_id === a.body.membership_id,
    );
    expect(event.payload).toMatchObject({
      change_type: "CREATED",
      membership_revision: 1,
      roles: [orgRole(f.org)],
    });
    const ajv = new Ajv();
    formats(ajv);
    const { status, ...envelope } = event;
    expect(
      ajv.compile(
        JSON.parse(
          fs.readFileSync(
            "shared/contracts/events/membership-changed.v1.schema.json",
            "utf8",
          ),
        ),
      )({ ...envelope, occurred_at: event.occurred_at.toISOString() }),
    ).toBe(true);
    // Change the recipient's roles through the real P5 API, then demote inviter.
    const orgService = p.identity.get(OrganizationsService);
    await orgService.replace(f.owner.id, f.org, f.recipient.id, randomUUID(), {
      roles: [{ code: "OWNER", resource_type: "ORG", resource_id: f.org }],
    });
    await orgService.replace(f.recipient.id, f.org, f.owner.id, randomUUID(), {
      roles: [],
    });
    expect(
      (await f.action(f.recipient.id, x, "accept", key).expect(200)).body,
    ).toEqual(a.body);
    expect((await f.invite([orgRole(f.org)], createKey)).status).toBe(403);
    const snapshot = await state(f.org);
    expect((await f.action(f.recipient.id, x)).body.error.code).toBe(
      "INVITATION_NOT_PENDING",
    );
    expect(await state(f.org)).toEqual(snapshot);
    await p.db.membership.update({
      where: { id: a.body.membership_id },
      data: { status: "INACTIVE" },
    });
    expect((await f.action(f.recipient.id, x, "accept", key)).status).toBe(403);
  });
  it.each(["accept", "decline", "revoke"])(
    "accept racing %s has only one terminal winner",
    async (kind) => {
      const f = await fixture(p),
        id = (await f.invite().expect(201)).body.invitation_id;
      const [a, b] = await Promise.all([
        f.action(f.recipient.id, id),
        kind === "revoke" ? f.revoke(id) : f.action(f.recipient.id, id, kind),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const s = await state(f.org);
      const accepted = s.invitations[0].status === "ACCEPTED";
      expect(
        s.members.filter((m) => m.user_id === f.recipient.id),
      ).toHaveLength(accepted ? 1 : 0);
      expect(s.events).toHaveLength(accepted ? 3 : 2);
    },
  );
  it.each([
    "demote",
    "lock-inviter",
    "lock-recipient",
    "inactive-inviter",
    "expire",
  ])("rechecks %s after a real org-lock wait", async (kind) => {
    const f = await fixture(p),
      id = (await f.invite().expect(201)).body.invitation_id,
      c = await sql.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        f.org,
      ]);
      const pending = f.action(f.recipient.id, id).then((x) => x);
      await blocked(c);
      if (kind === "demote")
        await c.query(
          "DELETE FROM membership_roles WHERE membership_id=(SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2)",
          [f.org, f.owner.id],
        );
      if (kind === "lock-inviter" || kind === "lock-recipient")
        await c.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
          kind === "lock-inviter" ? f.owner.id : f.recipient.id,
        ]);
      if (kind === "inactive-inviter")
        await c.query(
          "UPDATE memberships SET status='INACTIVE' WHERE organization_id=$1 AND user_id=$2",
          [f.org, f.owner.id],
        );
      if (kind === "expire") now += 7 * 86400000;
      await c.query("COMMIT");
      const response = await pending;
      expect(response.status).toBe(kind === "expire" ? 409 : 403);
      if (kind === "expire")
        expect(response.body.error.code).toBe("INVITATION_EXPIRED");
      const s = await state(f.org);
      expect(
        s.members.filter((m) => m.user_id === f.recipient.id),
      ).toHaveLength(0);
      expect(s.events).toHaveLength(2);
      expect(
        s.results.filter((r) => r.operation === "ACCEPT_INVITATION"),
      ).toHaveLength(0);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
  it("waits for membership-row locks then rechecks inviter state and expiry", async () => {
    const f = await fixture(p),
      id = (await f.invite().expect(201)).body.invitation_id,
      c = await sql.connect();
    let pending: Promise<any> | undefined;
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
        [f.org, f.owner.id],
      );
      pending = f.action(f.recipient.id, id).then((x) => x);
      await blocked(c);
      await c.query(
        "UPDATE memberships SET status='INACTIVE' WHERE organization_id=$1 AND user_id=$2",
        [f.org, f.owner.id],
      );
      await c.query("COMMIT");
      expect((await pending).status).toBe(403);
    } finally {
      await c.query("ROLLBACK");
      c.release();
      await pending;
    }
  });
  it("rechecks expiry after an invitation-row wait, not transaction-start time", async () => {
    const f = await fixture(p),
      id = (await f.invite().expect(201)).body.invitation_id,
      c = await sql.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT id FROM organization_invitations WHERE id=$1 FOR UPDATE",
        [id],
      );
      const pending = f.action(f.recipient.id, id).then((x) => x);
      await blocked(c);
      now += 7 * 86400000;
      await c.query("COMMIT");
      expect((await pending).body.error.code).toBe("INVITATION_EXPIRED");
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
  it("scopes keys by actor/operation, rejects target/body conflict, TTL replay does not extend retention", async () => {
    const f = await fixture(p),
      key = randomUUID(),
      id = (await f.invite([], key).expect(201)).body.invitation_id;
    expect((await f.invite([orgRole(f.org)], key)).body.error.code).toBe(
      "CONFLICT",
    );
    const first = (
      await sql.query(
        "SELECT * FROM idempotency_records WHERE actor_user_id=$1 AND operation='CREATE_INVITATION' AND idempotency_key=$2",
        [f.owner.id, key],
      )
    ).rows[0];
    now += 3600000;
    expect((await f.invite([], key).expect(201)).body.invitation_id).toBe(id);
    expect(
      (
        await sql.query(
          "SELECT expires_at FROM idempotency_records WHERE id=$1",
          [first.id],
        )
      ).rows[0].expires_at,
    ).toEqual(first.expires_at);
    // The same key under ACCEPT is independent; replay survives invitation expiry while key remains live.
    now += 6 * 86400000 + 22.5 * 3600000;
    await f.action(f.recipient.id, id, "accept", key).expect(200);
    now += 3600000;
    await f.action(f.recipient.id, id, "accept", key).expect(200);
    now += 86400000;
    expect(
      (await f.action(f.recipient.id, id, "accept", key)).body.error.code,
    ).toBe("INVITATION_NOT_PENDING");
    const g = await fixture(p);
    const id2 = (await g.invite().expect(201)).body.invitation_id;
    const k = randomUUID();
    await f.action(f.recipient.id, id, "decline", k).expect(409);
    // Different target with a live successful decline cannot leak its cached response.
    await g.action(g.recipient.id, id2, "decline", k).expect(200);
    expect((await g.action(g.recipient.id, id, "decline", k)).status).toBe(403);
  });
  it("reuses expired create key for a new authorized target and checks live conflict rights", async () => {
    const f = await fixture(p),
      key = randomUUID();
    await f.invite([], key).expect(201);
    now += 86400000;
    await f
      .post(
        f.owner.id,
        `/organizations/${f.org}/members/invitations`,
        { email: f.other.email, roles: [] },
        key,
      )
      .expect(201);
    expect((await f.invite([], key)).body.error.code).toBe("CONFLICT");
    const g = await fixture(p);
    expect(
      (
        await f.post(
          f.owner.id,
          `/organizations/${g.org}/members/invitations`,
          { email: g.other.email, roles: [] },
          key,
        )
      ).status,
    ).toBe(403);
  });
  it("conflicts on a different authorized invitation target and org without disclosing cached success", async () => {
    const f = await fixture(p),
      key = randomUUID();
    const first = (await f.invite([], key).expect(201)).body.invitation_id;
    const service = p.identity.get(OrganizationsService),
      org = String(
        (
          await service.create(f.owner.id, randomUUID(), {
            name: "Second",
            slug: "second-" + randomUUID(),
          })
        ).body.organization_id,
      );
    const path = `/organizations/${org}/members/invitations`;
    expect(
      (
        await f.post(
          f.owner.id,
          path,
          { email: f.recipient.email, roles: [] },
          key,
        )
      ).body.error.code,
    ).toBe("CONFLICT");
    const second = (
      await f
        .post(f.owner.id, path, { email: f.recipient.email, roles: [] })
        .expect(201)
    ).body.invitation_id;
    const declineKey = randomUUID();
    await f.action(f.recipient.id, first, "decline", declineKey).expect(200);
    expect(
      (await f.action(f.recipient.id, second, "decline", declineKey)).body.error
        .code,
    ).toBe("CONFLICT");
    await f.action(f.recipient.id, second, "decline").expect(200);
  });
  it("rejects unknown/wrong-org EVENT create and rechecks creator rights after fixture resolve", async () => {
    const f = await fixture(p),
      event = randomUUID(),
      roles = [{ code: "SPEAKER", resource_type: "EVENT", resource_id: event }];
    expect((await f.invite(roles)).status).toBe(404);
    events.set(event, randomUUID());
    expect((await f.invite(roles)).status).toBe(403);
    resolve.mockImplementationOnce(async () => {
      await sql.query(
        "DELETE FROM membership_roles WHERE membership_id=(SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2)",
        [f.org, f.owner.id],
      );
      return { event_id: event, organization_id: f.org };
    });
    expect((await f.invite(roles)).status).toBe(403);
    expect((await state(f.org)).invitations).toHaveLength(0);
  });
  it("times out the same key and business lock without success result or partial writes", async () => {
    const f = await fixture(p),
      key = randomUUID(),
      c = await sql.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        JSON.stringify([f.owner.id, "CREATE_INVITATION", key]),
      ]);
      expect((await f.invite([], key)).body.error.code).toBe(
        "IDEMPOTENCY_IN_PROGRESS",
      );
      await c.query("ROLLBACK");
      await c.query("BEGIN");
      await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        f.org,
      ]);
      expect((await f.invite()).body.error.code).toBe("CONFLICT");
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
    expect((await state(f.org)).invitations).toHaveLength(0);
  });
  it("rolls back membership/assignments/revision/invitation/outbox/result when outbox or success persistence fails", async () => {
    for (const table of ["outbox_events", "idempotency_records"]) {
      const f = await fixture(p),
        id = (await f.invite().expect(201)).body.invitation_id,
        before = await state(f.org);
      const name = "p6_fault_" + randomUUID().replaceAll("-", "");
      const predicate =
        table === "outbox_events"
          ? `NEW.payload->>'user_id' = '${f.recipient.id}'`
          : `NEW.actor_user_id = '${f.recipient.id}'::uuid`;
      await sql.query(
        `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${predicate} THEN RAISE EXCEPTION 'synthetic P6 rollback'; END IF; RETURN NEW; END $$`,
      );
      await sql.query(
        `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`,
      );
      try {
        await f.action(f.recipient.id, id).expect(500);
        expect(await state(f.org)).toEqual(before);
      } finally {
        await sql.query(`DROP TRIGGER ${name} ON ${table}`);
        await sql.query(`DROP FUNCTION ${name}()`);
      }
      await f.action(f.recipient.id, id).expect(200);
    }
  });
  it("validates EVENT snapshots at create and accept, replay skips resolver, rechecks local rights after resolver wait", async () => {
    const f = await fixture(p),
      event = randomUUID();
    events.set(event, f.org);
    const roles = [
      { code: "SPEAKER", resource_type: "EVENT", resource_id: event },
    ];
    const id = (await f.invite(roles).expect(201)).body.invitation_id;
    events.delete(event);
    expect((await f.action(f.recipient.id, id)).status).toBe(404);
    events.set(event, randomUUID());
    expect((await f.action(f.recipient.id, id)).status).toBe(403);
    resolve.mockImplementationOnce(async () => ({
      event_id: randomUUID(),
      organization_id: f.org,
    }));
    expect((await f.action(f.recipient.id, id)).status).toBe(502);
    resolve.mockImplementationOnce(async () => {
      throw Error("offline fixture");
    });
    expect((await f.action(f.recipient.id, id)).status).toBe(502);
    resolve.mockImplementationOnce(async () =>
      fail(504, "UPSTREAM_TIMEOUT", "fixture timeout"),
    );
    expect((await f.action(f.recipient.id, id)).status).toBe(504);
    // Normal composition has no resolver, including accept of an existing EVENT invitation.
    const normal = await pair({ now: () => new Date(now) });
    try {
      const r = await (await import("supertest"))
        .default(normal.identity.getHttpServer())
        .post(`/users/me/invitations/${id}/accept`)
        .set("X-User-Id", f.recipient.id)
        .set("X-Session-Id", randomUUID())
        .set("Idempotency-Key", randomUUID())
        .send({});
      expect(r.body.error.code).toBe("EVENT_SCOPE_UNVERIFIED");
    } finally {
      await normal.close();
    }
    events.set(event, f.org);
    const key = randomUUID();
    await f.action(f.recipient.id, id, "accept", key).expect(200);
    const count = resolve.mock.calls.length;
    events.delete(event);
    await f.action(f.recipient.id, id, "accept", key).expect(200);
    expect(resolve).toHaveBeenCalledTimes(count);
    const g = await fixture(p),
      e = randomUUID();
    events.set(e, g.org);
    const gid = (
      await g
        .invite([{ code: "ATTENDEE", resource_type: "EVENT", resource_id: e }])
        .expect(201)
    ).body.invitation_id;
    resolve.mockImplementationOnce(async () => {
      await sql.query(
        "DELETE FROM membership_roles WHERE membership_id=(SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2)",
        [g.org, g.owner.id],
      );
      return { event_id: e, organization_id: g.org };
    });
    expect((await g.action(g.recipient.id, gid)).status).toBe(403);
    expect(
      (await state(g.org)).members.filter((m) => m.user_id === g.recipient.id),
    ).toHaveLength(0);
  });
});
