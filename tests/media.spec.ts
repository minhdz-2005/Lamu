import request from "supertest";
import { randomUUID } from "node:crypto";
import { createIdentityApp } from "../services/identity-service/src/app";
import { createGatewayApp } from "../gateway/src/app";
import { createDatabase } from "../services/identity-service/src/database";
import { MediaCleanupWorker } from "../services/identity-service/src/media/cleanup.worker";
import type {
  CloudMetadata,
  MediaConfig,
  MediaProvider,
} from "../services/identity-service/src/media/cloudinary";
import { config, registration, contract } from "./helpers";
import { fail } from "@lamu/runtime";
import { Pool } from "pg";
const settings: MediaConfig = {
  cloud: "test",
  prefix: "lamu/test",
  key: "public-test-key",
  secret: "test-secret",
  avatarPreset: "avatar",
  coverPreset: "cover",
  ttl: 600,
  avatarMax: 5242880,
  coverMax: 10485760,
  pixels: 40000000,
  pending: 10,
  hourly: 30,
  timeoutMs: 4000,
};
describe("Gateway media with authoritative metadata and durable cleanup", () => {
  const db = createDatabase(process.env.DATABASE_URL!),
    assets = new Map<string, CloudMetadata>();
  let timeout = false,
    deleteFailure = false,
    providerDelay = 0;
  const provider: MediaProvider = {
    sign: () => "test-signature",
    metadata: async (id) => {
      if (providerDelay)
        await new Promise((resolve) => setTimeout(resolve, providerDelay));
      if (timeout) fail(504, "UPSTREAM_TIMEOUT", "Media provider timed out");
      return assets.get(id) ?? null;
    },
    destroy: async (id) => {
      if (deleteFailure) throw new Error("unavailable");
      assets.delete(id);
    },
  };
  let identity: Awaited<ReturnType<typeof createIdentityApp>>,
    gateway: Awaited<ReturnType<typeof createGatewayApp>>;
  let token: string, other: string, org: string;
  const api = () => request(gateway.getHttpServer());
  beforeAll(async () => {
    identity = await createIdentityApp(config(), db, {}, undefined, {
      config: settings,
      provider,
    });
    await identity.listen(0, "127.0.0.1");
    gateway = await createGatewayApp({
      ...config(),
      identityUrl: await identity.getUrl(),
    });
    await gateway.init();
    async function account() {
      const i = registration();
      await api().post("/api/auth/register").send(i).expect(200);
      return (
        await api()
          .post("/api/auth/login")
          .send({ email: i.email, password: i.password })
          .expect(200)
      ).body.access_token as string;
    }
    token = await account();
    other = await account();
    org = (
      await api()
        .post("/api/organizations")
        .auth(token, { type: "bearer" })
        .set("Idempotency-Key", randomUUID())
        .send({ name: "Media org" })
        .expect(201)
    ).body.organization_id;
  });
  afterAll(async () => {
    await gateway?.close();
    await identity?.close();
  });
  const avatar = "/api/users/me/avatar";
  async function intent(path = avatar, revision = "0", access = token) {
    const r = await api()
      .post(path + "/upload-intents")
      .auth(access, { type: "bearer" })
      .send({ expected_revision: revision })
      .expect(200);
    contract("MediaIntent", r.body);
    expect(r.headers["cache-control"]).toBe("no-store");
    return r.body as { intent_id: string; params: { public_id: string } };
  }
  function upload(
    i: { params: { public_id: string } },
    patch: Partial<CloudMetadata> = {},
  ) {
    assets.set(i.params.public_id, {
      asset_id: randomUUID(),
      public_id: i.params.public_id,
      version: 1,
      secure_url: "https://malicious-client.example/ignored",
      format: "png",
      bytes: 2048,
      width: 512,
      height: 300,
      resource_type: "image",
      type: "upload",
      ...patch,
    });
  }
  const commit = (path: string, id: string, access = token) =>
    api().put(path).auth(access, { type: "bearer" }).send({ intent_id: id });
  const remove = (path: string, revision: string) =>
    api()
      .delete(path)
      .auth(token, { type: "bearer" })
      .send({ expected_revision: revision });
  async function due(id: string) {
    await db.mediaCleanupJob.update({
      where: { intent_id: id },
      data: { status: "PENDING", next_attempt_at: new Date(Date.now() - 1000) },
    });
  }
  it("avatar square/cover 3:1; commit replay never reattaches replaced assets; revisions and delete", async () => {
    const a = await intent();
    upload(a);
    const first = await commit(avatar, a.intent_id).expect(200);
    contract("MediaDisplay", first.body);
    expect(first.body.url).toContain("w_512,h_512");
    const profile = await api()
      .get("/api/users/me")
      .auth(token, { type: "bearer" })
      .expect(200);
    contract("Profile", profile.body);
    expect(profile.body.avatar).toEqual(first.body);
    const b = await intent(avatar, "1");
    upload(b);
    const next = await commit(avatar, b.intent_id).expect(200);
    expect(next.body.revision).toBe("2");
    expect((await commit(avatar, a.intent_id).expect(200)).body).toEqual(
      first.body,
    );
    expect(
      (await api().get("/api/users/me").auth(token, { type: "bearer" })).body
        .avatar,
    ).toEqual(next.body);
    await remove(avatar, "1").expect(409);
    await remove(avatar, "2").expect(200);
    await remove(avatar, "2").expect(200);
    const cover = "/api/organizations/" + org + "/cover",
      c = await intent(cover);
    upload(c);
    const committed = await commit(cover, c.intent_id).expect(200);
    expect(committed.body.url).toContain("w_1500,h_500");
    const detail = await api()
      .get("/api/organizations/" + org)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(detail.body.cover).toEqual(committed.body);
    contract("Organization", detail.body);
    await remove(cover, "1").expect(200);
  });
  it("CAS chooses one parallel upload; cleanup preserves active asset and retries deletion", async () => {
    const current = (
      await api().get("/api/users/me").auth(token, { type: "bearer" })
    ).body.avatar.revision;
    const a = await intent(avatar, current),
      b = await intent(avatar, current);
    upload(a);
    upload(b);
    const res = await Promise.all([
      commit(avatar, a.intent_id),
      commit(avatar, b.intent_id),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = res[0].status === 200 ? a : b;
    await due(winner.intent_id);
    const worker = new MediaCleanupWorker(db, provider, settings.prefix);
    await worker.tick();
    expect(assets.has(winner.params.public_id)).toBe(true);
    await remove(avatar, (BigInt(current) + 1n).toString()).expect(200);
    deleteFailure = true;
    await worker.tick();
    expect(assets.has(winner.params.public_id)).toBe(true);
    deleteFailure = false;
    await due(winner.intent_id);
    await new MediaCleanupWorker(db, provider, settings.prefix).tick();
    expect(assets.has(winner.params.public_id)).toBe(false);
  });
  it("rejects forged metadata, oversized, animated, pixel limits; no trust in client URL", async () => {
    const revision = (
      await api().get("/api/users/me").auth(token, { type: "bearer" })
    ).body.avatar.revision;
    for (const patch of [
      { bytes: 5242881 },
      { format: "svg" },
      { width: 400000, height: 400000 },
      { pages: 2 },
      { frames: 2 },
      { public_id: "another/asset" },
      { resource_type: "video" },
    ]) {
      const a = await intent(avatar, revision);
      upload(a, patch);
      await commit(avatar, a.intent_id).expect(400);
    }
    await api()
      .put(avatar)
      .auth(token, { type: "bearer" })
      .send({ intent_id: randomUUID(), url: "https://fake.example" })
      .expect(400);
  });
  it("ownership, org boundaries, permission revoked between signing and commit, expired and missing upload", async () => {
    const otherIntent = await intent(avatar, "0", other);
    upload(otherIntent);
    await commit(avatar, otherIntent.intent_id).expect(404);
    const cover = "/api/organizations/" + org + "/cover";
    await api()
      .post(cover + "/upload-intents")
      .auth(other, { type: "bearer" })
      .send({ expected_revision: "2" })
      .expect(403);
    const a = await intent(cover, "2");
    upload(a);
    const organization = await db.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const member = await db.membership.findUniqueOrThrow({
      where: {
        organization_id_user_id: {
          organization_id: org,
          user_id: organization.created_by,
        },
      },
    });
    await db.membership.update({
      where: { id: member.id },
      data: { status: "INACTIVE" },
    });
    await commit(cover, a.intent_id).expect(403);
    await db.membership.update({
      where: { id: member.id },
      data: { status: "ACTIVE" },
    });
    await db.mediaUploadIntent.update({
      where: { id: a.intent_id },
      data: {
        created_at: new Date(Date.now() - 20000),
        expires_at: new Date(Date.now() - 1000),
      },
    });
    await commit(cover, a.intent_id).expect(409);
    const missing = await intent(cover, "2");
    await commit(cover, missing.intent_id).expect(409);
    timeout = true;
    await commit(cover, missing.intent_id).expect(504);
    timeout = false;
  });
  it("cleanup tombstone catches late uploads and serializes with commit", async () => {
    const a = await intent(avatar, "0", other);
    await db.mediaUploadIntent.update({
      where: { id: a.intent_id },
      data: {
        created_at: new Date(Date.now() - 20000),
        expires_at: new Date(Date.now() - 1000),
      },
    });
    await due(a.intent_id);
    const worker = new MediaCleanupWorker(db, provider, settings.prefix);
    await worker.tick();
    expect(
      (
        await db.mediaUploadIntent.findUniqueOrThrow({
          where: { id: a.intent_id },
        })
      ).state,
    ).toBe("EXPIRED");
    upload(a);
    await due(a.intent_id);
    await worker.tick();
    expect(assets.has(a.params.public_id)).toBe(false);
    await commit(avatar, a.intent_id, other).expect(409);
    await db.mediaUploadIntent.update({
      where: { id: a.intent_id },
      data: {
        created_at: new Date(Date.now() - 4 * 3600000),
        expires_at: new Date(Date.now() - 3 * 3600000),
        watch_until: new Date(Date.now() - 1000),
      },
    });
    await due(a.intent_id);
    await worker.tick();
    expect(
      (
        await db.mediaCleanupJob.findUniqueOrThrow({
          where: { intent_id: a.intent_id },
        })
      ).status,
    ).toBe("DONE");
  });
  it("DB commit failure preserves old reference; retry succeeds without losing cleanup", async () => {
    const revision = (
      await api().get("/api/users/me").auth(token, { type: "bearer" })
    ).body.avatar.revision;
    const a = await intent(avatar, revision);
    upload(a);
    const sql = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await sql.query(
        "CREATE FUNCTION security_media_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='COMMITTED' THEN RAISE EXCEPTION 'test commit fault'; END IF; RETURN NEW; END $$",
      );
      await sql.query(
        "CREATE TRIGGER security_media_fault BEFORE UPDATE ON media_upload_intents FOR EACH ROW EXECUTE FUNCTION security_media_fault()",
      );
      await commit(avatar, a.intent_id).expect(500);
      const i = await db.mediaUploadIntent.findUniqueOrThrow({
        where: { id: a.intent_id },
      });
      expect(i.state).toBe("PENDING");
      expect(i.asset_id).toBeNull();
      expect(
        await db.mediaAsset.count({ where: { public_id: a.params.public_id } }),
      ).toBe(0);
      expect(
        (await api().get("/api/users/me").auth(token, { type: "bearer" })).body
          .avatar.revision,
      ).toBe(revision);
      await sql.query(
        "DROP TRIGGER security_media_fault ON media_upload_intents",
      );
      await sql.query("DROP FUNCTION security_media_fault()");
      const first = await commit(avatar, a.intent_id).expect(200),
        retry = await commit(avatar, a.intent_id).expect(200);
      expect(retry.body).toEqual(first.body);
    } finally {
      await sql.query(
        "DROP TRIGGER IF EXISTS security_media_fault ON media_upload_intents",
      );
      await sql.query("DROP FUNCTION IF EXISTS security_media_fault()");
      await sql.end();
    }
  });
  it("commit and cleanup race preserves live references; response timeout can replay committed result", async () => {
    const revision = (
      await api().get("/api/users/me").auth(token, { type: "bearer" })
    ).body.avatar.revision;
    const a = await intent(avatar, revision);
    upload(a);
    await due(a.intent_id);
    const worker = new MediaCleanupWorker(db, provider, settings.prefix);
    const [committed] = await Promise.all([
      commit(avatar, a.intent_id),
      worker.tick(),
    ]);
    expect(committed.status).toBe(200);
    expect(assets.has(a.params.public_id)).toBe(true);
    const b = await intent(avatar, committed.body.revision);
    upload(b);
    const impatient = await createGatewayApp({
      ...config(),
      identityUrl: await identity.getUrl(),
      mediaTimeoutMs: 20,
    });
    await impatient.init();
    try {
      providerDelay = 100;
      await request(impatient.getHttpServer())
        .put(avatar)
        .auth(token, { type: "bearer" })
        .send({ intent_id: b.intent_id })
        .expect(504);
      await new Promise((resolve) => setTimeout(resolve, 250));
      providerDelay = 0;
      expect(
        (
          await db.mediaUploadIntent.findUniqueOrThrow({
            where: { id: b.intent_id },
          })
        ).state,
      ).toBe("COMMITTED");
      await commit(avatar, b.intent_id).expect(200);
    } finally {
      providerDelay = 0;
      await impatient.close();
    }
  });
  it("upload pending quota is persisted and shared across Gateway requests", async () => {
    const user = (
      await api().get("/api/users/me").auth(other, { type: "bearer" })
    ).body;
    const pending = await db.mediaUploadIntent.count({
      where: {
        actor_id: user.id,
        state: "PENDING",
        expires_at: { gt: new Date() },
      },
    });
    for (let n = pending; n < settings.pending; n++)
      await intent(avatar, user.avatar.revision, other);
    const rejected = await api()
      .post(avatar + "/upload-intents")
      .auth(other, { type: "bearer" })
      .send({ expected_revision: user.avatar.revision })
      .expect(429);
    expect(rejected.headers["retry-after"]).toBeDefined();
    const cover = "/api/organizations/" + org + "/cover";
    const c = await intent(cover, "2");
    upload(c);
    const savedCover = (await commit(cover, c.intent_id).expect(200)).body;
    const savedAvatar = (
      await api()
        .get("/api/users/me")
        .auth(token, { type: "bearer" })
        .expect(200)
    ).body.avatar;
    await gateway.close();
    await identity.close();
    const restartedDb = createDatabase(process.env.DATABASE_URL!);
    identity = await createIdentityApp(config(), restartedDb, {}, undefined, {
      config: settings,
      provider,
    });
    await identity.listen(0, "127.0.0.1");
    gateway = await createGatewayApp({
      ...config(),
      identityUrl: await identity.getUrl(),
    });
    await gateway.init();
    const restoredProfile = await api()
      .get("/api/users/me")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(restoredProfile.body.avatar).toEqual(savedAvatar);
    const restoredOrg = await api()
      .get("/api/organizations/" + org)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(restoredOrg.body.cover).toEqual(savedCover);
  });
});
