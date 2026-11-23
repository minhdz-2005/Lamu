"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { OrganizationDetailPage, type DetailTab } from "./OrganizationDetailPage";
import { OrganizationDetailLive } from "./OrganizationDetailLive";
import { MembersTable } from "./MembersTable";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { InvitationReceipt, RevokeInvitationDialog } from "./InvitationReceipt";
import { OrgRoleEditor } from "./OrgRoleEditor";
import { SentInvitationsPanel } from "./SentInvitationsPanel";
import { createDetailFixture, defaultDetailScenario, detailScenarioNames, dialogPreviewNames, supportsOrgEditor, type DetailDialogKind, type DetailDialogPhase, type DetailFixture, type OrganizationMember } from "./detailData";

interface DetailDialogPreview { readonly kind: DetailDialogKind; readonly phase: DetailDialogPhase; }

interface OrganizationDetailPreviewProps { readonly orgId: string; }

export function OrganizationDetailPreview({ orgId }: OrganizationDetailPreviewProps) {
  const params = useSearchParams();
  const raw = params.get("detailPreview");
  const dialogKey = params.get("detailDialog") ?? "";
  const previewAllowed = detailScenarioNames.find((key) => key === raw);
  const dialogAllowed = dialogPreviewNames.some((key) => key === dialogKey);
  if (process.env.NODE_ENV !== "development" || (!previewAllowed && !dialogAllowed)) return <OrganizationDetailLive orgId={orgId} />;
  const scenario = previewAllowed ?? defaultDetailScenario(orgId);
  const kind = dialogKey.startsWith("invite") ? "invite" : dialogKey.startsWith("revoke") ? "revoke" : "roles";
  const phase = dialogKey.includes("submitting") ? "submitting" : dialogKey === "last_owner" ? "last_owner" : dialogKey.includes("unknown") ? "unknown" : dialogKey === "invite_already_member" ? "recipient_error" : dialogKey.includes("error") ? "inline_error" : "normal";
  const dialog: DetailDialogPreview | undefined = dialogAllowed ? { kind, phase } : undefined;
  const fixture = createDetailFixture(orgId, dialog?.kind === "revoke" && scenario === "owner" ? "receipt_pending" : scenario);
  return <PreviewDetail key={`${orgId}:${scenario}:${dialogKey}`} orgId={orgId} fixture={fixture} initialDialog={dialog} />;
}

function PreviewDetail({ orgId, fixture, initialDialog }: { orgId: string; fixture: DetailFixture; initialDialog?: DetailDialogPreview }) {
  const [tab, setTab] = useState<DetailTab>(fixture.initialTab);
  const [activeDialog, setActiveDialog] = useState(initialDialog);
  const [selected, setSelected] = useState(initialDialog?.kind === "roles" ? fixture.members[initialDialog.phase === "last_owner" ? 0 : 1] : undefined);
  const [receiptVisible, setReceiptVisible] = useState(Boolean(fixture.receipt));
  const [page, setPage] = useState({ limit: 20, offset: 0 });
  const onPage = (offset: number, limit: number) => setPage({ limit, offset });
  const onClose = () => setActiveDialog(undefined);
  const onInvite = () => setActiveDialog({ kind: "invite", phase: "normal" });
  const onRevoke = () => setActiveDialog({ kind: "revoke", phase: "normal" });
  function onEdit(member: OrganizationMember) {
    if (fixture.presentation !== "owner" || member.status !== "ACTIVE" || !supportsOrgEditor(member, orgId)) return;
    setSelected(member);
    setActiveDialog({ kind: "roles", phase: "normal" });
  }
  const panel = <>
    {fixture.receipt && receiptVisible && <InvitationReceipt receipt={fixture.receipt} onDismiss={() => setReceiptVisible(false)} onRevoke={onRevoke} />}
    {tab === "sent"
      ? <SentInvitationsPanel items={[]} state="empty" limit={20} offset={0} total={0} onPage={() => {}} onReload={() => {}} disableActions={false} onInvite={onInvite} onRevoke={onRevoke} />
      : <MembersTable orgId={orgId} members={fixture.members.slice(page.offset, page.offset + page.limit)} state={fixture.membersState} presentation={fixture.presentation} onInvite={onInvite} onEdit={onEdit} {...page} total={fixture.members.length} onPage={onPage} />}
  </>;
  const dialog = fixture.presentation === "owner" && <>
    {activeDialog?.kind === "invite" && <InviteMemberDialog phase={activeDialog.phase} onClose={onClose} />}
    {activeDialog?.kind === "roles" && selected && <OrgRoleEditor member={selected} phase={activeDialog.phase} onClose={onClose} />}
    {activeDialog?.kind === "revoke" && fixture.receipt?.status === "PENDING" && <RevokeInvitationDialog receipt={fixture.receipt} phase={activeDialog.phase} onClose={onClose} />}
  </>;
  return <OrganizationDetailPage orgId={orgId} state={fixture.state} organization={fixture.organization} presentation={fixture.presentation} membersTotal={fixture.members.length} tab={tab} setTab={setTab} panel={panel} dialog={dialog} />;
}
