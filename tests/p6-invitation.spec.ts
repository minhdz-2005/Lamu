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
      .set("X-Session-Id", actor);
  const outgoing = (actor: string, org: string, query = "") =>
    request(p.identity.getHttpServer())
      .get(`/organizations/${org}/members/invitations${query}`)
      .set("X-User-Id", actor)
      .set("X-Session-Id", actor);

  it("lists only the organization's invitations for current active owners", async () => {
    const f = await fixture(p);
    const another = await fixture(p);
    const route = `/organizations/${f.org}/members/invitations`;
    const createMembership = async (user: string, role?: "OWNER" | "ADMIN") => {
      const membership = await p.db.membership.create({
        data: { user_id: user, organization_id: f.org },
      });
      if (role) {
        const reference = await p.db.role.findFirstOrThrow({
          where: { code: role, scope: "ORG", organization_id: null },
        });
        await p.db.membershipRole.create({
          data: {
            membership_id: membership.id,
            role_id: reference.id,
            resource_type: "ORG",
          },
        });
      }
      return membership;
    };
    const secondOwner = await createMembership(f.other.id, "OWNER");
    await createMembership(another.other.id, "ADMIN");
    await createMembership(another.recipient.id);

    expect((await outgoing(f.owner.id, f.org).expect(200)).body).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    await another.invite().expect(201);
    const first = (await f.invite().expect(201)).body;
    const second = (
      await f
        .post(f.other.id, route, {
          email: another.owner.email,
          roles: [],
        })
        .expect(201)
    ).body;
    await p.db.user.update({
      where: { id: f.recipient.id },
      data: { display_name: "Updated recipient" },
    });

    const actual = [first.invitation_id, second.invitation_id].sort().reverse();
    const defaultPage = await outgoing(f.owner.id, f.org)
      .expect("Cache-Control", "no-store")
      .expect(200);
    contract("OrganizationInvitations", defaultPage.body);
    expect(
      defaultPage.body.items.map((item: { id: string }) => item.id),
    ).toEqual(actual);
    expect(defaultPage.body.items).toContainEqual({
      id: first.invitation_id,
      organization_id: f.org,
      inviter_user_id: f.owner.id,
      invitee_user_id: f.recipient.id,
      invitee_display_name: "Updated recipient",
      invitee_email: f.recipient.email,
      roles: [orgRole(f.org)],
      status: "PENDING",
      created_at: new Date(now).toISOString(),
      expires_at: first.expires_at,
      processed_at: null,
    });
    const page = await outgoing(f.other.id, f.org, "?limit=1&offset=1").expect(
      200,
    );
    contract("OrganizationInvitations", page.body);
    expect(page.body).toMatchObject({
      items: [{ id: actual[1] }],
      total: 2,
      limit: 1,
      offset: 1,
    });
    expect(
      (await outgoing(f.owner.id, f.org, "?offset=2").expect(200)).body,
    ).toMatchObject({
      total: 2,
      items: [],
    });
    await f
      .post(f.other.id, route + "/" + first.invitation_id + "/revoke")
      .expect(200);
    await f
      .action(another.owner.id, second.invitation_id, "decline")
      .expect(200);
    const revoked = await outgoing(f.owner.id, f.org).expect(200);
    expect(revoked.body.items).toContainEqual(
      expect.objectContaining({
        id: first.invitation_id,
        status: "REVOKED",
        processed_at: new Date(now).toISOString(),
      }),
    );
    expect(revoked.body.items).toContainEqual(
      expect.objectContaining({ id: second.invitation_id, status: "DECLINED" }),
    );
    const recipientInbox = await inbox(f.recipient.id).expect(200);
    contract("Invitations", recipientInbox.body);
    expect(recipientInbox.body.items[0]).toMatchObject({
      id: first.invitation_id,
      status: "REVOKED",
    });
    expect(recipientInbox.body.items[0]).not.toHaveProperty("invitee_email");

    for (const actor of [
      f.recipient.id,
      another.owner.id,
      another.other.id,
      another.recipient.id,
    ])
      code(await outgoing(actor, f.org), 403, "FORBIDDEN");
    code(await outgoing(f.owner.id, another.org), 403, "FORBIDDEN");
    await p.db.membership.update({
      where: { id: secondOwner.id },
      data: { status: "INACTIVE" },
    });
    code(await outgoing(f.other.id, f.org), 403, "FORBIDDEN");
    await p.db.user.update({
      where: { id: f.owner.id },
      data: { status: "LOCKED" },
    });
    code(await outgoing(f.owner.id, f.org), 403, "FORBIDDEN");
    code(await outgoing(another.owner.id, randomUUID()), 404, "NOT_FOUND");
    code(await outgoing(another.owner.id, "bad-id"), 400, "VALIDATION_FAILED");
    for (const query of [
      "?limit=101",
      "?limit=1&limit=2",
      "?offset=-1",
      "?status=PENDING",
    ])
      code(
        await outgoing(another.owner.id, another.org, query),
        400,
        "VALIDATION_FAILED",
      );
  });

  it("computes effective outgoing expiry and preserves EVENT role snapshots without writes", async () => {
    const f = await fixture(p);
    const created = (await f.invite().expect(201)).body;
    const role = {
      code: "SPEAKER",
      resource_type: "EVENT",
      resource_id: randomUUID(),
    };
    const before = await p.db.organizationInvitation.update({
      where: { id: created.invitation_id },
      data: {
        roles: [role],
        created_at: new Date(now - 7 * 86400000),
        expires_at: new Date(now),
      },
    });
    const page = await outgoing(f.owner.id, f.org).expect(200);
    contract("OrganizationInvitations", page.body);
    expect(page.body.items).toEqual([
      expect.objectContaining({
        id: created.invitation_id,
        roles: [role],
        status: "EXPIRED",
        processed_at: new Date(now).toISOString(),
      }),
    ]);
    expect(
      await p.db.organizationInvitation.findUniqueOrThrow({
        where: { id: created.invitation_id },
      }),
    ).toEqual(before);
  });

  it("uses the organization sort index for a representative outgoing page", async () => {
    const target = await fixture(p);
    const bulk = await fixture(p);
    const client = await sql.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO organization_invitations (
          id, organization_id, inviter_user_id, invitee_user_id, roles,
          status, created_at, expires_at, processed_at
        )
        SELECT gen_random_uuid(), organization_id::uuid, $3, $4, '[]',
          'EXPIRED', created, created + interval '7 days', created + interval '7 days'
        FROM (VALUES ($1, 120), ($2, 20000)) AS organizations(organization_id, amount)
        CROSS JOIN LATERAL generate_series(1, amount) AS entries(i)
        CROSS JOIN LATERAL (SELECT now() - i * interval '1 day' AS created) AS dates`,
        [target.org, bulk.org, target.owner.id, target.recipient.id],
      );
      await client.query("ANALYZE organization_invitations");
      const result = await client.query(
        `EXPLAIN (COSTS OFF) SELECT *
          FROM organization_invitations
          WHERE organization_id=$1
          ORDER BY created_at DESC, id DESC
          LIMIT 20 OFFSET 20`,
        [target.org],
      );
      expect(result.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
        "Index Scan using organization_invitations_outgoing_idx",
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
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
    const sentPath = `/api/organizations/${org}/members/invitations`;
    await g().get(sentPath).expect(401);
    const owner = await p.db.user.findUniqueOrThrow({
      where: { email: a.email },
    });
    const ownerSession = await p.db.refreshSession.findFirstOrThrow({
      where: { user_id: owner.id },
    });
    await g()
      .get(sentPath)
      .set("Authorization", "Bearer " + bt)
      .set("X-User-Id", owner.id)
      .set("X-Session-Id", ownerSession.id)
      .expect(403);
    const sent = await g()
      .get(sentPath + "?limit=1&offset=0")
      .set("Authorization", "Bearer " + at)
      .expect("Cache-Control", "no-store")
      .expect(200);
    contract("OrganizationInvitations", sent.body);
    expect(sent.body).toMatchObject({
      items: [{ id: invite.invitation_id, invitee_email: b.email }],
      total: 1,
      limit: 1,
      offset: 0,
    });
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
    const sentAfterAccept = await g()
      .get(sentPath)
      .set("Authorization", "Bearer " + at)
      .expect(200);
    expect(sentAfterAccept.body.items[0]).toMatchObject({
      id: invite.invitation_id,
      status: "ACCEPTED",
    });
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
      docs.body.paths["/api/organizations/{orgId}/members/invitations"].get,
    ).toMatchObject({
      operationId: "listOrganizationInvitations",
      security: [{ bearerAuth: [] }],
    });
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
