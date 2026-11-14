"use client";

import { useSearchParams } from "next/navigation";
import { AccountPage } from "./AccountPage";
import { IdentityHeader } from "./IdentityHeader";
import { getAccountPreview } from "./accountData";
import { useAccountTheme } from "./useAccountTheme";

interface AccountPagePreviewProps { readonly children?: never; }
interface AccountHeaderPreviewProps { readonly children?: never; }

/** Development-only fixture URLs, with no controls in the product page. */
export function AccountPagePreview({}: AccountPagePreviewProps = {}) {
  const params = useSearchParams();
  return <AccountPage fixture={getAccountPreview(params.get("accountPreview"))} />;
}

export function AccountHeaderPreview({}: AccountHeaderPreviewProps = {}) {
  const params = useSearchParams();
  const { theme, toggleTheme } = useAccountTheme();
  return <IdentityHeader fixture={getAccountPreview(params.get("accountPreview"))} theme={theme} onToggleTheme={toggleTheme} />;
}
