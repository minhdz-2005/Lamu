"use client";

import { detailCopy as copy } from "./detailData";

export type OrgRoleCode = "OWNER" | "ADMIN";

interface RoleSelectionProps {
  readonly value: readonly OrgRoleCode[];
  readonly onChange: (roles: readonly OrgRoleCode[]) => void;
  readonly disabled?: boolean;
  readonly invite?: boolean;
}

export function RoleSelection({ value, onChange, disabled = false, invite = false }: RoleSelectionProps) {
  return <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }} disabled={disabled}>
    <legend style={{ fontSize: 14, marginBottom: 8, fontWeight: 500 }}>{copy.roleChoice}</legend>
    <div className="stack" style={{ gap: 8 }}>
      {(["OWNER", "ADMIN", "NONE"] as const).map((role) => <label key={role} className="org-detail-role-choice" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, background: "var(--bg-tint)", margin: 0, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .65 : 1 }}>
        <input type="checkbox" name={`org-detail-role-${role}`} checked={role === "NONE" ? !value.length : value.includes(role)}
          onChange={() => onChange(role === "NONE" ? [] : value.includes(role) ? value.filter((item) => item !== role) : [...value, role])}
          style={{ margin: "3px 0 0", width: 16, height: 16, minHeight: 16, flexShrink: 0, padding: 0, accentColor: "var(--primary)" }} />
        <span style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{role === "OWNER" ? copy.ownerChoice : role === "ADMIN" ? copy.adminChoice : invite ? copy.noneInvite : copy.noneRole}</strong><span className="small" style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--text-soft)", lineHeight: 1.5 }}>{role === "OWNER" ? copy.ownerHint : role === "ADMIN" ? copy.adminHint : copy.noneHint}</span></span>
      </label>)}
    </div>
    <style jsx>{`.org-detail-role-choice:hover { box-shadow: inset 0 0 0 1px var(--border); }`}</style>
  </fieldset>;
}
