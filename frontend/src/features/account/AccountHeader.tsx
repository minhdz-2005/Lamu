"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { readSession, sanitizeNext } from "@/lib/auth";
import { useSession } from "@/lib/useSession";
import {
  detailScenarioNames,
  dialogPreviewNames,
} from "@/features/organization-detail/detailData";
import {
  actionPreviewNames,
  inboxPreviewNames,
} from "@/features/my-invitations/invitationsData";
import {
  dialogFixtures,
  organizationsFixtures,
} from "@/features/organizations/organizationsData";
import { IdentityHeader } from "./IdentityHeader";
import type { AccountFixture } from "./accountData";
import { toAccountProfile } from "./accountView";
import { useAccountTheme } from "./useAccountTheme";
import { useSignOut } from "./useSignOut";

interface AccountHeaderProps {
  readonly activeHref?: "/me" | "/organizations" | "/me/invitations";
  readonly previewFixture?: AccountFixture;
  readonly onChooseAvatar?: () => void;
  readonly avatarBusy?: boolean;
}

function HeaderWithPreview(props: AccountHeaderProps) {
  const { activeHref, previewFixture, onChooseAvatar, avatarBusy } = props;
  const params = useSearchParams();
  const path = usePathname();
  const { theme, toggleTheme } = useAccountTheme();
  const otherPreview =
    path === "/me/invitations"
      ? inboxPreviewNames.some((key) => key === params.get("inboxPreview")) ||
        actionPreviewNames.some((key) => key === params.get("inboxAction"))
      : path === "/organizations"
        ? Object.hasOwn(
            organizationsFixtures,
            params.get("organizationsPreview") ?? "",
          ) || Object.hasOwn(dialogFixtures, params.get("dialogPreview") ?? "")
        : path.startsWith("/organizations/") &&
          (detailScenarioNames.some(
            (key) => key === params.get("detailPreview"),
          ) ||
            dialogPreviewNames.some(
              (key) => key === params.get("detailDialog"),
            ));
  if (previewFixture || otherPreview) {
    return (
      <IdentityHeader
        fixture={previewFixture || { state: "empty", profile: null }}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeHref={activeHref}
        onChooseAvatar={onChooseAvatar}
        avatarBusy={avatarBusy}
      />
    );
  }
  return <LiveAccountHeader {...props} />;
}

function LiveAccountHeader({ activeHref, onChooseAvatar, avatarBusy }: AccountHeaderProps) {
  const { theme, toggleTheme } = useAccountTheme();
  const session = useSession();
  const { state, profile } = session;
  const { signOut, loggingOut, notice, redirecting } = useSignOut(session);
  const pathname = usePathname();
  const router = useRouter();
  const loginHref = `/auth?next=${encodeURIComponent(sanitizeNext(pathname))}`;

  useEffect(() => {
    if (state !== "ANONYMOUS" || loggingOut || notice || redirecting.current)
      return;
    const current = readSession();
    if (!current.access && !current.refresh) router.replace(loginHref);
  }, [state, loggingOut, notice, loginHref, redirecting, router]);

  const user =
    state === "AUTHENTICATED" && profile ? toAccountProfile(profile) : null;
  return (
    <IdentityHeader
      fixture={{
        state: loggingOut
          ? "logging_out"
          : state === "UNKNOWN"
            ? "loading"
            : user
              ? "success"
              : "empty",
        profile: user,
      }}
      theme={theme}
      onToggleTheme={toggleTheme}
      activeHref={activeHref}
      onChooseAvatar={onChooseAvatar}
      avatarBusy={avatarBusy}
      onLogout={() => void signOut()}
      logoutNotice={notice}
      signInHref={
        state === "UNAVAILABLE" || (state === "ANONYMOUS" && notice)
          ? loginHref
          : undefined
      }
    />
  );
}

export function AccountHeader(props: AccountHeaderProps) {
  if (props.activeHref === undefined && !props.previewFixture)
    return <LiveAccountHeader {...props} />;
  if (process.env.NODE_ENV === "development")
    return (
      <Suspense fallback={null}>
        <HeaderWithPreview {...props} />
      </Suspense>
    );
  return <LiveAccountHeader {...props} />;
}
