"use client";

import { useState } from "react";
import { ApiException } from "@/lib/errors";
import { isIdentityLogoutPending, useSession } from "@/lib/useSession";
import { clearSession, readSession } from "@/lib/auth";
import { request } from "@/lib/apiClient";
import { AccountPage } from "./AccountPage";
import { toAccountProfile } from "./accountView";
import type { AccountFixture } from "./accountData";
import { PasswordChangeForm, type PasswordChange } from "./PasswordChangeForm";
import { useAvatarChange } from "./useAvatarChange";

export function LiveAccountPage() {
  const { state, profile, error, reload, generation } = useSession();
  const [reloading, setReloading] = useState(false);
  const avatar = useAvatarChange(profile, generation);

  async function goToSignIn(changed = false) {
    if (await clearSession(generation))
      window.location.replace(
        changed
          ? "/auth?next=%2Fme&reason=password-changed"
          : "/auth?next=%2Fme",
      );
  }

  async function changePassword(body: PasswordChange, signal: AbortSignal) {
    if (
      isIdentityLogoutPending(generation) ||
      readSession().generation !== generation
    )
      throw new ApiException("UNAUTHENTICATED", "", 401, "");
    await request("/users/me/password", {
      method: "POST",
      body,
      signal,
      generation,
      noRefresh: true,
    });
    // The request succeeded. Scope local cleanup to the same login even after navigation.
    await goToSignIn(true);
  }

  async function reloadProfile() {
    setReloading(true);
    try {
      await reload();
    } catch {
      // The shared session publishes the guarded reload error.
    } finally {
      setReloading(false);
    }
  }

  const viewProfile = profile ? toAccountProfile(profile) : null;
  let view: AccountFixture = { state: "loading", profile: null };
  if (state === "ANONYMOUS") {
    view = {
      state: "session_expired",
      profile: null,
      notice: {
        kind: "info",
        title: "Vui lòng đăng nhập để xem tài khoản.",
        action: "login",
      },
    };
  } else if (state === "UNAVAILABLE") {
    view = {
      state: "account_unavailable",
      profile: null,
      notice: {
        kind: "danger",
        icon: "lock",
        title: "Tài khoản hiện không khả dụng.",
        action: "login",
      },
    };
  } else if (state === "ERROR" || (state === "AUTHENTICATED" && error)) {
    const rateLimited = error instanceof ApiException && error.status === 429;
    view = {
      state: rateLimited ? "rate_limit" : "network_error",
      profile: viewProfile,
      notice: {
        kind: rateLimited ? "warning" : "danger",
        title: rateLimited
          ? "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại."
          : "Không tải được thông tin tài khoản. Vui lòng thử lại.",
        description: viewProfile
          ? "Thông tin bên dưới là lần tải thành công gần nhất."
          : undefined,
        action: viewProfile ? undefined : "retry",
      },
    };
  } else if (state === "AUTHENTICATED" && viewProfile) {
    view = {
      state: viewProfile.memberships.length ? "success" : "empty",
      profile: viewProfile,
    };
  }

  return (
    <AccountPage
      fixture={view}
      onReload={() => void reloadProfile()}
      reloading={reloading}
      onAvatarFile={
        viewProfile ? (file) => void avatar.change(file) : undefined
      }
      avatarBusy={avatar.busy}
      avatarMessage={avatar.message}
      passwordForm={
        viewProfile && (
          <PasswordChangeForm
            key={generation}
            change={changePassword}
            reauthenticate={() => goToSignIn()}
          />
        )
      }
    />
  );
}
