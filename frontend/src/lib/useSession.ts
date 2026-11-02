"use client";

import { useCallback, useEffect, useState } from "react";

import { request } from "./apiClient";
import {
  clearSession,
  getCachedProfile,
  getRefreshToken,
  isAuthenticated,
  setCachedProfile,
  subscribeAuth,
} from "./auth";
import type { MeProfile } from "./types";

export type SessionState = "UNKNOWN" | "ANONYMOUS" | "AUTHENTICATED";

/** Header và trang cùng cần /users/me: gộp thành một request đang bay (00 §2 chồng request). */
let inflight: Promise<MeProfile> | null = null;

function loadProfile(): Promise<MeProfile> {
  if (!inflight) {
    inflight = request<MeProfile>("/users/me")
      .then((profile) => {
        setCachedProfile(profile);
        inflight = null;
        return profile;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

export interface Session {
  state: SessionState;
  profile: MeProfile | null;
  /** memberships rỗng = chưa có tổ chức, dùng cho guard /organizer (05 §1). */
  organizations: MeProfile["memberships"];
  reload: () => Promise<MeProfile>;
  logout: () => Promise<void>;
}

export function useSession(): Session {
  const [state, setState] = useState<SessionState>("UNKNOWN");
  const [profile, setProfile] = useState<MeProfile | null>(null);

  useEffect(() => {
    const sync = () => {
      if (!isAuthenticated()) {
        setState("ANONYMOUS");
        setProfile(null);
        return;
      }
      setState("AUTHENTICATED");
      const cached = getCachedProfile();
      if (cached) setProfile(cached);
      loadProfile()
        .then(setProfile)
        .catch(() => {
          // 401 đã được apiClient xử lý (refresh + redirect); 5xx thì header hiện "Khách" (04 §6).
        });
    };
    sync();
    return subscribeAuth(sync);
  }, []);

  const reload = useCallback(async () => {
    const next = await loadProfile();
    setProfile(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    const refresh_token = getRefreshToken();
    try {
      await request("/auth/logout", { method: "POST", body: { refresh_token }, anonymous: true });
    } catch {
      // 00 §2: API lỗi vẫn phải xóa token và về /auth.
    }
    clearSession();
    window.location.assign("/auth");
  }, []);

  return {
    state,
    profile,
    organizations: profile?.memberships ?? [],
    reload,
    logout,
  };
}
