"use client";
import type { Avatar, MeProfile } from "./types";
import { keepNewestAvatar } from "./avatar";
import { applyOrganizationUpdate, mergeOrganizationMemberships, organizationReads, type OrganizationProfileUpdate } from "./organizationProfile";
import { authMode, isIdentityUuid, sessionKey } from "./authMode";
export interface SessionRecord {
  version: 2;
  generation: string;
  access: string | null;
  refresh: string | null;
  profile?: MeProfile;
  refreshAttempt?: string;
  unavailable?: boolean;
}
const listeners = new Set<() => void>();
function emit() {
  for (const fn of listeners) fn();
}
export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn);
  const storage = (event: StorageEvent) => {
    if (event.key === sessionKey || event.key === null) fn();
  };
  window.addEventListener("storage", storage);
  window.addEventListener("focus", fn);
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", fn);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", fn);
  };
}
export function readSession(): SessionRecord {
  const empty: SessionRecord = {
    version: 2,
    generation: "empty",
    access: null,
    refresh: null,
  };
  if (typeof window === "undefined") return empty;
  try {
    const value = JSON.parse(window.localStorage.getItem(sessionKey) ?? "null");
    return value?.version === 2 &&
      typeof value.generation === "string" &&
      (value.access === null || typeof value.access === "string") &&
      (value.refresh === null || typeof value.refresh === "string")
      ? value
      : empty;
  } catch {
    return empty;
  }
}
// Internal writers call this only while holding withSessionLock.
export function writeSession(record: SessionRecord) {
  window.localStorage.setItem(sessionKey, JSON.stringify(record));
  emit();
}
export async function withSessionLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    try {
      return await navigator.locks.request(
        sessionKey,
        { mode: "exclusive", signal: AbortSignal.timeout(15000) },
        work,
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        ["AbortError", "TimeoutError"].includes(error.name)
      )
        throw new Error(
          "Phiên đang được cập nhật ở tab khác. Hãy chờ rồi thử lại.",
        );
      throw error;
    }
  }
  if (authMode === "real")
    throw new Error(
      "Trình duyệt cần hỗ trợ Web Locks để bảo vệ phiên. Hãy dùng trình duyệt mới và HTTPS.",
    );
  return work();
}
export const getAccessToken = () => readSession().access;
export const getRefreshToken = () => readSession().refresh;
export async function setSession(access: string, refresh: string) {
  await withSessionLock(async () => {
    writeSession({
      version: 2,
      generation: crypto.randomUUID(),
      access,
      refresh,
    });
  });
}
export async function clearSession(expectedGeneration?: string) {
  return withSessionLock(async () => {
    if (expectedGeneration !== undefined && readSession().generation !== expectedGeneration)
      return false;
    writeSession({
      version: 2,
      generation: crypto.randomUUID(),
      access: null,
      refresh: null,
    });
    return true;
  });
}
export const isAuthenticated = () =>
  Boolean(readSession().access && readSession().profile);
export const getCachedProfile = () => readSession().profile ?? null;
export async function setCachedProfile(
  profile: MeProfile,
  generation = readSession().generation,
  started = organizationReads.start(),
) {
  return updateCachedProfile(generation, (current) =>
    mergeOrganizationMemberships(keepNewestAvatar(profile, current), current, generation, started),
  );
}
export function setCachedOrganization(
  profile: MeProfile, generation: string, orgId: string, update: OrganizationProfileUpdate,
) {
  return updateCachedProfile(generation, (current) => {
    if (current && current.id !== profile.id) return null;
    return updateProfileOrganization(current ?? profile, orgId, update);
  });
}

export function updateProfileOrganization(
  profile: MeProfile, orgId: string, update: OrganizationProfileUpdate,
): MeProfile {
  return {
    ...profile,
    memberships: profile.memberships.map((row) =>
      row.organization_id === orgId ? applyOrganizationUpdate(row, update) : row,
    ),
  };
}
export async function setCachedAvatar(profile: MeProfile, avatar: Avatar, generation: string) {
  return updateCachedProfile(generation, (current) => {
    if (current && current.id !== profile.id) return null;
    const base = current ?? profile;
    return keepNewestAvatar({ ...base, avatar }, base);
  });
}
async function updateCachedProfile(
  generation: string,
  update: (current: MeProfile | undefined) => MeProfile | null,
) {
  return withSessionLock(async () => {
    const current = readSession();
    if (current.generation !== generation || !current.access) return null;
    const next = update(current.profile);
    if (next) writeSession({ ...current, profile: next });
    return next;
  });
}
export function sanitizeNext(value: string | null | undefined): string {
  if (
    value === "/me" ||
    value === "/me/invitations" ||
    value === "/organizations"
  )
    return value;
  if (
    value?.startsWith("/organizations/") &&
    isIdentityUuid(value.slice("/organizations/".length))
  )
    return value;
  return "/me";
}
export function redirectToAuth(next: string) {
  if (
    typeof window === "undefined" ||
    ["/", "/auth", "/events"].includes(window.location.pathname) ||
    window.location.pathname.startsWith("/events/")
  )
    return;
  window.location.assign(
    "/auth?next=" + encodeURIComponent(sanitizeNext(next)),
  );
}
