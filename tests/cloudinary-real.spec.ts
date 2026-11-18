// Opt-in smoke only: runner injects credentials; ordinary tests never call Cloudinary.
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createIdentityApp } from "../services/identity-service/src/app";
import { createGatewayApp } from "../gateway/src/app";
import { createDatabase } from "../services/identity-service/src/database";
import {
  CloudinaryProvider,
  mediaConfig,
} from "../services/identity-service/src/media/cloudinary";
import { MediaCleanupWorker } from "../services/identity-service/src/media/cleanup.worker";
import { config, registration, contract } from "./helpers";
import { animatedWebp } from "./media-fixtures";
(process.env.REAL_CLOUDINARY_SMOKE === "1" ? describe : describe.skip)(
  "real Cloudinary through Gateway, synthetic test namespace",
  () => {
    it("signed upload, authoritative lookup, commit, replace, cover, delete, cleanup", async () => {
      const settings = mediaConfig({
        ...process.env,
        CLOUDINARY_ASSET_PREFIX: "lamu/test-smoke/" + randomUUID(),
      });
      const provider = new CloudinaryProvider(settings),
        db = createDatabase(process.env.DATABASE_URL!);
      const identity = await createIdentityApp(config(), db, {}, undefined, {
        config: settings,
        provider,
      });
      await identity.listen(0, "127.0.0.1");
      const gateway = await createGatewayApp({
        ...config(),
        timeoutMs: 6000,
        identityUrl: await identity.getUrl(),
      });
      await gateway.init();
      const publicIds: string[] = [];
      const api = () => request(gateway.getHttpServer());
      try {
        const input = registration();
        await api().post("/api/auth/register").send(input).expect(200);
        const token = (
          await api()
            .post("/api/auth/login")
            .send({ email: input.email, password: input.password })
            .expect(200)
        ).body.access_token;
        const org = (
          await api()
            .post("/api/organizations")
            .auth(token, { type: "bearer" })
            .set("Idempotency-Key", randomUUID())
            .send({ name: "Synthetic media smoke" })
            .expect(201)
        ).body.organization_id;
        const worker = new MediaCleanupWorker(db, provider, settings.prefix);
        const avatar = "/api/users/me/avatar",
          cover = "/api/organizations/" + org + "/cover";
        async function upload(
          path: string,
          revision: string,
          animation?: Buffer,
        ) {
          const intent = (
            await api()
              .post(path + "/upload-intents")
              .auth(token, { type: "bearer" })
              .send({ expected_revision: revision })
              .expect(200)
          ).body;
          contract("MediaIntent", intent);
          publicIds.push(intent.params.public_id);
          const body = new FormData();
          for (const [k, v] of Object.entries(intent.params))
            body.append(k, String(v));
          body.append("api_key", intent.api_key);
          const png =
            animation ??
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=",
              "base64",
            );
          body.append(
            "file",
            new Blob([new Uint8Array(png)], {
              type: animation ? "image/webp" : "image/png",
            }),
            animation ? "synthetic.webp" : "synthetic.png",
          );
          if (publicIds.length === 1) {
            body.set("signature", "0".repeat(64));
            const rejected = await fetch(intent.upload_url, {
              method: "POST",
              body,
              signal: AbortSignal.timeout(15000),
            });
            expect([400, 401, 403]).toContain(rejected.status);
            expect(await provider.metadata(intent.params.public_id)).toBeNull();
            body.set("signature", intent.params.signature);
          }
          const result = await fetch(intent.upload_url, {
            method: "POST",
            body,
            signal: AbortSignal.timeout(15000),
          });
          if (!result.ok) {
            const detail = (await result.json()) as {
              error?: { message?: string };
            };
            throw new Error(
              `Synthetic image upload HTTP ${result.status}: ${(detail.error?.message ?? "provider rejection").slice(0, 160)}`,
            );
          }
          expect(result.ok).toBe(true);
          const metadata = await provider.metadata(intent.params.public_id);
          expect(metadata?.public_id).toBe(intent.params.public_id);
          if (animation) {
            expect(metadata?.format).toBe("webp");
            expect(metadata?.pages ?? metadata?.frames).toBe(2);
          }
          const commit = await api()
            .put(path)
            .auth(token, { type: "bearer" })
            .send({ intent_id: intent.intent_id })
            .expect(animation ? 400 : 200);
          if (!animation) contract("MediaDisplay", commit.body);
          return { intent, display: commit.body, metadata };
        }
        const a = await upload(avatar, "0"),
          b = await upload(avatar, "1");
        expect(
          (
            await api()
              .put(avatar)
              .auth(token, { type: "bearer" })
              .send({ intent_id: a.intent.intent_id })
              .expect(200)
          ).body,
        ).toEqual(a.display);
        const profile = await api()
          .get("/api/users/me")
          .auth(token, { type: "bearer" })
          .expect(200);
        expect(profile.body.avatar).toEqual(b.display);
        const c = await upload(cover, "0");
        expect(c.display.url).toContain("w_1500,h_500");
        const frames: Buffer[] = [];
        for (const color of ["ff0000", "0000ff"]) {
          const response = await fetch(
            `https://res.cloudinary.com/${settings.cloud}/image/upload/c_scale,w_1,h_1/co_rgb:${color},e_colorize:100,f_webp/v${a.metadata!.version}/${a.intent.params.public_id}.png`,
            { signal: AbortSignal.timeout(15000) },
          );
          expect(response.ok).toBe(true);
          frames.push(Buffer.from(await response.arrayBuffer()));
        }
        await api()
          .delete(avatar)
          .auth(token, { type: "bearer" })
          .send({ expected_revision: "2" })
          .expect(200);
        await api()
          .delete(cover)
          .auth(token, { type: "bearer" })
          .send({ expected_revision: "1" })
          .expect(200);
        await upload(avatar, "3", animatedWebp(frames));
        await worker.tick();
        for (const id of publicIds)
          expect(await provider.metadata(id)).toBeNull();
      } finally {
        // Only IDs issued by this smoke; never enumerate, overwrite, or delete existing assets.
        const cleanup = await Promise.allSettled(
          publicIds.map((id) => provider.destroy(id)),
        );
        await gateway.close();
        await identity.close();
        if (cleanup.some((r) => r.status === "rejected"))
          throw new Error("Smoke test asset cleanup incomplete");
      }
    }, 120000);
  },
);
