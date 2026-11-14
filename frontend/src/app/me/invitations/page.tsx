import type { Metadata } from "next";
import { Suspense } from "react";
import { MyInvitationsPage } from "@/features/my-invitations/MyInvitationsPage";
import { MyInvitationsPreview } from "@/features/my-invitations/MyInvitationsPreview";
import { createInboxFixture, inboxCopy } from "@/features/my-invitations/invitationsData";

export const metadata: Metadata = { title: inboxCopy.title };

interface MyInvitationsRouteProps { readonly children?: never; }

export default function MyInvitationsRoute({}: MyInvitationsRouteProps) {
  if (process.env.NODE_ENV === "development") {
    return <Suspense fallback={<MyInvitationsPage fixture={createInboxFixture("loading")} />}><MyInvitationsPreview /></Suspense>;
  }
  return <MyInvitationsPage />;
}
