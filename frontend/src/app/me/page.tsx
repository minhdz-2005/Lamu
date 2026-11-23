import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPage } from "@/features/account/AccountPage";
import { AccountPagePreview } from "@/features/account/AccountPreview";
import { LiveAccountPage } from "@/features/account/LiveAccountPage";
import { accountCopy, accountFixtures } from "@/features/account/accountData";

export const metadata: Metadata = { title: accountCopy.title };

interface AccountRouteProps { readonly children?: never; }

export default function AccountRoute({}: AccountRouteProps) {
  if (process.env.NODE_ENV === "development") {
    return <Suspense fallback={<AccountPage fixture={accountFixtures.loading} showHeader={false} />}><AccountPagePreview /></Suspense>;
  }
  return <LiveAccountPage />;
}
