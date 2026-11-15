import { createHash } from "node:crypto";
import { fail } from "@lamu/runtime";
import { integer } from "../security/config";
export const MEDIA_CONFIG = Symbol("MEDIA_CONFIG"),
  MEDIA_PROVIDER = Symbol("MEDIA_PROVIDER");
export function mediaConfig(env: NodeJS.ProcessEnv) {
  const required = (name: string) => {
    if (!env[name]?.trim()) throw new Error("Missing " + name);
    return env[name]!;
  };
  const cloud = required("CLOUDINARY_CLOUD_NAME"),
    prefix = required("CLOUDINARY_ASSET_PREFIX");
  if (
    !/^[a-z0-9_-]+$/i.test(cloud) ||
    !/^([a-z0-9_-]+\/)*[a-z0-9_-]+$/i.test(prefix)
  )
    throw new Error("Invalid Cloudinary namespace");
  return {
    cloud,
    prefix,
    key: required("CLOUDINARY_API_KEY"),
    secret: required("CLOUDINARY_API_SECRET"),
    avatarPreset: required("CLOUDINARY_AVATAR_UPLOAD_PRESET"),
    coverPreset: required("CLOUDINARY_ORG_COVER_UPLOAD_PRESET"),
    ttl: integer(env, "MEDIA_UPLOAD_INTENT_TTL_SECONDS", 600, 60, 1800),
    avatarMax: integer(env, "AVATAR_MAX_BYTES", 5242880, 1, 5242880),
    coverMax: integer(env, "ORG_COVER_MAX_BYTES", 10485760, 1, 10485760),
    pixels: integer(env, "MEDIA_MAX_PIXELS", 40000000, 1, 40000000),
    pending: integer(env, "MEDIA_MAX_PENDING_INTENTS", 10, 1, 100),
    hourly: integer(env, "MEDIA_HOURLY_INTENT_LIMIT", 30, 1, 1000),
    timeoutMs: integer(env, "CLOUDINARY_TIMEOUT_MS", 4000, 100, 10000),
  };
}
export type MediaConfig = ReturnType<typeof mediaConfig>;
export type CloudMetadata = {
  asset_id: string;
  public_id: string;
  version: number;
  secure_url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  resource_type: string;
  type: string;
  pages?: number;
  frames?: number;
};
export interface MediaProvider {
  sign(params: Record<string, string | number | boolean>): string;
  metadata(publicId: string): Promise<CloudMetadata | null>;
  destroy(publicId: string): Promise<void>;
}
export class CloudinaryProvider implements MediaProvider {
  constructor(private readonly config: MediaConfig) {}
  sign(params: Record<string, string | number | boolean>) {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha256")
      .update(sorted + this.config.secret)
      .digest("hex");
  }
  private async call(url: string, init: RequestInit) {
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal, redirect: "error" });
      const body = response.ok ? await response.json() : null;
      return { status: response.status, ok: response.ok, body };
    } catch {
      if (signal.aborted)
        fail(504, "UPSTREAM_TIMEOUT", "Media provider timed out");
      fail(502, "UPSTREAM_UNAVAILABLE", "Media provider unavailable");
    }
  }
  async metadata(publicId: string): Promise<CloudMetadata | null> {
    const r = await this.call(
      `https://api.cloudinary.com/v1_1/${this.config.cloud}/resources/image/upload/${encodeURIComponent(publicId)}?pages=true`,
      {
        headers: {
          authorization:
            "Basic " +
            Buffer.from(this.config.key + ":" + this.config.secret).toString(
              "base64",
            ),
        },
      },
    );
    if (r.status === 404) return null;
    if (!r.ok || !r.body || typeof r.body !== "object")
      fail(502, "UPSTREAM_UNAVAILABLE", "Media metadata unavailable");
    return r.body as CloudMetadata;
  }
  async destroy(publicId: string) {
    if (!publicId.startsWith(this.config.prefix + "/"))
      throw new Error("Namespace mismatch");
    const params = {
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000),
      invalidate: true,
    };
    const r = await this.call(
      `https://api.cloudinary.com/v1_1/${this.config.cloud}/image/destroy`,
      {
        method: "POST",
        body: new URLSearchParams({
          ...Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          ),
          api_key: this.config.key,
          signature: this.sign(params),
        }),
      },
    );
    if (!r.ok) throw new Error("MEDIA_DELETE_FAILED");
    const body = r.body as { result?: string } | null;
    if (!body || !["ok", "not found"].includes(body.result ?? ""))
      throw new Error("MEDIA_DELETE_FAILED");
  }
}
export const mediaDisplay = (
  asset: { display_url: string } | null | undefined,
  revision: bigint,
) => ({ url: asset?.display_url ?? null, revision: revision.toString() });
