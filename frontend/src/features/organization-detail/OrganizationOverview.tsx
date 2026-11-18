"use client";

import { Badge, Button } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { OrganizationCoverImage } from "@/features/organizations/OrganizationCoverImage";
import { EditOrganizationCover, EditOrganizationDescription } from "./OrganizationProfileEditors";
import { detailCopy as copy, type OrganizationView, type DetailPresentation } from "./detailData";

interface OrganizationOverviewProps {
  readonly organization: OrganizationView;
  readonly presentation: DetailPresentation;
  readonly onMembers: () => void;
  readonly actions?: OrganizationProfileActions;
}

export interface OrganizationProfileActions {
  readonly saveDescription: (description: string | null) => Promise<void>;
  readonly saveCover: (file: File, onStage: (stage: "upload" | "commit") => void) => Promise<void>;
}

export function OrganizationOverview({ organization, presentation, onMembers, actions }: OrganizationOverviewProps) {
  const guidance = presentation === "owner" ? copy.ownerGuidance : presentation === "admin" ? copy.adminGuidance : copy.memberGuidance;
  return <div className="org-detail-overview">
    <section className="card org-detail-profile" aria-label="Hồ sơ tổ chức">
      <div className="org-detail-description">
        <h2>Mô tả <em>tổ chức</em></h2>
        <p className={organization.description ? undefined : "muted"} style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {organization.description ?? "Chưa có mô tả."}
        </p>
        {actions && <EditOrganizationDescription description={organization.description} save={actions.saveDescription} />}
      </div>
      <div className="org-detail-cover">
        <OrganizationCoverImage url={organization.cover.url} />
        {actions && <EditOrganizationCover save={actions.saveCover} />}
      </div>
    </section>
    <section className="card" style={{ padding: 24, borderRadius: 16, background: "var(--surface)", boxShadow: "var(--neu)", minWidth: 0 }} aria-labelledby="org-detail-basic">
      <h2 id="org-detail-basic" style={{ margin: "0 0 20px", fontSize: 20 }}>{copy.basic}</h2>
      <dl className="org-detail-fields" style={{ margin: 0 }}>
        <div><dt>{copy.organizationName}</dt><dd style={{ fontSize: 20 }}>{organization.name}</dd></div>
        <div><dt>{copy.identifier}</dt><dd style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{organization.slug}</dd></div>
        <div><dt>{copy.myRoles}</dt><dd className="row" style={{ flexWrap: "wrap", gap: 6 }}>{organization.my_roles.length
          ? organization.my_roles.map((code) => <Badge key={code} tone={code === "OWNER" ? "warn" : "muted"}>{code}</Badge>)
          : <span className="muted">{copy.noRole}</span>}</dd></div>
        <div><dt>{copy.administration}</dt><dd style={{ color: "var(--secondary)", fontSize: 14 }}>{presentation === "owner" ? copy.ownerPrivilege : presentation === "admin" ? copy.adminPrivilege : copy.memberPrivilege}</dd></div>
      </dl>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 32 }}><Button onClick={onMembers} style={{ fontSize: 14 }}>{copy.toMembers}<AccountIcon name="arrow" /></Button></div>
    </section>
    <aside className="card stack" style={{ background: "var(--surface-2)", padding: 24, gap: 10, borderRadius: 16, boxShadow: "none" }} aria-labelledby="org-detail-guidance">
      <h2 id="org-detail-guidance" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{copy.scopeHeading}</h2><p style={{ margin: 0, color: "var(--text-soft)", fontSize: 15, lineHeight: 1.65 }}>{guidance}</p>
    </aside>
    <style jsx>{`
      .org-detail-overview { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
      .org-detail-profile { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; padding: clamp(18px, 3vw, 28px); border-radius: 16px; align-items: start; }
      .org-detail-description, .org-detail-cover { display: grid; gap: 12px; min-width: 0; }
      .org-detail-description h2 { margin: 0; font-size: 22px; letter-spacing: -.025em; }
      .org-detail-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
      .org-detail-fields dt { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
      .org-detail-fields dd { margin: 0; color: var(--text); font-weight: 500; overflow-wrap: anywhere; }
      @media (max-width: 768px) { .org-detail-overview, .org-detail-profile { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
      @media (max-width: 480px) { .org-detail-fields { grid-template-columns: minmax(0, 1fr); } }
    `}</style>
  </div>;
}
