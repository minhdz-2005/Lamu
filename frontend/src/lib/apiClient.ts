"use client";
import { readSession, writeSession, withSessionLock } from "./auth";
import { authMode, identityPath, isIdentityUuid } from "./authMode";
import { ApiException } from "./errors";
import { validAvatar } from "./avatar";
import { emptyCover, validCover, validOrganizationDescription } from "./organizationProfile";
import type { AuthTokens, MeProfile } from "./types";
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  anonymous?: boolean;
  signal?: AbortSignal;
  noRefresh?: boolean;
  generation?: string;
  validate?: (value: unknown) => boolean;
}
// Business APIs stay mock, even when Identity runs real. Never use a global external base.
export const apiBase = "/api";
export function apiUrl(path: string) {
  return (
    (authMode === "real" && identityPath(path) ? "/api/identity" : "/api") +
    path
  );
}
export function retrySeconds(raw: string | null, now = Date.now()): number {
  if (!raw) return 60;
  const value = /^\d+$/.test(raw)
    ? Number(raw)
    : (Date.parse(raw) - now) / 1000;
  return Number.isFinite(value)
    ? Math.min(3600, Math.max(1, Math.ceil(value)))
    : 60;
}
export function validTokens(value: unknown): value is AuthTokens {
  const v = value as AuthTokens;
  return (
    !!v &&
    typeof v.access_token === "string" &&
    !!v.access_token &&
    typeof v.refresh_token === "string" &&
    !!v.refresh_token &&
    v.expires_in === 900 &&
    (authMode !== "real" ||
      (/^[A-Za-z0-9_-]{43}$/.test(v.refresh_token) &&
        v.access_token.split(".").length === 3))
  );
}
export function validProfile(value: unknown): value is MeProfile {
  const p = value as MeProfile;
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.email === "string" &&
    typeof p.display_name === "string" &&
    (p.avatar === undefined || validAvatar(p.avatar)) &&
    Array.isArray(p.memberships) &&
    p.memberships.every(
      (m) =>
        !!m &&
        typeof m.organization_id === "string" &&
        typeof m.name === "string" &&
        typeof m.slug === "string" &&
        (m.description === undefined || validOrganizationDescription(m.description)) &&
        (m.cover === undefined || validCover(m.cover)) &&
        Array.isArray(m.roles) &&
        m.roles.every((r) => typeof r === "string"),
    )
  );
}
export async function rawRequest<T>(
  path: string,
  options: RequestOptions = {},
  bearer?: string | null,
): Promise<T> {
  const id = crypto.randomUUID();
  const headers = new Headers(options.headers);
  headers.set("X-Request-Id", id);
  headers.delete("Authorization");
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  if (bearer && !options.anonymous)
    headers.set("Authorization", "Bearer " + bearer);
  const deadline = AbortSignal.timeout(10000);
  const signal = options.signal
    ? AbortSignal.any([deadline, options.signal])
    : deadline;
  try {
    const response = await fetch(apiUrl(path), {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
      cache: "no-store",
    });
    const requestId = response.headers.get("x-request-id") || id;
    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!response.ok)
      throw new ApiException(
        typeof body?.error?.code === "string"
          ? body.error.code
          : "UPSTREAM_UNAVAILABLE",
        "",
        response.status,
        requestId,
        response.status === 429
          ? retrySeconds(response.headers.get("retry-after"))
          : 0,
      );
    let valid = body !== null;
    if (["/auth/login", "/auth/refresh"].includes(path))
      valid = validTokens(body);
    if (path === "/users/me")
      valid =
        validProfile(body) &&
        (authMode !== "real" ||
          (isIdentityUuid(body.id) &&
            body.memberships.every(
              (membership: MeProfile["memberships"][number]) =>
                isIdentityUuid(membership.organization_id) &&
                membership.roles.every((role) =>
                  ["OWNER", "ADMIN", "ATTENDEE", "SPEAKER"].includes(role),
                ),
            )));
    if (path === "/auth/register")
      valid = typeof body?.user_id === "string" && !!body.user_id;
    if (path === "/auth/verify-reset-code")
      valid =
        /^[A-Za-z0-9_-]{43}$/.test(body?.reset_token ?? "") &&
        Number.isInteger(body?.expires_in) &&
        body.expires_in > 0;
    if (
      [
        "/auth/logout",
        "/auth/reset-password",
        "/auth/forgot-password",
        "/users/me/password",
      ].includes(path)
    )
      valid = body?.status === "OK";
    if (!valid || (options.validate && !options.validate(body)))
      throw new ApiException("UPSTREAM_UNAVAILABLE", "", 502, requestId);
    if (path === "/users/me") {
      const profile = body as MeProfile;
      body = {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        ...(profile.avatar ? { avatar: { url: profile.avatar.url, revision: profile.avatar.revision } } : {}),
        memberships: profile.memberships.map(
          ({ organization_id, name, slug, roles, description, cover }) => ({
            organization_id,
            name,
            slug,
            roles,
            description: description ?? null,
            cover: cover ? { url: cover.url, revision: cover.revision } : emptyCover,
          }),
        ),
      };
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiException) throw error;
    throw new ApiException(
      deadline.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      "",
      0,
      id,
    );
  }
}
function emptyRecord(unavailable = false) {
  return {
    version: 2 as const,
    generation: crypto.randomUUID(),
    access: null,
    refresh: null,
    unavailable,
  };
}
// Caller holds the cross-tab lock. Persist intent before rotating; never replay an uncertain proof.
async function refreshLocked(expected: ReturnType<typeof readSession>) {
  const current = readSession();
  if (current.generation !== expected.generation)
    throw new ApiException("UNAUTHENTICATED", "", 401, "");
  if (
    current.access !== expected.access ||
    current.refresh !== expected.refresh
  )
    return;
  if (!current.refresh) throw new ApiException("UNAUTHENTICATED", "", 401, "");
  if (current.refreshAttempt === current.refresh)
    throw new ApiException("UPSTREAM_UNAVAILABLE", "", 0, "");
  writeSession({ ...current, refreshAttempt: current.refresh });
  try {
    const tokens = await rawRequest<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: { refresh_token: current.refresh },
      anonymous: true,
    });
    writeSession({
      ...current,
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      refreshAttempt: undefined,
    });
  } catch (error) {
    if (error instanceof ApiException && [401, 403].includes(error.status))
      writeSession(emptyRecord(error.status === 403));
    throw error;
  }
}
let refreshFlight: { generation: string; promise: Promise<void> } | null = null;
async function refreshOnce(expected: ReturnType<typeof readSession>) {
  if (refreshFlight?.generation === expected.generation)
    return refreshFlight.promise;
  const promise = withSessionLock(() => refreshLocked(expected));
  refreshFlight = { generation: expected.generation, promise };
  void promise
    .finally(() => {
      if (refreshFlight?.promise === promise) refreshFlight = null;
    })
    .catch(() => {});
  return promise;
}
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const initial = readSession();
  const identity = identityPath(path);
  const attach = !(authMode === "real" && !identity) && !options.anonymous;
  const protectedIdentity = identity && attach && !path.startsWith("/auth/");
  const expected = options.generation ?? initial.generation;
  const checkContext = () => {
    options.signal?.throwIfAborted();
    if (protectedIdentity && readSession().generation !== expected)
      throw new ApiException("UNAUTHENTICATED", "", 401, "");
  };
  const send = async (current: typeof initial) => {
    checkContext();
    const data = await rawRequest<T>(
      path,
      options,
      attach ? current.access : null,
    );
    checkContext();
    return data;
  };
  const invalidate = async (current: typeof initial, error: unknown) => {
    if (!(error instanceof ApiException) || !protectedIdentity) return;
    const unavailable = error.status === 403 && path === "/users/me";
    if (unavailable || error.status === 401) {
      await withSessionLock(async () => {
        const latest = readSession();
        if (
          latest.generation === expected &&
          (unavailable || latest.access === current.access)
        )
          writeSession(emptyRecord(unavailable));
      });
    }
  };
  checkContext();
  let current = initial;
  if (
    protectedIdentity &&
    !options.noRefresh &&
    !current.access &&
    current.refresh
  ) {
    await refreshOnce(current);
    checkContext();
    current = readSession();
  }
  try {
    return await send(current);
  } catch (error) {
    checkContext();
    if (
      !(error instanceof ApiException) ||
      error.status !== 401 ||
      !protectedIdentity ||
      options.noRefresh ||
      !current.refresh
    ) {
      if (
        !(
          options.noRefresh &&
          error instanceof ApiException &&
          error.status === 401
        )
      )
        await invalidate(current, error);
      throw error;
    }
    await refreshOnce(current);
    checkContext();
    current = readSession();
    try {
      return await send(current);
    } catch (retryError) {
      checkContext();
      await invalidate(current, retryError);
      throw retryError;
    }
  }
}
export async function logoutSession(): Promise<
  "confirmed" | "local-cleared" | "superseded"
> {
  const expected = readSession();
  return withSessionLock(async () => {
    let current = readSession();
    if (current.generation !== expected.generation) return "superseded";
    try {
      if (!current.access && current.refresh) {
        await refreshLocked(current);
        current = readSession();
      }
      if (current.access && current.refresh) {
        try {
          await rawRequest(
            "/auth/logout",
            { method: "POST", body: { refresh_token: current.refresh } },
            current.access,
          );
        } catch (error) {
          if (error instanceof ApiException && error.status === 401) {
            await refreshLocked(current);
            current = readSession();
            await rawRequest(
              "/auth/logout",
              { method: "POST", body: { refresh_token: current.refresh } },
              current.access,
            );
          } else throw error;
        }
        return "confirmed";
      }
      return "local-cleared";
    } finally {
      if (readSession().generation === expected.generation)
        writeSession(emptyRecord());
    }
  });
}
