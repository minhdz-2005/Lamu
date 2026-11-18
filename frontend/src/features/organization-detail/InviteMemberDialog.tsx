"use client";

import { useState } from "react";
import { Field, focusField } from "@/components/ui";
import { DetailDialog } from "./DetailDialog";
import { DetailOperationStatus, type DetailOperationFeedback } from "./DetailOperationStatus";
import { RoleSelection, type OrgRoleCode } from "./RoleSelection";
import { detailCopy as copy, type DetailDialogPhase } from "./detailData";

interface InviteMemberDialogProps extends DetailOperationFeedback {
  readonly phase?: DetailDialogPhase;
  readonly onClose: () => void;
  readonly onSubmit?: (email: string, roles: readonly OrgRoleCode[]) => void;
}

const emailField = "org-detail-invite-email";

export function InviteMemberDialog({ phase = "normal", busy, unknown = phase === "unknown", error, onClose, onSubmit, onRetry }: InviteMemberDialogProps) {
  const [email, setEmail] = useState(phase === "recipient_error" ? "mai.tran@example.test" : "");
  const [roles, setRoles] = useState<readonly OrgRoleCode[]>([]);
  const [invalidEmail, setInvalidEmail] = useState(phase === "inline_error");
  const pending = busy || phase === "submitting";
  function submit() {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
      setInvalidEmail(true);
      focusField(emailField);
      return;
    }
    onSubmit?.(normalized, roles);
  }
  return <DetailDialog title={copy.invite} description={copy.inviteDescription} submitLabel={copy.createInvitation} pending={pending} disableSubmit={unknown} onClose={onClose} onSubmit={onSubmit && submit}>
    <DetailOperationStatus error={error ?? (phase === "recipient_error" ? copy.recipientError : undefined)} unknown={unknown} onRetry={onRetry} />
    <Field name={emailField} label={copy.email} type="email" required requiredMark maxLength={254} autoComplete="off" placeholder={copy.emailPlaceholder} value={email} onChange={(value) => { setEmail(value); setInvalidEmail(false); }} disabled={pending} readOnly={unknown} error={invalidEmail ? copy.emailError : undefined} />
    <RoleSelection value={roles} onChange={setRoles} disabled={pending || unknown} invite />
    <p style={{ margin: 0, background: "var(--surface-2)", padding: 12, borderRadius: 12, fontSize: 12, color: "var(--text-soft)", lineHeight: 1.6 }}>{copy.inAppNote}</p>
  </DetailDialog>;
}
