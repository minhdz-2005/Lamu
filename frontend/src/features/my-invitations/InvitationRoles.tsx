import type { RoleAssignment } from "@/features/organization-detail/detailData";
import { inboxCopy as copy } from "./invitationsData";

interface InvitationRolesProps { readonly roles: readonly RoleAssignment[]; readonly expanded?: boolean; }

export function InvitationRoles({ roles, expanded = false }: InvitationRolesProps) {
  if (!roles.length) return <span style={{ display: "inline-block", padding: "3px 8px", background: "var(--surface-3)", color: "var(--text-soft)", borderRadius: 5, fontSize: 14 }}>{copy.noRole}</span>;
  return <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
    {roles.map((role, index) => <div key={`${role.code}:${role.resource_type}:${role.resource_id}:${index}`} style={{ minWidth: 0, maxWidth: "100%" }}>
      <span style={{ display: "inline-block", fontSize: 14, fontWeight: 500, background: "var(--surface-3)", borderRadius: 5, padding: "3px 8px", color: role.resource_type === "EVENT" ? "var(--warn)" : "var(--text)" }}>{role.code}</span>
      <span style={{ marginLeft: 8, fontSize: 14, color: "var(--text-soft)" }}>{copy.scope}: {role.resource_type === "ORG" ? copy.orgScope : role.resource_type === "EVENT" ? copy.eventScope : role.resource_type}</span>
      {(expanded || role.resource_type !== "ORG") && <code style={{ display: "block", marginTop: 4, color: "var(--muted)", fontSize: 11, overflowWrap: "anywhere" }}>{copy.scopeId}: {role.resource_id}</code>}
    </div>)}
  </div>;
}
