"use client";

import { Badge } from "@/components/ui";
import { inboxCopy as copy, type InvitationStatus } from "./invitationsData";

interface InvitationStatusBadgeProps { readonly status: InvitationStatus; }

export function InvitationStatusBadge({ status }: InvitationStatusBadgeProps) {
  return <span className="inbox-status" data-status={status}>
    <Badge tone={status === "PENDING" ? "warn" : status === "ACCEPTED" ? "success" : status === "REVOKED" ? "danger" : "muted"}>{copy.status[status]}</Badge>
    <style jsx>{`.inbox-status :global(.badge) { padding: 4px 12px; border-radius: 9999px; font-size: 12px; line-height: 1.5; white-space: normal; }`}</style>
  </span>;
}
