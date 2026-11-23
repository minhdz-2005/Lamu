"use client";

import { useSyncExternalStore } from "react";
import { logoutSession, request } from "./apiClient";
import { readSession, setCachedAvatar, setCachedOrganization, setCachedProfile, subscribeAuth, updateProfileOrganization } from "./auth";
import { keepNewestAvatar } from "./avatar";
import { mergeOrganizationMemberships, organizationReads, type OrganizationProfileUpdate } from "./organizationProfile";
import type { Avatar, MeProfile } from "./types";

export type SessionState =
  | "UNKNOWN"
  | "ANONYMOUS"
  | "AUTHENTICATED"
  | "ERROR"
  | "UNAVAILABLE";

interface Snapshot {
  state: SessionState;
  generation: string;
  profile: MeProfile | null;
  error: unknown;
}

const initial: Snapshot = {
  state: "UNKNOWN",
  generation: "empty",
  profile: null,
  error: null,
};
const emptyOrganizations: MeProfile["memberships"] = [];
let snapshot = initial;
let flight: { generation: string; promise: Promise<MeProfile> } | undefined;
let unsubscribe: (() => void) | undefined;
let pendingLogout: string | undefined;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

// Cache writes are observed across tabs, but each tab must verify its session first.
let observedProfile = "";
let observedAccess: string | null = null;

function sync() {
  const current = readSession();
  const { generation, access, refresh } = current;
  const profileSignature = JSON.stringify(current.profile ?? null);
  const tokenChanged = observedAccess !== access;
  observedAccess = access;
  if (generation === snapshot.generation && snapshot !== initial) {
    if (
      profileSignature !== observedProfile &&
      snapshot.state === "AUTHENTICATED"
    ) {
      observedProfile = profileSignature;
      void reloadProfile().catch(() => {});
    }
    if (tokenChanged && access && snapshot.state === "ERROR")
      void loadProfile().catch(() => {});
    return;
  }
  observedProfile = profileSignature;
  const state = current.unavailable
    ? "UNAVAILABLE"
    : access || refresh
      ? "UNKNOWN"
      : "ANONYMOUS";
  publish({ ...initial, generation, state });
  if (state === "UNKNOWN") void loadProfile().catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribe) unsubscribe = subscribeAuth(sync);
  sync();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      unsubscribe?.();
      unsubscribe = undefined;
      snapshot = initial;
    }
  };
}

export function loadProfile(): Promise<MeProfile> {
  const { generation } = readSession();
  if (flight?.generation === generation) return flight.promise;
  const started = organizationReads.start();
  const promise = (async () => {
    try {
      const profile = await request<MeProfile>("/users/me", { generation });
      if (readSession().generation !== generation)
        throw new Error("Phiên đã thay đổi.");
      const cached = readSession().profile;
      const candidate = mergeOrganizationMemberships(keepNewestAvatar(profile, cached), cached, generation, started);
      observedProfile = JSON.stringify(candidate);
      const saved = await setCachedProfile(candidate, generation, started);
      if (readSession().generation !== generation)
        throw new Error("Phiên đã thay đổi.");
      const previous = snapshot.generation === generation ? snapshot.profile : null;
      const next = mergeOrganizationMemberships(
        keepNewestAvatar(saved ?? candidate, previous), previous, generation, started,
      );
      observedProfile = JSON.stringify(next);
      if (listeners.size)
        publish({ state: "AUTHENTICATED", generation, profile: next, error: null });
      return next;
    } catch (error) {
      if (listeners.size && readSession().generation === generation) {
        const profile =
          snapshot.generation === generation ? snapshot.profile : null;
        publish({
          state: profile ? "AUTHENTICATED" : "ERROR",
          generation,
          profile,
          error,
        });
      }
      throw error;
    }
  })();
  flight = { generation, promise };
  void promise
    .finally(() => {
      if (flight?.promise === promise) flight = undefined;
    })
    .catch(() => {});
  return promise;
}

async function logout() {
  const expected = readSession();
  if (pendingLogout === expected.generation) return "superseded";
  pendingLogout = expected.generation;
  try {
    return await logoutSession();
  } catch (error) {
    const current = readSession();
    if (current.access || current.refresh) {
      if (current.generation !== expected.generation) return "superseded";
      throw error;
    }
    return "local-cleared";
  } finally {
    if (pendingLogout === expected.generation) pendingLogout = undefined;
  }
}

export function isIdentityLogoutPending(generation: string) {
  return pendingLogout === generation;
}

export async function reloadProfile(generation = readSession().generation) {
  if (readSession().generation !== generation)
    throw new Error("Phiên đã thay đổi.");
  if (flight?.generation === generation) {
    await flight.promise.catch(() => {});
    if (readSession().generation !== generation)
      throw new Error("Phiên đã thay đổi.");
  }
  return loadProfile();
}

export async function updateSessionAvatar(generation: string, id: string, avatar: Avatar) {
  const current = snapshot.profile;
  if (snapshot.generation !== generation || current?.id !== id ||
    readSession().generation !== generation || isIdentityLogoutPending(generation))
    return;
  const cached = readSession().profile;
  if (cached && cached.id !== id) return;
  const next = keepNewestAvatar(keepNewestAvatar({ ...current, avatar }, current), cached);
  publish({ ...snapshot, profile: next });
  observedProfile = JSON.stringify(next);
  await setCachedAvatar(current, avatar, generation);
}

export function updateSessionOrganization(
  generation: string, actor: string, orgId: string, update: OrganizationProfileUpdate,
) {
  const current = readSession();
  if (current.generation !== generation || current.profile?.id !== actor ||
      isIdentityLogoutPending(generation)) return;
  const profile = snapshot.generation === generation && snapshot.profile?.id === actor
    ? snapshot.profile
    : current.profile;
  if (update.description !== undefined)
    organizationReads.record(generation, orgId, update.description);
  const next = updateProfileOrganization(profile, orgId, update);
  observedProfile = JSON.stringify(next);
  if (snapshot.generation === generation) publish({ ...snapshot, profile: next });
  return setCachedOrganization(profile, generation, orgId, update);
}

export function useSession() {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => initial,
  );
  return {
    ...current,
    organizations: current.profile?.memberships ?? emptyOrganizations,
    reload: reloadProfile,
    logout,
  };
}

export type Session = ReturnType<typeof useSession>;
