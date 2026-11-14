"use client";

import Link from "next/link";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { Badge, Skeleton } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { OrganizationOverview } from "./OrganizationOverview";
import { MembersTable } from "./MembersTable";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { OrgRoleEditor } from "./OrgRoleEditor";
import { InvitationReceipt, RevokeInvitationDialog } from "./InvitationReceipt";
import { createDetailFixture, detailCopy as copy, supportsOrgEditor, type DetailFixture, type DetailDialogKind, type DetailDialogPhase, type OrganizationMember } from "./detailData";

export interface DetailDialogPreview {
  readonly kind: DetailDialogKind;
  readonly phase: DetailDialogPhase;
}

interface OrganizationDetailPageProps {
  readonly orgId: string;
  readonly fixture?: DetailFixture;
  readonly dialogPreview?: DetailDialogPreview;
}

const backStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-soft)", fontSize: 14, textDecoration: "none" };

export function OrganizationDetailPage({ orgId, fixture = createDetailFixture(orgId), dialogPreview }: OrganizationDetailPageProps) {
  const [tab, setTab] = useState<"overview" | "members">(fixture.initialTab);
  const [activeDialog, setActiveDialog] = useState<DetailDialogPreview | null>(dialogPreview ?? null);
  const [selected, setSelected] = useState<OrganizationMember | null>(dialogPreview?.kind === "roles" ? fixture.members[dialogPreview.phase === "last_owner" ? 0 : 1] ?? null : null);
  const [receiptVisible, setReceiptVisible] = useState(Boolean(fixture.receipt));
  const org = fixture.organization;
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "overview" : event.key === "End" ? "members" : tab === "overview" ? "members" : "overview";
    setTab(next); document.getElementById(`org-detail-tab-${next}`)?.focus();
  };
  const openEdit = (member: OrganizationMember) => {
    if (fixture.presentation !== "owner" || member.status !== "ACTIVE" || !supportsOrgEditor(member, orgId)) return;
    setSelected(member); setActiveDialog({ kind: "roles", phase: "normal" });
  };
  const closeDialog = () => setActiveDialog(null);

  return <div className="org-detail-page" style={{ minHeight: "calc(100svh - 72px)", display: "flex", flexDirection: "column", background: "var(--bg-tint)", color: "var(--text)", font: "15px/1.65 var(--font-sans)" }}>
    <div className="org-detail-wrapper" style={{ flex: 1, width: "100%" }}>
      <nav aria-label={copy.back} style={{ marginBottom: 28 }}><Link href="/organizations" prefetch={false} style={backStyle}><span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><AccountIcon name="arrow" /></span>{copy.back}</Link>{fixture.state === "success" && <span style={{ marginLeft: 12, color: "var(--text)", fontSize: 14, overflowWrap: "anywhere" }}> / &nbsp;{org.name}</span>}</nav>
      {fixture.state === "loading" ? <div className="stack" role="status" aria-label={copy.loadingOrganization} aria-busy="true"><Skeleton height={72} /><Skeleton height={320} /></div>
        : fixture.state !== "success" ? <section className="card stack" style={{ alignItems: "center", justifyItems: "center", padding: "64px 24px", textAlign: "center", background: "var(--surface-2)", borderRadius: 16 }}>
          <span style={{ color: "var(--danger)" }}><AccountIcon name="lock" size={32} /></span>
          <h1 style={{ fontSize: 24, margin: 0 }}>{fixture.state === "forbidden" ? copy.forbidden : copy.notFound}</h1>
          <p style={{ color: "var(--text-soft)", margin: 0, maxWidth: 480 }}>{fixture.state === "forbidden" ? copy.forbiddenDescription : copy.notFoundDescription}</p>
          <Link className="btn btn-primary" href="/organizations" prefetch={false}>{copy.back}</Link>
        </section> : <>
          <div className="org-detail-hero">
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><h1 style={{ margin: 0, fontSize: 32, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-.02em", overflowWrap: "anywhere" }}>{org.name}</h1><Badge tone={fixture.presentation === "owner" ? "warn" : fixture.presentation === "admin" ? "success" : "muted"}>{fixture.presentation === "owner" ? copy.owner : fixture.presentation === "admin" ? copy.admin : copy.noRole}</Badge></div>
              <p className="small" style={{ color: "var(--muted)", margin: "8px 0 0", overflowWrap: "anywhere" }}>{copy.slug} <code style={{ display: "inline", borderRadius: 5, background: "var(--surface-3)", color: "var(--text)", padding: "3px 8px", fontSize: 13 }}>{org.slug}</code></p>
            </div>
            <div className="org-detail-tabs" role="tablist" aria-label={copy.title}>
              {(["overview", "members"] as const).map((value) => <button key={value} type="button" role="tab" id={`org-detail-tab-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls="org-detail-panel" onKeyDown={navigateTabs} onClick={() => setTab(value)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 8, padding: "8px 16px", minHeight: 36, background: tab === value ? "var(--surface)" : "transparent", color: tab === value ? "var(--text)" : "var(--text-soft)", fontSize: 14, fontWeight: 500, boxShadow: tab === value ? "var(--neu)" : "none", whiteSpace: "nowrap" }}>
                <AccountIcon name={value === "members" ? "people" : "notice"} size={18} />{copy[value]}{value === "members" && fixture.presentation !== "member" && <span style={{ borderRadius: 9999, padding: "1px 8px", fontSize: 11, background: "var(--surface-3)" }}>{fixture.members.length}</span>}
              </button>)}
            </div>
          </div>
          <div id="org-detail-panel" role="tabpanel" aria-labelledby={`org-detail-tab-${tab}`}>
            {tab === "overview" ? <OrganizationOverview organization={org} presentation={fixture.presentation} onMembers={() => setTab("members")} /> : <>
              {fixture.receipt && receiptVisible && <InvitationReceipt receipt={fixture.receipt} onDismiss={() => setReceiptVisible(false)} onRevoke={() => setActiveDialog({ kind: "revoke", phase: "normal" })} />}
              <MembersTable orgId={orgId} members={fixture.members} state={fixture.membersState} presentation={fixture.presentation} onInvite={() => setActiveDialog({ kind: "invite", phase: "normal" })} onEdit={openEdit} />
            </>}
          </div>
          {activeDialog?.kind === "invite" && fixture.presentation === "owner" && <InviteMemberDialog phase={activeDialog.phase} onClose={closeDialog} />}
          {activeDialog?.kind === "roles" && fixture.presentation === "owner" && selected && selected.status === "ACTIVE" && supportsOrgEditor(selected, orgId) && <OrgRoleEditor member={selected} phase={activeDialog.phase} onClose={closeDialog} />}
          {activeDialog?.kind === "revoke" && fixture.receipt?.status === "PENDING" && <RevokeInvitationDialog receipt={fixture.receipt} phase={activeDialog.phase} onClose={closeDialog} />}
        </>}
    </div>
    <footer style={{ padding: "24px 28px", background: "var(--surface-2)", color: "var(--text-soft)", fontSize: 12, marginTop: 24 }}>© Lamu. Nền tảng quản trị tổ chức và trải nghiệm thành viên.</footer>
    <style jsx>{`
      .org-detail-wrapper { max-width: 1240px; margin: 0 auto; padding: 40px 28px; }
      .org-detail-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
      .org-detail-tabs { display: flex; padding: 4px; border-radius: 12px; background: var(--surface-3); flex-shrink: 0; }
      .org-detail-page :global(button:focus-visible), .org-detail-page :global(a:focus-visible), .org-detail-page :global(select:focus-visible), .org-detail-page :global(summary:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
      @media (max-width: 900px) { .org-detail-hero { flex-direction: column; align-items: flex-start; } }
      @media (max-width: 768px) { .org-detail-wrapper { padding: 24px 18px; } }
      @media (max-width: 360px) { .org-detail-tabs { width: 100%; } .org-detail-tabs button { flex: 1; padding-inline: 8px !important; } }
    `}</style>
  </div>;
}
