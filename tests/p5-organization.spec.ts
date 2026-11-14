import request from "supertest";
import { randomUUID } from "node:crypto";
import { pair, registration, contract, storedEnvelope } from "./helpers";
import { Pool } from "pg";
import Ajv from "ajv";
import formats from "ajv-formats";
import fs from "node:fs";

const id = (group: number, n: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const role = (org: string, code = "OWNER") => ({
  code,
  resource_type: "ORG",
  resource_id: org,
});
describe("P5 real PostgreSQL organization API and RBAC", () => {
  let p: Awaited<ReturnType<typeof pair>>;
  const sql = new Pool({ connectionString: process.env.DATABASE_URL });
  let token: string, actor: string;
  const A = id(4, 1),
    B = id(4, 2);
  beforeAll(async () => {
    p = await pair();
    const input = registration();
    actor = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/register")
        .send(input)
        .expect(200)
    ).body.user_id;
    token = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/login")
        .send({ email: input.email, password: input.password })
        .expect(200)
    ).body.access_token;
  });
  afterAll(async () => {
    await p?.close();
    await sql.end();
  });
  const auth = () => request(p.gateway.getHttpServer());
  async function create(key = randomUUID(), slug = "org-" + randomUUID()) {
    return auth()
      .post("/api/organizations")
      .set("Authorization", "Bearer " + token)
      .set("Idempotency-Key", key)
      .send({ name: " Org ", slug });
  }
  async function seedToken(label = "owner1") {
    return (
      await auth()
        .post("/api/auth/login")
        .send({ email: label + "@demo.lamu.test", password: "LocalDemo!2026" })
        .expect(200)
    ).body.access_token as string;
  }
  function check(
    user_id: string,
    organization_id: string,
    permission = "org.read",
    resource_type = "ORG",
    resource_id = organization_id,
  ) {
    return request(p.identity.getHttpServer())
      .post("/internal/authorization/check")
      .send({
        user_id,
        organization_id,
        permission,
        resource_type,
        resource_id,
      });
  }
  it("requires the additive schema and preserves M1 baseline membership revisions", async () => {
    expect(
      (
        await sql.query(
          "SELECT membership_revision FROM memberships WHERE id=$1",
          [id(5, 1)],
        )
      ).rows[0].membership_revision,
    ).toBe("1");
    expect(
      (await sql.query("SELECT count(*) FROM idempotency_records")).rows[0]
        .count,
    ).toBeDefined();
  });
  it("creates org/OWNER/revision/two schema-valid events and replays atomically through Gateway", async () => {
    const key = randomUUID(),
      slug = "org-" + randomUUID();
    const [x, y] = await Promise.all([create(key, slug), create(key, slug)]);
    expect(x.status).toBe(201);
    expect(y.status).toBe(201);
    expect(y.body).toEqual(x.body);
    contract("OrganizationCreatedResult", x.body);
    const org = x.body.organization_id;
    const membership = await p.db.membership.findUniqueOrThrow({
      where: {
        organization_id_user_id: { organization_id: org, user_id: actor },
      },
      include: { assignments: { include: { role: true } } },
    });
    expect(membership.assignments.map((a) => a.role.code)).toEqual(["OWNER"]);
    const events = await p.db.outboxEvent.findMany({
      where: { aggregate_id: { in: [org, membership.id] } },
    });
    expect(events).toHaveLength(2);
    const ajv = new Ajv();
    formats(ajv);
    for (const row of events) {
      const name =
        row.event_type === "OrganizationCreated"
          ? "organization-created"
          : "membership-changed";
      const event = storedEnvelope(row);
      expect(
        ajv.compile(
          JSON.parse(
            fs.readFileSync(
              `shared/contracts/events/${name}.v1.schema.json`,
              "utf8",
            ),
          ),
        )(event),
      ).toBe(true);
      expect(row.aggregate_id).toBe(
        (row.payload as any)[
          name === "organization-created" ? "organization_id" : "membership_id"
        ],
      );
    }
    const got = await auth()
      .get("/api/organizations/" + org)
      .set("Authorization", "Bearer " + token)
      .expect(200);
    contract("Organization", got.body);
    expect(got.body.my_roles).toEqual(["OWNER"]);
    expect(got.body.name).toBe("Org");
    const publicOrg = await auth()
      .get("/api/public/organizations/" + slug)
      .expect(200);
    contract("PublicOrganization", publicOrg.body);
    const members = await auth()
      .get(`/api/organizations/${org}/members?limit=1&offset=0`)
      .set("Authorization", "Bearer " + token)
      .expect(200);
    contract("OrganizationMembers", members.body);
    expect(members.body.total).toBe(1);
    expect(members.body.items[0].roles).toEqual([role(org)]);
    const empty = await auth()
      .get(`/api/organizations/${org}/members?offset=1`)
      .set("Authorization", "Bearer " + token)
      .expect(200);
    expect(empty.body.items).toEqual([]);
    const noKey = await auth()
      .post("/api/organizations")
      .set("Authorization", "Bearer " + token)
      .send({ name: "x", slug: "abc" })
      .expect(400);
    expect(noKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const conflict = await create(key, "different-" + randomUUID());
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("CONFLICT");
    const duplicate = await create(randomUUID(), slug);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("SLUG_TAKEN");
  });
  it("fails closed for wrong tenant, forged context, invalid UUID/body/query and internal Gateway paths", async () => {
    for (const path of [
      `/api/organizations/${A}`,
      `/api/organizations/${A}/members`,
    ])
      await auth()
        .get(path)
        .set("Authorization", "Bearer " + token)
        .set("X-User-Id", id(1, 1))
        .expect(403);
    await auth()
      .get("/api/organizations/" + A)
      .set("X-User-Id", id(1, 1))
      .expect(401);
    const owner = await seedToken();
    for (const suffix of [
      "?limit=0",
      "?limit=101",
      "?offset=-1",
      "?limit=1.5",
      "?extra=1",
      "?limit=1&limit=2",
    ])
      await auth()
        .get(`/api/organizations/${A}/members${suffix}`)
        .set("Authorization", "Bearer " + owner)
        .expect(400);
    await auth()
      .get("/api/organizations/invalid")
      .set("Authorization", "Bearer " + token)
      .expect(400);
    await auth().post("/api/internal/authorization/check").send({}).expect(404);
    await auth()
      .get("/api/internal/users/" + actor + "/public-profile")
      .expect(404);
    const swagger = (await auth().get("/docs-json").expect(200)).body;
    expect(
      Object.keys(swagger.paths).some((x) => x.includes("/internal/")),
    ).toBe(false);
    await auth()
      .post("/api/organizations")
      .set("Authorization", "Bearer " + token)
      .set("Idempotency-Key", "bad key")
      .send({ name: "X", slug: "valid" })
      .expect(400);
    await auth()
      .post("/api/organizations")
      .set("Authorization", "Bearer " + token)
      .set("Idempotency-Key", randomUUID())
      .send({ name: 3, slug: "valid", created_by: id(1, 1) })
      .expect(400);
    await auth().get("/api/public/organizations/missing-org").expect(404);
  });
  it("implements the permission matrix without granting SPEAKER E1 rights on E2 or org", async () => {
    const matrix: Record<string, string[]> = {
      ORG: [
        "org.read",
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
    const all = [...new Set(Object.values(matrix).flat())];
    const event = id(7, 1),
      e2 = id(7, 2);
    const attendee = await p.db.user.create({
      data: {
        id: randomUUID(),
        email: randomUUID() + "@fixture.test",
        display_name: "Attendee",
        password_hash: "synthetic-fixture",
      },
    });
    const attendeeRole = await p.db.role.findFirstOrThrow({
      where: { code: "ATTENDEE", organization_id: null },
    });
    await p.db.membership.create({
      data: {
        id: randomUUID(),
        organization_id: A,
        user_id: attendee.id,
        assignments: {
          create: {
            id: randomUUID(),
            role_id: attendeeRole.id,
            resource_type: "EVENT",
            resource_id: event,
          },
        },
      },
    });
    const subjects = [
      { id: id(1, 1), code: "OWNER" },
      { id: id(1, 3), code: "ADMIN" },
      { id: id(1, 4), code: "SPEAKER" },
      { id: attendee.id, code: "ATTENDEE" },
    ];
    for (const [scope, permissions] of Object.entries(matrix))
      for (const permission of all)
        for (const subject of subjects) {
          const res = await check(
            subject.id,
            A,
            permission,
            scope,
            scope === "ORG" ? A : event,
          );
          expect(res.status).toBe(permissions.includes(permission) ? 200 : 400);
          if (res.status === 200) {
            contract("AuthorizationResult", res.body);
            const allowed =
              subject.code === "OWNER" ||
              (subject.code === "ADMIN" &&
                permission !== "org.member.manage") ||
              (subject.code === "SPEAKER" &&
                scope === "EVENT" &&
                permission === "event.read");
            expect(res.body.allowed).toBe(allowed);
          }
        }
    expect((await check(id(1, 3), A, "org.member.manage")).body.reason).toBe(
      "PERMISSION_DENIED",
    );
    expect(
      (await check(id(1, 3), A, "event.update", "EVENT", event)).body.allowed,
    ).toBe(true);
    expect((await check(id(1, 1), B)).body.reason).toBe("NO_ACTIVE_MEMBERSHIP");
    expect(
      (await check(id(1, 4), A, "event.read", "EVENT", event)).body.allowed,
    ).toBe(true);
    expect(
      (await check(id(1, 4), A, "event.read", "EVENT", e2)).body.allowed,
    ).toBe(false);
    expect((await check(id(1, 4), A, "event.read")).body.allowed).toBe(false);
    expect(
      (await check(id(1, 4), A, "event.update", "EVENT", event)).body.allowed,
    ).toBe(false);
    expect((await check(id(1, 5), A)).body.reason).toBe("NO_ACTIVE_MEMBERSHIP");
    expect((await check(randomUUID(), A)).body.reason).toBe("USER_NOT_FOUND");
  });
  it("validates authorization input before evaluating any subject", async () => {
    const base = {
      user_id: actor,
      organization_id: A,
      resource_type: "ORG",
      resource_id: A,
      permission: "org.read",
    };
    for (const body of [
      { ...base, resource_id: B },
      { ...base, permission: "admin.all" },
      { ...base, resource_type: "EVENT", resource_id: undefined },
      { ...base, user_id: "invalid" },
      { ...base, extra: true },
      { ...base, organization_id: undefined },
    ]) {
      const res = await request(p.identity.getHttpServer())
        .post("/internal/authorization/check")
        .send(body)
        .expect(400);
      contract("Error", res.body);
    }
  });
  it("hides LOCKED public users and denies inactive memberships/current locked actors", async () => {
    const org = (await create()).body.organization_id;
    try {
      await p.db.user.update({
        where: { id: actor },
        data: { status: "LOCKED" },
      });
      expect((await check(actor, org)).body.reason).toBe("USER_LOCKED");
      await auth()
        .get("/api/organizations/" + org)
        .set("Authorization", "Bearer " + token)
        .expect(403);
      await request(p.identity.getHttpServer())
        .get("/internal/users/" + actor + "/public-profile")
        .expect(404);
      expect((await create()).status).toBe(403);
    } finally {
      await p.db.user.update({
        where: { id: actor },
        data: { status: "ACTIVE" },
      });
    }
    await p.db.membership.update({
      where: {
        organization_id_user_id: { organization_id: org, user_id: actor },
      },
      data: { status: "INACTIVE" },
    });
    expect((await check(actor, org)).body.reason).toBe("NO_ACTIVE_MEMBERSHIP");
    const profile = await request(p.identity.getHttpServer())
      .get("/internal/users/" + actor + "/public-profile")
      .expect(200);
    contract("PublicUser", profile.body);
    expect(profile.body).toEqual({ id: actor, display_name: "Test User" });
    await request(p.identity.getHttpServer())
      .get("/internal/users/" + randomUUID() + "/public-profile")
      .expect(404);
  });
  it("replaces roles once, supports no-op/replay, protects final OWNER and fails closed without Event resolver", async () => {
    const org = (await create()).body.organization_id;
    const target = await p.db.membership.findFirstOrThrow({
      where: { organization_id: org },
    });
    const send = (roles: unknown[], key = randomUUID()) =>
      auth()
        .put(`/api/organizations/${org}/members/${actor}/roles`)
        .set("Authorization", "Bearer " + token)
        .set("Idempotency-Key", key)
        .send({ roles });
    const initial = await p.db.outboxEvent.count({
      where: { aggregate_id: target.id },
    });
    const key = randomUUID();
    await send([role(org)], key).expect(200);
    await send([role(org)], key).expect(200);
    expect(
      await p.db.outboxEvent.count({ where: { aggregate_id: target.id } }),
    ).toBe(initial);
    const last = await send([]).expect(409);
    expect(last.body.error.code).toBe("LAST_OWNER_REQUIRED");
    const event = await send([
      role(org),
      { code: "SPEAKER", resource_type: "EVENT", resource_id: id(6, 1) },
    ]).expect(409);
    expect(event.body.error.code).toBe("EVENT_SCOPE_UNVERIFIED");
    await send([role(B)]).expect(400);
    await send([role(org), role(org)]).expect(400);
    const changeKey = randomUUID();
    await send([role(org), role(org, "ADMIN")], changeKey).expect(200);
    await send([role(org, "ADMIN"), role(org)], changeKey).expect(200);
    expect(
      await p.db.outboxEvent.count({ where: { aggregate_id: target.id } }),
    ).toBe(initial + 1);
    expect(
      (
        await sql.query(
          "SELECT membership_revision FROM memberships WHERE id=$1",
          [target.id],
        )
      ).rows[0].membership_revision,
    ).toBe("2");
    const row = await p.db.outboxEvent.findFirstOrThrow({
      where: { aggregate_id: target.id, event_type: "MembershipChanged" },
      orderBy: { occurred_at: "desc" },
    });
    expect((row.payload as any).change_type).toBe("ROLES_REPLACED");
    expect((row.payload as any).membership_revision).toBe(2);
  });
  it("rolls back org/member/idempotency/revision when outbox insert fails", async () => {
    await sql.query(
      "CREATE FUNCTION p5_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='MembershipChanged' THEN RAISE EXCEPTION 'synthetic fault'; END IF; RETURN NEW; END $$",
    );
    await sql.query(
      "CREATE TRIGGER p5_fault BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION p5_fail_outbox()",
    );
    const slug = "rollback-" + randomUUID(),
      key = randomUUID();
    const before = await p.db.membership.count({ where: { user_id: actor } });
    try {
      expect((await create(key, slug)).status).toBe(500);
      expect(await p.db.organization.count({ where: { slug } })).toBe(0);
      expect(await p.db.membership.count({ where: { user_id: actor } })).toBe(
        before,
      );
      // OrganizationCreated is inserted first; failure at the second event
      // must roll back that already-inserted outbox row as well.
      expect(
        await p.db.outboxEvent.count({
          where: { payload: { path: ["slug"], equals: slug } },
        }),
      ).toBe(0);
      expect(
        (
          await sql.query(
            "SELECT count(*) FROM idempotency_records WHERE idempotency_key=$1",
            [key],
          )
        ).rows[0].count,
      ).toBe("0");
    } finally {
      await sql.query("DROP TRIGGER p5_fault ON outbox_events");
      await sql.query("DROP FUNCTION p5_fail_outbox()");
    }
    expect((await create(key, slug)).status).toBe(201);
  });
});
