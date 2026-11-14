import request from "supertest";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import Ajv from "ajv";
import { pair, registration } from "./helpers";

describe("Organization slug generated from name", () => {
  let p: Awaited<ReturnType<typeof pair>>, token: string, actor: string;
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
  });
  const create = (body: object, key = randomUUID(), access = token) =>
    request(p.gateway.getHttpServer())
      .post("/api/organizations")
      .set("Authorization", "Bearer " + access)
      .set("Idempotency-Key", key)
      .send(body);
  const get = (id: string, access = token) =>
    request(p.gateway.getHttpServer())
      .get("/api/organizations/" + id)
      .set("Authorization", "Bearer " + access)
      .expect(200);
  it("canonical request requires name and accepts omitted slug without accepting invalid explicit values", () => {
    const doc = JSON.parse(
      fs.readFileSync("shared/contracts/http/identity.openapi.json", "utf8"),
    );
    const validate = new Ajv().compile(
      doc.components.schemas.CreateOrganization,
    );
    expect(validate({ name: "CLB Công nghệ" })).toBe(true);
    expect(validate({ slug: "missing-name" })).toBe(false);
    expect(validate({ name: "CLB", slug: null })).toBe(false);
  });
  it("creates through Gateway without slug, preserves idempotency and emits the actual generated slug", async () => {
    const suffix = randomUUID().slice(0, 8),
      name = "CLB Công nghệ " + suffix,
      key = randomUUID();
    const [a, b] = await Promise.all([
      create({ name: " " + name + " " }, key),
      create({ name }, key),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
    const org = (await get(a.body.organization_id)).body;
    expect(org.slug).toBe("clb-cong-nghe-" + suffix);
    expect(org.name).toBe(name);
    expect(org.my_roles).toEqual(["OWNER"]);
    await request(p.gateway.getHttpServer())
      .get("/api/public/organizations/" + org.slug)
      .expect(200);
    const membership = await p.db.membership.findUniqueOrThrow({
      where: {
        organization_id_user_id: { organization_id: org.id, user_id: actor },
      },
    });
    const events = await p.db.outboxEvent.findMany({
      where: { aggregate_id: { in: [org.id, membership.id] } },
    });
    expect(events).toHaveLength(2);
    expect(
      (
        events.find((e) => e.event_type === "OrganizationCreated")!.payload as {
          slug: string;
        }
      ).slug,
    ).toBe(org.slug);
    expect((await create({ name: name + " changed" }, key)).status).toBe(409);
  });
  it("allows concurrent same-name organizations for different actors with unique valid slugs", async () => {
    const input = registration();
    await request(p.gateway.getHttpServer())
      .post("/api/auth/register")
      .send(input)
      .expect(200);
    const other = (
      await request(p.gateway.getHttpServer())
        .post("/api/auth/login")
        .send({ email: input.email, password: input.password })
        .expect(200)
    ).body.access_token;
    const name = "Đội nghiên cứu " + randomUUID().slice(0, 8);
    const [a, b] = await Promise.all([
      create({ name }),
      create({ name }, randomUUID(), other),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const x = (await get(a.body.organization_id)).body,
      y = (await get(b.body.organization_id, other)).body;
    expect(x.slug).not.toBe(y.slug);
    for (const slug of [x.slug, y.slug]) {
      expect(slug).toMatch(/^doi-nghien-cuu-/);
      expect(slug.length).toBeLessThanOrEqual(63);
    }
  });
  it.each([
    ["A", "org-a"],
    ["🎉", "organization"],
    ["Đ".repeat(100), "d".repeat(63)],
  ])("handles short/non-Latin/long name %s", async (name, expected) => {
    const made = await create({ name });
    expect(made.status).toBe(201);
    const org = (await get(made.body.organization_id)).body;
    expect(
      org.slug === expected || org.slug.startsWith(expected.slice(0, 26) + "-"),
    ).toBe(true);
    expect(org.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(org.slug.length).toBeGreaterThanOrEqual(3);
    expect(org.slug.length).toBeLessThanOrEqual(63);
  });
  it("retains explicit slug behavior and its original idempotency hash", async () => {
    const slug = "custom-" + randomUUID(),
      key = randomUUID();
    const made = await create(
      { name: "Custom", slug: " " + slug.toUpperCase() + " " },
      key,
    );
    expect(made.status).toBe(201);
    expect((await get(made.body.organization_id)).body.slug).toBe(slug);
    const record = await p.db.idempotencyRecord.findUniqueOrThrow({
      where: {
        actor_user_id_operation_idempotency_key: {
          actor_user_id: actor,
          operation: "CREATE_ORGANIZATION",
          idempotency_key: key,
        },
      },
    });
    expect(record.request_hash).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            method: "POST",
            operation: "CREATE_ORGANIZATION",
            org: null,
            user: null,
            body: { name: "Custom", slug },
          }),
        )
        .digest("hex"),
    );
    expect((await create({ name: "Custom", slug }, key)).body).toEqual(
      made.body,
    );
    expect((await create({ name: "Another", slug })).body.error.code).toBe(
      "SLUG_TAKEN",
    );
    for (const body of [
      { name: "   " },
      { name: "Valid", slug: null },
      { name: "Valid", slug: "" },
      { name: "Valid", slug: "invalid slug" },
    ])
      expect((await create(body)).status).toBe(400);
  });
});
