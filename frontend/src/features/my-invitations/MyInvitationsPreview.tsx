"use client";

import { useSearchParams } from "next/navigation";
import { MyInvitationsPage } from "./MyInvitationsPage";
import { LiveMyInvitationsPage } from "./LiveMyInvitationsPage";
import { actionPreviewNames, createInboxFixture, inboxPreviewNames } from "./invitationsData";

interface MyInvitationsPreviewProps { readonly children?: never; }

/** Imported only by the development branch of the route; never a product toolbar. */
export function MyInvitationsPreview({}: MyInvitationsPreviewProps = {}) {
  const params = useSearchParams();
  const scenario = inboxPreviewNames.find((name) => name === params.get("inboxPreview"));
  const action = actionPreviewNames.find((name) => name === params.get("inboxAction")) ?? "";
  return scenario || action ? <MyInvitationsPage key={`${scenario}:${action}`} fixture={createInboxFixture(scenario, action)} /> : <LiveMyInvitationsPage />;
}
