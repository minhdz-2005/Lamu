import { transactionRetry } from "../common/transaction";
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { fail } from "@lamu/runtime";
import { DATABASE, type Database } from "../database";
import type { Prisma, MediaUploadIntent } from "../generated/client";
import { AuthorizationService } from "../modules/organizations/authorization.service";
import {
  MEDIA_CONFIG,
  MEDIA_PROVIDER,
  type MediaConfig,
  type MediaProvider,
  type CloudMetadata,
  mediaDisplay,
} from "./cloudinary";
import type { components } from "../../../../shared/contracts/http/generated/identity";
type Tx = Prisma.TransactionClient;
type Actor = { sub: string; sid: string };
type Display = components["schemas"]["MediaDisplay"];
@Injectable()
export class MediaService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MEDIA_CONFIG) private readonly config: MediaConfig,
    @Inject(MEDIA_PROVIDER) private readonly provider: MediaProvider,
    private readonly authorization: AuthorizationService,
  ) {}
  private async authorize(tx: Tx, actor: Actor, org?: string) {
    // Org mutations already serialize on organization before users; keep that order.
    if (org)
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id=${actor.sub}::uuid FOR UPDATE`;
    const s = await tx.refreshSession.findUnique({ where: { id: actor.sid } });
    if (
      !s ||
      s.user_id !== actor.sub ||
      s.revoked_at ||
      s.expires_at <= new Date()
    )
      fail(401, "UNAUTHENTICATED", "Session unavailable");
    if (org)
      await this.authorization.requireOrg(
        actor.sub,
        org,
        "org.profile.update",
        tx,
      );
    else await this.authorization.activeActor(actor.sub, tx);
  }
  private async target(tx: Tx, actor: Actor, org?: string) {
    if (org) {
      const t = await tx.organization.findUniqueOrThrow({
        where: { id: org },
        include: { cover_asset: true },
      });
      return {
        id: t.cover_asset_id,
        revision: t.cover_revision,
        display: mediaDisplay(t.cover_asset, t.cover_revision),
      };
    }
    const t = await tx.user.findUniqueOrThrow({
      where: { id: actor.sub },
      include: { avatar_asset: true },
    });
    return {
      id: t.avatar_asset_id,
      revision: t.avatar_revision,
      display: mediaDisplay(t.avatar_asset, t.avatar_revision),
    };
  }
  private matches(i: MediaUploadIntent, actor: Actor, org?: string) {
    return (
      i.actor_id === actor.sub &&
      (org
        ? i.organization_id === org && i.purpose === "COVER"
        : i.user_id === actor.sub && i.purpose === "AVATAR")
    );
  }
  async intent(
    actor: Actor,
    expected: string,
    org?: string,
  ): Promise<components["schemas"]["MediaIntent"]> {
    const i = await transactionRetry(this.db, async (tx) => {
      await this.authorize(tx, actor, org);
      const t = await this.target(tx, actor, org);
      if (t.revision !== BigInt(expected))
        fail(409, "REVISION_CONFLICT", "Media revision changed");
      const pending = await tx.mediaUploadIntent.count({
          where: {
            actor_id: actor.sub,
            state: "PENDING",
            expires_at: { gt: new Date() },
          },
        }),
        hourly = await tx.mediaUploadIntent.count({
          where: {
            actor_id: actor.sub,
            created_at: { gt: new Date(Date.now() - 3600000) },
          },
        });
      if (pending >= this.config.pending || hourly >= this.config.hourly)
        fail(429, "RATE_LIMITED", "Upload quota exceeded");
      const id = randomUUID(),
        at = new Date(),
        expires = new Date(at.getTime() + this.config.ttl * 1000);
      const row = await tx.mediaUploadIntent.create({
        data: {
          id,
          actor_id: actor.sub,
          user_id: org ? null : actor.sub,
          organization_id: org ?? null,
          purpose: org ? "COVER" : "AVATAR",
          expected_public_id: `${this.config.prefix}/${org ? "cover" : "avatar"}/${randomUUID()}`,
          expected_revision: t.revision,
          created_at: at,
          expires_at: expires,
          watch_until: new Date(at.getTime() + 3 * 3600000),
        },
      });
      await tx.mediaCleanupJob.create({
        data: { id: randomUUID(), intent_id: id, next_attempt_at: expires },
      });
      return row;
    });
    const params = {
      timestamp: Math.floor(i.created_at.getTime() / 1000),
      public_id: i.expected_public_id,
      overwrite: false as const,
      upload_preset: org ? this.config.coverPreset : this.config.avatarPreset,
    };
    return {
      intent_id: i.id,
      expires_at: i.expires_at.toISOString(),
      expected_revision: i.expected_revision.toString(),
      upload_url: `https://api.cloudinary.com/v1_1/${this.config.cloud}/image/upload`,
      cloud_name: this.config.cloud,
      api_key: this.config.key,
      params: { ...params, signature: this.provider.sign(params) },
    };
  }
  private metadataValid(m: CloudMetadata, i: MediaUploadIntent) {
    return (
      m.public_id === i.expected_public_id &&
      m.resource_type === "image" &&
      m.type === "upload" &&
      typeof m.asset_id === "string" &&
      m.asset_id.length > 0 &&
      Number.isSafeInteger(m.version) &&
      m.version > 0 &&
      ["jpg", "jpeg", "png", "webp"].includes(m.format) &&
      Number.isSafeInteger(m.bytes) &&
      m.bytes > 0 &&
      m.bytes <=
        (i.purpose === "AVATAR"
          ? this.config.avatarMax
          : this.config.coverMax) &&
      Number.isSafeInteger(m.width) &&
      Number.isSafeInteger(m.height) &&
      m.width > 0 &&
      m.height > 0 &&
      m.width * m.height <= this.config.pixels &&
      (m.pages ?? 1) === 1 &&
      (m.frames ?? 1) === 1
    );
  }
  async commit(actor: Actor, id: string, org?: string): Promise<Display> {
    // Check ownership/permission before performing a provider call, then recheck under locks.
    const initial = await transactionRetry(this.db, async (tx) => {
      await this.authorize(tx, actor, org);
      const row = await tx.mediaUploadIntent.findUnique({ where: { id } });
      if (!row || !this.matches(row, actor, org))
        fail(404, "NOT_FOUND", "Upload intent unavailable");
      return row;
    });
    let metadata: CloudMetadata | null = null;
    if (initial.state === "PENDING" && initial.expires_at > new Date())
      metadata = await this.provider.metadata(initial.expected_public_id);
    const result = await transactionRetry(this.db, async (tx) => {
      await this.authorize(tx, actor, org);
      await tx.$queryRaw`SELECT id FROM media_upload_intents WHERE id=${id}::uuid FOR UPDATE`;
      const i = await tx.mediaUploadIntent.findUniqueOrThrow({ where: { id } });
      if (!this.matches(i, actor, org))
        fail(404, "NOT_FOUND", "Upload intent unavailable");
      if (i.state === "COMMITTED") {
        const r = i.result;
        if (
          !r ||
          typeof r !== "object" ||
          Array.isArray(r) ||
          typeof r.url !== "string" ||
          typeof r.revision !== "string"
        )
          throw new Error("MEDIA_RESULT_INVALID");
        return { url: r.url, revision: r.revision };
      }
      if (i.state !== "PENDING" || i.expires_at <= new Date())
        return { error: "EXPIRED" };
      if (!metadata) return { error: "MISSING" };
      if (!this.metadataValid(metadata, i)) {
        await tx.mediaUploadIntent.update({
          where: { id },
          data: { state: "EXPIRED" },
        });
        await tx.mediaCleanupJob.update({
          where: { intent_id: id },
          data: { status: "PENDING", next_attempt_at: new Date() },
        });
        return { error: "INVALID" };
      }
      const t = await this.target(tx, actor, org);
      if (t.revision !== i.expected_revision)
        fail(409, "REVISION_CONFLICT", "Media revision changed");
      const m = metadata,
        assetId = randomUUID(),
        publicPath = m.public_id.split("/").map(encodeURIComponent).join("/");
      const base = `https://res.cloudinary.com/${this.config.cloud}/image/upload/`,
        versioned = `v${m.version}/${publicPath}.${m.format}`;
      const url =
        base +
        (org ? "c_fill,g_auto,w_1500,h_500/" : "c_fill,g_auto,w_512,h_512/") +
        versioned;
      await tx.mediaAsset.create({
        data: {
          id: assetId,
          asset_id: m.asset_id,
          public_id: m.public_id,
          version: BigInt(m.version),
          secure_url: base + versioned,
          display_url: url,
          format: m.format,
          bytes: m.bytes,
          width: m.width,
          height: m.height,
        },
      });
      if (org) {
        const n = await tx.organization.updateMany({
          where: { id: org, cover_revision: i.expected_revision },
          data: { cover_asset_id: assetId, cover_revision: { increment: 1 } },
        });
        if (n.count !== 1)
          fail(409, "REVISION_CONFLICT", "Media revision changed");
      } else {
        const n = await tx.user.updateMany({
          where: { id: actor.sub, avatar_revision: i.expected_revision },
          data: { avatar_asset_id: assetId, avatar_revision: { increment: 1 } },
        });
        if (n.count !== 1)
          fail(409, "REVISION_CONFLICT", "Media revision changed");
      }
      const display = { url, revision: (t.revision + 1n).toString() };
      await tx.mediaUploadIntent.update({
        where: { id },
        data: {
          state: "COMMITTED",
          committed_at: new Date(),
          asset_id: assetId,
          result: display,
        },
      });
      if (t.id) await this.schedule(tx, t.id);
      return display;
    });
    if ("error" in result)
      fail(
        result.error === "INVALID" ? 400 : 409,
        result.error === "INVALID" ? "INVALID_MEDIA" : "INTENT_CONFLICT",
        "Upload unavailable or invalid",
      );
    return result;
  }
  private async schedule(tx: Tx, assetId: string) {
    const old = await tx.mediaUploadIntent.findUnique({
      where: { asset_id: assetId },
    });
    if (old)
      await tx.mediaCleanupJob.update({
        where: { intent_id: old.id },
        data: { status: "PENDING", next_attempt_at: new Date() },
      });
  }
  async remove(actor: Actor, expected: string, org?: string): Promise<Display> {
    return transactionRetry(this.db, async (tx) => {
      await this.authorize(tx, actor, org);
      const t = await this.target(tx, actor, org);
      if (!t.id) return t.display;
      if (t.revision !== BigInt(expected))
        fail(409, "REVISION_CONFLICT", "Media revision changed");
      if (org)
        await tx.organization.update({
          where: { id: org },
          data: { cover_asset_id: null, cover_revision: { increment: 1 } },
        });
      else
        await tx.user.update({
          where: { id: actor.sub },
          data: { avatar_asset_id: null, avatar_revision: { increment: 1 } },
        });
      await this.schedule(tx, t.id);
      return { url: null, revision: (t.revision + 1n).toString() };
    });
  }
}
