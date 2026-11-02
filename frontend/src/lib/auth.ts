"use client";

import type { MeProfile } from "./types";

const ACCESS_KEY = "luma.access";
const REFRESH_KEY = "luma.refresh";
const PROFILE_KEY = "luma.profile";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeAuth(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setSession(access: string, refresh: string) {
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
  emit();
}

export function clearSession() {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(PROFILE_KEY);
  emit();
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function getCachedProfile(): MeProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MeProfile;
  } catch {
    return null;
  }
}

export function setCachedProfile(profile: MeProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  emit();
}

/** Route công khai theo 00 §8: token hết hạn không được đá người đọc khỏi trang đang xem. */
const PUBLIC_PATHS = ["/", "/events", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/events/");
}

/** Điều hướng tới /auth và nhớ trang đang ở, theo 00 §8. */
export function redirectToAuth(next: string) {
  if (typeof window !== "undefined" && isPublicPath(window.location.pathname)) return;
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/events";
  const target = `/auth?next=${encodeURIComponent(safe)}`;
  if (window.location.pathname + window.location.search !== target) {
    window.location.assign(target);
  }
}

/** Only cho phép next nội bộ, chống open redirect (01 §5). */
export function sanitizeNext(value: string | null | undefined): string {
  if (!value) return "/events";
  if (!value.startsWith("/") || value.startsWith("//")) return "/events";
  if (value.startsWith("/auth")) return "/events";
  return value;
}
