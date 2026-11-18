"use client";

import "@/features/account/identity.css";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Banner, Button, Skeleton } from "@/components/ui";
import { InvitationCard } from "./InvitationCard";
import { InvitationActionDialog } from "./InvitationActionDialog";
import { InvitationPagination } from "./InvitationPagination";
import { inboxCopy as copy, type InboxFixture, type InboxInvitation, type InvitationAction, type InvitationActionPhase } from "./invitationsData";
import { canRespondToInvitation } from "./inboxPolicy";

export interface InboxSelection { readonly invitation: InboxInvitation; readonly action: InvitationAction; readonly phase: InvitationActionPhase; }
interface MyInvitationsPageProps {
  readonly fixture: InboxFixture;
  readonly onReload?: () => void;
  readonly live?: {
    page: number; limit: number; total: number;
    onPage: (page: number) => void;
    onLimit: (limit: number) => void;
    onReloadProfile?: () => void;
    selection: InboxSelection | null;
    onAction: (invitation: InboxInvitation, action: InvitationAction) => void;
    onClose: () => void;
    onSubmit?: () => void;
    temporarilyLocked: boolean;
    pendingInvitation?: string;
    onCheck?: () => void;
    actionFeedback?: string;
    receipt?: { id: string; organizationId: string; status: "ACCEPTED" | "DECLINED"; profileFailed: boolean };
  };
}

export function MyInvitationsPage({ fixture, live, onReload }: MyInvitationsPageProps) {
  const [previewLimit, setLimit] = useState(20);
  const [previewPage, setPage] = useState(0);
  const [previewSelection, setSelection] = useState<InboxSelection | null>(() => {
    const preview = fixture.actionPreview;
    const invitation = fixture.invitations.find((item) => item.id === preview?.invitationId);
    if (!preview || !invitation || !canRespondToInvitation(invitation, preview.action)) return null;
    return { invitation, action: preview.action, phase: preview.phase };
  });
  const page = live?.page ?? previewPage;
  const limit = live?.limit ?? previewLimit;
  const selection = live ? live.selection : previewSelection;
  const visible = live ? fixture.invitations : fixture.invitations.slice(page * limit, (page + 1) * limit);
  const failed = fixture.state === "error";
  const loading = fixture.state === "loading";
  const firstAccepted = fixture.invitations.find((item) => item.status === "ACCEPTED");
  const receiptElement = useRef<HTMLDivElement>(null);
  const receiptId = live?.receipt?.id;
  useEffect(() => {
    if (receiptId) receiptElement.current?.focus();
  }, [receiptId]);

  function openAction(invitation: InboxInvitation, action: InvitationAction) {
    if (live) return live.onAction(invitation, action);
    if (!canRespondToInvitation(invitation, action)) return;
    setSelection({ invitation, action, phase: "normal" });
  }

  return <div className="inbox-page identity-page" style={{ minHeight: "calc(100svh - 72px)", background: "var(--bg-tint)", color: "var(--text)", fontFamily: "var(--font-sans)" }}>
    <div className="identity-wrap">
      <nav className="identity-context" aria-label={copy.context}>
        <Link href="/me" prefetch={false}><span aria-hidden="true">←</span> {copy.account}</Link>
      </nav>
      <header className="identity-heading identity-heading-actions">
        <h1>Lời mời <em>của tôi</em></h1>
        <Button onClick={onReload} disabled={loading || !onReload}><span aria-hidden="true">↻</span>{copy.reload}</Button>
      </header>
      <div className="stack" style={{ gap: 16 }}>
        {fixture.state === "rate_limit" && <Banner kind="warn">{fixture.message ?? copy.rateLimit}</Banner>}
        {live?.pendingInvitation && !visible.some((item) => item.id === live.pendingInvitation) && <Banner kind="warn">
          {live.actionFeedback ?? copy.unknown}
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={live.onCheck} disabled={!live.onCheck}>{copy.check}</Button></div>
        </Banner>}
        {fixture.state === "profile_refresh_error" && <Banner kind="warn"><p style={{ margin: "0 0 12px" }}>{copy.profileWarning}</p><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{firstAccepted && <Link className="btn" href={`/organizations/${encodeURIComponent(firstAccepted.organization_id)}`} prefetch={false}>{copy.open}</Link>}<Button disabled>{copy.reloadProfile}</Button></div></Banner>}
        {live?.receipt && <div ref={receiptElement} tabIndex={-1}><Banner kind={live.receipt.profileFailed ? "warn" : "ok"}>
          <p style={{ margin: 0 }}>{live.receipt.profileFailed ? copy.profileWarning : live.receipt.status === "ACCEPTED" ? copy.accepted : copy.declined}</p>
          {live.receipt.status === "ACCEPTED" && <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <Link className="btn" href={`/organizations/${encodeURIComponent(live.receipt.organizationId)}`} prefetch={false}>{copy.open}</Link>
            {live.receipt.profileFailed && <Button onClick={live.onReloadProfile} disabled={!live.onReloadProfile}>{copy.reloadProfile}</Button>}
          </div>}
        </Banner></div>}
        {loading ? <section className="stack" role="status" aria-label={copy.loading} style={{ gap: 16 }}>{[0, 1, 2].map((index) => <div className="card stack" key={index} style={{ padding: 24, borderRadius: 16, background: "var(--surface)", gap: 16 }}><div style={{ width: "60%" }}><Skeleton height={24} /></div><div style={{ width: "85%" }}><Skeleton height={16} /></div><div style={{ width: "40%" }}><Skeleton height={16} /></div></div>)}<span className="muted small">{copy.loading}</span></section>
          : failed ? <section className="card stack" style={{ padding: 24, borderRadius: 16, background: "var(--surface)", gap: 16 }}>
            <Banner kind="error">{fixture.message ?? copy.error}</Banner>
            {fixture.blocked ? <div><Link className="btn" href="/auth?next=/me/invitations" prefetch={false}>Đăng nhập</Link></div> : <div><Button onClick={onReload} disabled={!onReload}>{copy.reload}</Button></div>}
          </section>
          : fixture.invitations.length === 0 ? <section className="card stack" style={{ padding: "64px 24px", alignItems: "center", textAlign: "center", background: "var(--surface)", borderRadius: 16, gap: 16 }}>
            <span aria-hidden="true" style={{ width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: 20, background: "var(--surface-2)", fontSize: 28 }}>✉</span>
            <h2 style={{ fontSize: 22, margin: 0 }}>{copy.empty}</h2><p className="muted" style={{ margin: 0 }}>{copy.emptyDescription}</p><Link className="btn btn-primary" href="/organizations" prefetch={false}>{copy.organizations}</Link>
          </section>
          : <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>{visible.map((invitation) => {
            const phase = fixture.actionPreview?.invitationId === invitation.id ? fixture.actionPreview.phase : undefined;
            const unknown = phase === "unknown" || live?.pendingInvitation === invitation.id;
            return <li key={invitation.id} style={{ minWidth: 0 }}><InvitationCard invitation={invitation} locked={Boolean(live?.temporarilyLocked || phase === "submitting" || unknown)} unknown={unknown} onCheck={live?.onCheck} onAction={openAction} unknownMessage={live?.actionFeedback} /></li>;
          })}</ul>}
        {!loading && !failed && <InvitationPagination total={live?.total ?? fixture.invitations.length} limit={limit} page={page} onLimit={live?.onLimit ?? ((value) => { setLimit(value); setPage(0); })} onPage={live?.onPage ?? setPage} />}
      </div>
    </div>
    {selection && <InvitationActionDialog invitation={selection.invitation} action={selection.action} phase={selection.phase} onClose={live?.onClose ?? (() => setSelection(null))} onSubmit={live?.onSubmit} feedback={live?.actionFeedback} />}
  </div>;
}
