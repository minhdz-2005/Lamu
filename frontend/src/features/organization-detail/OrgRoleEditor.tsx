"use client";

import { useState } from "react";
import { Banner, Button } from "@/components/ui";
import { DetailDialog } from "./DetailDialog";
import { RoleSelection } from "./RoleSelection";
import { detailCopy as copy, type OrganizationMember, type DetailDialogPhase } from "./detailData";

interface OrgRoleEditorProps { readonly member: OrganizationMember; readonly phase?: DetailDialogPhase; readonly onClose: () => void; }

export function OrgRoleEditor({ member, phase = "normal", onClose }: OrgRoleEditorProps) {
  const [roles, setRoles] = useState<readonly string[]>(member.roles.map((role) => role.code));
  const pending = phase === "submitting";
  return <DetailDialog title={copy.changeRole} description={`${copy.members}: ${member.display_name}`} submitLabel={copy.save} pending={pending} onClose={onClose}>
    <p style={{ margin: 0, background: "var(--surface-2)", padding: 14, borderRadius: 12, color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5 }}>{copy.replacement}</p>
    {(phase === "last_owner" || phase === "inline_error") && <Banner kind="error">{copy.lastOwner}</Banner>}
    {phase === "unknown" && <Banner kind="warn">{copy.unknown}<div style={{ marginTop: 8 }}><Button size="sm" aria-disabled="true">{copy.check}</Button></div></Banner>}
    <RoleSelection value={roles} onChange={setRoles} disabled={pending || phase === "unknown"} />
  </DetailDialog>;
}
