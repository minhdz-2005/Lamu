"use client";

import { Suspense } from "react";
import { IdentityHeader } from "./IdentityHeader";
import { AccountHeaderPreview } from "./AccountPreview";
import { accountFixtures } from "./accountData";
import { useAccountTheme } from "./useAccountTheme";

interface AccountHeaderProps { readonly activeHref?: "/me" | "/organizations" | "/me/invitations"; }

export function AccountHeader({ activeHref = "/me" }: AccountHeaderProps = {}) {
  const { theme, toggleTheme } = useAccountTheme();
  if (process.env.NODE_ENV === "development" && activeHref === "/me") {
    return <Suspense fallback={<IdentityHeader fixture={accountFixtures.loading} theme={theme} onToggleTheme={toggleTheme} />}><AccountHeaderPreview /></Suspense>;
  }
  return <IdentityHeader fixture={accountFixtures.success} theme={theme} onToggleTheme={toggleTheme} activeHref={activeHref} />;
}
