import { detailCopy as copy, type RoleAssignment } from "./detailData";

interface RoleAssignmentsProps { readonly assignments: readonly RoleAssignment[]; }

export function RoleAssignments({ assignments }: RoleAssignmentsProps) {
  if (!assignments.length) return <span className="muted">{copy.noRole}</span>;
  return <div className="stack" style={{ gap: 10 }}>
    {assignments.map((role, index) => <div key={`${role.code}:${role.resource_type}:${role.resource_id}:${index}`} style={{ minWidth: 0 }}>
      <strong style={{ color: role.code === "OWNER" ? "var(--warn)" : role.resource_type === "EVENT" ? "var(--secondary)" : "var(--text)", fontSize: 14, fontWeight: 600 }}>{role.code}</strong>
      <p className="muted small" style={{ margin: "2px 0 0" }}>{copy.scope}: {role.resource_type === "ORG" ? copy.orgScope : role.resource_type === "EVENT" ? copy.eventScope : role.resource_type}</p>
      {role.resource_type !== "ORG" && <code style={{ display: "block", fontSize: 11, color: "var(--text-soft)", overflowWrap: "anywhere", marginTop: 4 }}>{role.resource_id}</code>}
    </div>)}
  </div>;
}
