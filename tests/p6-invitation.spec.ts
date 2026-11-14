import request from "supertest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pair, contract, registration } from "./helpers";
import { fixture, orgRole, type Pair } from "./p6-helpers";
describe("P6 invitation real API and PostgreSQL", () => {
  let p: Pair;
  let now = Date.now();
  const sql = new Pool({ connectionString: process.env.DATABASE_URL });
  beforeAll(async () => {
    p = await pair({ now: () => new Date(now) });
  });
  afterAll(async () => {
    await p?.close();
    await sql.end();
  });
  const code = (r: any, status: number, c: string) => {
    expect(r.status).toBe(status);
    expect(r.body.error.code).toBe(c);
    contract("Error", r.body);
  };
  const inbox = (actor: string, query = "") =>
    request(p.identity.getHttpServer())
      .get("/users/me/invitations" + query)
      .set("X-User-Id", actor)
      .set("X-Session-Id", randomUUID());
  it("has additive FK/partial uniqueness/lifecycle constraints", async () => {
    const f = await fixture(p);
    const x = await f.invite().expect(201);
    const rows = await sql.query(
      "SELECT * FROM organization_invitations WHERE id=$1",
      [x.body.invitation_id],
    );
    const row = rows.rows[0];
    expect(row.invitee_user_id).toBe(f.recipient.id);
    await expect(
      sql.query(
        "INSERT INTO organization_invitations(id,organization_id,inviter_user_id,invitee_user_id,roles,created_at,expires_at) VALUES($1,$2,$3,$4,'[]',now(),now()+interval '7 days')",
        [randomUUID(), f.org, f.owner.id, f.recipient.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql.query(
        "UPDATE organization_invitations SET status='INVALID' WHERE id=$1",
        [row.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql.query(
        "UPDATE organization_invitations SET inviter_user_id=$1 WHERE id=$2",
        [randomUUID(), row.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql.query("UPDATE organization_invitations SET roles='{}' WHERE id=$1", [
        row.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("creates/lists/accepts through Gateway and exposes membership in users/me", async () => {
    const a = registration(),
      b = registration(),
      g = () => request(p.gateway.getHttpServer());
    await g().post("/api/auth/register").send(a).expect(200);
    await g().post("/api/auth/register").send(b).expect(200);
    const login = async (u: typeof a) =>
      (
        await g()
          .post("/api/auth/login")
          .send({ email: u.email, password: u.password })
          .expect(200)
      ).body.access_token;
    const at = await login(a),
      bt = await login(b);
    const org = (
      await g()
        .post("/api/organizations")
        .set("Authorization", "Bearer " + at)
        .set("Idempotency-Key", randomUUID())
        .send({ name: "Gateway P6", slug: "gw-" + randomUUID() })
        .expect(201)
    ).body.organization_id;
    const invite = (
      await g()
        .post(`/api/organizations/${org}/members/invitations`)
        .set("Authorization", "Bearer " + at)
        .set("Idempotency-Key", randomUUID())
        .send({ email: b.email, roles: [orgRole(org)] })
        .expect(201)
    ).body;
    contract("InvitationCreated", invite);
    const list = await g()
      .get("/api/users/me/invitations")
      .set("Authorization", "Bearer " + bt)
      .expect(200);
    contract("Invitations", list.body);
    expect(list.body.items[0].id).toBe(invite.invitation_id);
    const key = randomUUID(),
      accept = () =>
        g()
          .post(`/api/users/me/invitations/${invite.invitation_id}/accept`)
          .set("Authorization", "Bearer " + bt)
          .set("Idempotency-Key", key)
          .send({});
    const accepted = await accept().expect(200);
    contract("InvitationAccepted", accepted.body);
    expect((await accept().expect(200)).body).toEqual(accepted.body);
    expect(
      (
        await g()
          .get("/api/users/me")
          .set("Authorization", "Bearer " + bt)
          .expect(200)
      ).body.memberships,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organization_id: org, roles: ["ADMIN"] }),
      ]),
    );
    const docs = await g().get("/docs-json").expect(200);
    expect(docs.body.paths["/api/users/me/invitations"]).toBeDefined();
    expect(
      Object.keys(docs.body.paths).some((x) => x.includes("/internal/")),
    ).toBe(false);
    await g().post("/api/internal/authorization/check").send({}).expect(404);
  });
  it("validates actor, token, key, recipient, tenant, role, email and pagination", async () => {
    const f = await fixture(p),
      path = `/organizations/${f.org}/members/invitations`;
    code(
      await request(p.gateway.getHttpServer())
        .post("/api" + path)
        .send({}),
      401,
      "UNAUTHENTICATED",
    );
    code(
      await f.post(
        f.owner.id,
        path,
        { email: f.recipient.email, roles: [] },
        "",
      ),
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    code(
      await f.post(f.other.id, path, { email: "missing@p6.test", roles: [] }),
      403,
      "FORBIDDEN",
    );
    code(
      await f.post(f.owner.id, path, { email: "missing@p6.test", roles: [] }),
      404,
      "NOT_FOUND",
    );
    for (const roles of [
      [orgRole(randomUUID())],
      [orgRole(f.org, "SPEAKER")],
      [orgRole(f.org), orgRole(f.org)],
    ])
      code(await f.invite(roles), 400, "VALIDATION_FAILED");
    const x = (await f.invite().expect(201)).body.invitation_id;
    code(await f.action(f.other.id, x), 403, "FORBIDDEN");
    code(
      await f.action(f.recipient.id, x, "accept", randomUUID(), { roles: [] }),
      400,
      "VALIDATION_FAILED",
    );
    expect((await inbox(f.other.id).expect(200)).body.items).toEqual([]);
    code(
      await inbox(f.recipient.id, "?status=PENDING"),
      400,
      "VALIDATION_FAILED",
    );
    code(await inbox(f.recipient.id, "?limit=101"), 400, "VALIDATION_FAILED");
    const page = await inbox(f.recipient.id, "?limit=1&offset=1").expect(200);
    contract("Invitations", page.body);
    expect(page.body.total).toBe(1);
    expect(page.body.items).toEqual([]);
    const another = await fixture(p);
    code(
      await another.post(
        another.owner.id,
        `/organizations/${another.org}/members/invitations/${x}/revoke`,
      ),
      404,
      "NOT_FOUND",
    );
    code(await f.action(f.recipient.id, randomUUID()), 404, "NOT_FOUND");
  });
  it("rejects duplicate PENDING and existing ACTIVE/INACTIVE memberships without role overwrite", async () => {
    const f = await fixture(p);
    const x = (await f.invite().expect(201)).body.invitation_id;
    code(await f.invite([]), 409, "INVITATION_ALREADY_PENDING");
    const m = await p.db.membership.create({
      data: {
        organization_id: f.org,
        user_id: f.recipient.id,
        status: "INACTIVE",
      },
    });
    code(await f.invite(), 409, "ALREADY_MEMBER");
    code(await f.action(f.recipient.id, x), 409, "ALREADY_MEMBER");
    expect(
      (await p.db.membership.findUniqueOrThrow({ where: { id: m.id } })).status,
    ).toBe("INACTIVE");
    await p.db.membership.update({
      where: { id: m.id },
      data: { status: "ACTIVE" },
    });
    code(await f.action(f.recipient.id, x), 409, "ALREADY_MEMBER");
    expect(
      await p.db.outboxEvent.count({ where: { aggregate_id: m.id } }),
    ).toBe(0);
  });
  it("declines/revokes only once and emits no membership events", async () => {
    for (const kind of ["decline", "revoke"]) {
      const f = await fixture(p),
        x = (await f.invite().expect(201)).body.invitation_id,
        key = randomUUID();
      const run = () =>
        kind === "decline"
          ? f.action(f.recipient.id, x, kind, key)
          : f.revoke(x, key);
      const result = await run().expect(200);
      contract(
        kind === "decline" ? "InvitationDeclined" : "InvitationRevoked",
        result.body,
      );
      expect((await run().expect(200)).body).toEqual(result.body);
      code(await f.action(f.recipient.id, x), 409, "INVITATION_NOT_PENDING");
      code(
        await (kind === "decline"
          ? f.action(f.recipient.id, x, kind)
          : f.revoke(x)),
        409,
        "INVITATION_NOT_PENDING",
      );
      expect(
        await p.db.membership.count({
          where: { organization_id: f.org, user_id: f.recipient.id },
        }),
      ).toBe(0);
    }
  });
  it("expires read-only in list then materializes expiry on fresh mutation and permits a new invite", async () => {
    const f = await fixture(p),
      x = (await f.invite().expect(201)).body;
    now += 7 * 86400000;
    const list = (await inbox(f.recipient.id).expect(200)).body;
    expect(list.items[0]).toMatchObject({
      status: "EXPIRED",
      processed_at: x.expires_at,
    });
    expect(
      (
        await sql.query(
          "SELECT status FROM organization_invitations WHERE id=$1",
          [x.invitation_id],
        )
      ).rows[0].status,
    ).toBe("PENDING");
    code(
      await f.action(f.recipient.id, x.invitation_id),
      409,
      "INVITATION_EXPIRED",
    );
    const next = await f.invite().expect(201);
    expect(next.body.invitation_id).not.toBe(x.invitation_id);
    expect(
      (
        await sql.query(
          "SELECT status FROM organization_invitations WHERE id=$1",
          [x.invitation_id],
        )
      ).rows[0].status,
    ).toBe("EXPIRED");
  });
  it("blocks LOCKED users, INACTIVE inviter and lost OWNER; allows recipient decline despite inviter loss", async () => {
    const f = await fixture(p),
      path = `/organizations/${f.org}/members/invitations`;
    await p.db.user.update({
      where: { id: f.recipient.id },
      data: { status: "LOCKED" },
    });
    code(await f.invite(), 403, "FORBIDDEN");
    await p.db.user.update({
      where: { id: f.recipient.id },
      data: { status: "ACTIVE" },
    });
    const id = (await f.invite().expect(201)).body.invitation_id;
    await p.db.user.update({
      where: { id: f.recipient.id },
      data: { status: "LOCKED" },
    });
    code(await f.action(f.recipient.id, id), 403, "FORBIDDEN");
    code(await inbox(f.recipient.id), 403, "FORBIDDEN");
    await p.db.user.update({
      where: { id: f.recipient.id },
      data: { status: "ACTIVE" },
    });
    await p.db.membership.update({
      where: {
        organization_id_user_id: {
          organization_id: f.org,
          user_id: f.owner.id,
        },
      },
      data: { status: "INACTIVE" },
    });
    code(await f.action(f.recipient.id, id), 403, "FORBIDDEN");
    code(
      await f.post(f.owner.id, path, { email: f.other.email, roles: [] }),
      403,
      "FORBIDDEN",
    );
    await f.action(f.recipient.id, id, "decline").expect(200);
  });
  it("fails closed for EVENT create without resolver", async () => {
    const f = await fixture(p);
    code(
      await f.invite([
        { code: "SPEAKER", resource_type: "EVENT", resource_id: randomUUID() },
      ]),
      409,
      "EVENT_SCOPE_UNVERIFIED",
    );
    expect(
      (
        await sql.query(
          "SELECT count(*) FROM organization_invitations WHERE organization_id=$1",
          [f.org],
        )
      ).rows[0].count,
    ).toBe("0");
  });
  it("expires old PENDING during create, keeps one pending winner and lets another OWNER revoke", async () => {
    const f = await fixture(p);
    const first = (await f.invite([]).expect(201)).body.invitation_id;
    now += 7 * 86400000;
    const responses = await Promise.all([f.invite([]), f.invite([])]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const next = responses.find((r) => r.status === 201)!.body.invitation_id;
    expect(
      (
        await sql.query(
          "SELECT status FROM organization_invitations WHERE id=$1",
          [first],
        )
      ).rows[0].status,
    ).toBe("EXPIRED");
    const role = await p.db.role.findFirstOrThrow({
      where: { code: "OWNER", organization_id: null },
    });
    await p.db.membership.create({
      data: {
        organization_id: f.org,
        user_id: f.other.id,
        assignments: {
          create: { role_id: role.id, resource_type: "ORG", resource_id: null },
        },
      },
    });
    await f
      .post(
        f.other.id,
        `/organizations/${f.org}/members/invitations/${next}/revoke`,
      )
      .expect(200);
    const inboxResponse = await inbox(f.recipient.id).expect(200);
    contract("Invitations", inboxResponse.body);
    expect(inboxResponse.body.items.map((i: any) => i.id)).toEqual([
      next,
      first,
    ]);
    expect(
      await p.db.membership.count({
        where: { organization_id: f.org, user_id: f.recipient.id },
      }),
    ).toBe(0);
  });
});
