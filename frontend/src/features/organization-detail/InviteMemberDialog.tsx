"use client";

import { useState } from "react";
import { Banner, Button, Field } from "@/components/ui";
import { DetailDialog } from "./DetailDialog";
import { RoleSelection } from "./RoleSelection";
import { detailCopy as copy, type DetailDialogPhase } from "./detailData";

interface InviteMemberDialogProps { readonly phase?: DetailDialogPhase; readonly onClose: () => void; }

export function InviteMemberDialog({ phase = "normal", onClose }: InviteMemberDialogProps) {
  const [email, setEmail] = useState(phase === "recipient_error" ? "mai.tran@example.test" : "");
  const [roles, setRoles] = useState<readonly string[]>([]);
  const pending = phase === "submitting";
  return <DetailDialog title={copy.invite} description={copy.inviteDescription} submitLabel={copy.createInvitation} pending={pending} onClose={onClose}>
    {phase === "recipient_error" && <Banner kind="error">{copy.recipientError}</Banner>}
    {phase === "unknown" && <Banner kind="warn">{copy.unknown}<div style={{ marginTop: 8 }}><Button size="sm" aria-disabled="true">{copy.check}</Button></div></Banner>}
    <Field name="org-detail-invite-email" label={copy.email} type="email" required requiredMark maxLength={254} autoComplete="off" placeholder={copy.emailPlaceholder} value={email} onChange={setEmail} disabled={pending} readOnly={phase === "unknown"} error={phase === "inline_error" ? copy.emailError : undefined} />
    <RoleSelection value={roles} onChange={setRoles} disabled={pending || phase === "unknown"} invite />
    <p style={{ margin: 0, background: "var(--surface-2)", padding: 12, borderRadius: 12, fontSize: 12, color: "var(--text-soft)", lineHeight: 1.6 }}>{copy.inAppNote}</p>
  </DetailDialog>;
}
