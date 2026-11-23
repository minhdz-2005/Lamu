"use client";

import { Banner } from "@/components/ui";
import { DetailDialog } from "@/features/organization-detail/DetailDialog";
import { InvitationRoles } from "./InvitationRoles";
import { inboxCopy as copy, type InboxInvitation, type InvitationAction, type InvitationActionPhase } from "./invitationsData";

interface InvitationActionDialogProps {
  readonly invitation: InboxInvitation;
  readonly action: InvitationAction;
  readonly phase?: InvitationActionPhase;
  readonly onClose: () => void;
  readonly onSubmit?: () => void;
  readonly feedback?: string;
  readonly retryDisabled?: boolean;
}

export function InvitationActionDialog({ invitation, action, phase = "normal", onClose, onSubmit, feedback, retryDisabled }: InvitationActionDialogProps) {
  const message = phase === "unknown" ? copy.unknown : phase === "expired" ? copy.expiredError : phase === "not_pending" ? copy.processedError : phase === "already_member" ? copy.memberError : phase === "forbidden" ? copy.forbiddenError : null;
  const retry = phase === "unknown";
  return <DetailDialog title={action === "accept" ? copy.acceptTitle : copy.declineTitle} description={action === "accept" ? copy.acceptDescription : copy.declineDescription} submitLabel={retry ? copy.check : action === "accept" ? copy.accept : copy.decline} cancelLabel={copy.back} pending={phase === "submitting"} danger={action === "decline" && !retry} onClose={onClose} onSubmit={onSubmit} disableSubmit={retryDisabled}>
    {message && <Banner kind={phase === "unknown" || phase === "already_member" ? "warn" : "error"}>{message}</Banner>}
    {feedback && <Banner kind={retry ? "warn" : "error"}>{feedback}</Banner>}
    <div className="stack" style={{ background: "var(--bg-tint)", padding: 16, borderRadius: 12, gap: 12, minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, overflowWrap: "anywhere" }}>{invitation.organization_name}</h3>
      <code className="muted small" style={{ fontSize: 12, overflowWrap: "anywhere" }}>{invitation.organization_slug}</code>
      <span className="muted small">{copy.invitedRoles}</span>
      <InvitationRoles roles={invitation.roles} expanded />
    </div>
    <p className="muted small" style={{ fontSize: 11, margin: 0, lineHeight: 1.6 }}>{copy.snapshot}</p>
  </DetailDialog>;
}
