"use client";

import { Button } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { RoleAssignments } from "./RoleAssignments";
import { detailCopy as copy, type OrganizationView, type DetailPresentation } from "./detailData";

interface OrganizationOverviewProps {
  readonly organization: OrganizationView;
  readonly presentation: DetailPresentation;
  readonly onMembers: () => void;
}

export function OrganizationOverview({ organization, presentation, onMembers }: OrganizationOverviewProps) {
  const guidance = presentation === "owner" ? copy.ownerGuidance : presentation === "admin" ? copy.adminGuidance : copy.memberGuidance;
  return <div className="org-detail-overview">
    <section className="card" style={{ padding: 32, borderRadius: 16, background: "var(--surface)", boxShadow: "var(--neu)", minWidth: 0 }} aria-labelledby="org-detail-basic">
      <h2 id="org-detail-basic" className="muted small" style={{ margin: "0 0 24px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>{copy.basic}</h2>
      <dl className="org-detail-fields" style={{ margin: 0 }}>
        <div><dt>{copy.organizationName}</dt><dd style={{ fontSize: 20 }}>{organization.name}</dd></div>
        <div><dt>{copy.identifier}</dt><dd style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{organization.slug}</dd></div>
        <div><dt>{copy.myRoles}</dt><dd><RoleAssignments assignments={organization.my_roles} /></dd></div>
        <div><dt>{copy.administration}</dt><dd style={{ color: "var(--secondary)", fontSize: 14 }}>{presentation === "owner" ? copy.ownerPrivilege : presentation === "admin" ? copy.adminPrivilege : copy.memberPrivilege}</dd></div>
      </dl>
      <div className="spread" style={{ flexWrap: "wrap", gap: 12, marginTop: 32 }}><span className="muted small">{copy.readOnly}</span><Button onClick={onMembers} style={{ borderRadius: 8, fontSize: 13 }}>{copy.toMembers}<AccountIcon name="arrow" /></Button></div>
    </section>
    <aside className="card stack" style={{ background: "var(--surface-2)", padding: 32, gap: 18, borderRadius: 16, boxShadow: "none" }} aria-labelledby="org-detail-guidance">
      <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12, background: "var(--accent-soft)", color: "var(--warn)" }}><AccountIcon name="notice" size={22} /></span>
      <h2 id="org-detail-guidance" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{copy.scopeHeading}</h2><p style={{ margin: 0, color: "var(--text-soft)", fontSize: 15, lineHeight: 1.65 }}>{guidance}</p>
    </aside>
    <style jsx>{`
      .org-detail-overview { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
      .org-detail-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
      .org-detail-fields dt { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
      .org-detail-fields dd { margin: 0; color: var(--text); font-weight: 500; overflow-wrap: anywhere; }
      @media (max-width: 768px) { .org-detail-overview { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 480px) { .org-detail-fields { grid-template-columns: minmax(0, 1fr); } }
    `}</style>
  </div>;
}
