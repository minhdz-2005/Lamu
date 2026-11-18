"use client";

import { useState } from "react";
import { DetailDialog } from "./DetailDialog";
import { DetailOperationStatus, type DetailOperationFeedback } from "./DetailOperationStatus";
import { RoleSelection, type OrgRoleCode } from "./RoleSelection";
import { detailCopy as copy, type OrganizationMember, type DetailDialogPhase } from "./detailData";

interface OrgRoleEditorProps extends DetailOperationFeedback {
  readonly member: OrganizationMember;
  readonly phase?: DetailDialogPhase;
  readonly onClose: () => void;
  readonly onSubmit?: (roles: readonly OrgRoleCode[]) => void;
}

export function OrgRoleEditor({ member, phase = "normal", busy, unknown = phase === "unknown", error, onClose, onSubmit, onRetry }: OrgRoleEditorProps) {
  const [roles, setRoles] = useState<readonly OrgRoleCode[]>(member.roles.map((role) => role.code).filter((code) => code === "OWNER" || code === "ADMIN"));
  const pending = busy || phase === "submitting";
  const feedback = error ?? (phase === "last_owner" || phase === "inline_error" ? copy.lastOwner : undefined);
  return <DetailDialog title={copy.changeRole} description={`${copy.members}: ${member.display_name}`} submitLabel={copy.save} pending={pending} disableSubmit={unknown} onClose={onClose} onSubmit={onSubmit && (() => onSubmit(roles))}>
    <p style={{ margin: 0, background: "var(--surface-2)", padding: 14, borderRadius: 12, color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5 }}>{copy.replacement}</p>
    <DetailOperationStatus error={feedback} unknown={unknown} onRetry={onRetry} />
    <RoleSelection value={roles} onChange={setRoles} disabled={pending || unknown} />
  </DetailDialog>;
}
