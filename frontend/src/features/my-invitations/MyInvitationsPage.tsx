"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner, Button, Skeleton } from "@/components/ui";
import { InvitationCard } from "./InvitationCard";
import { InvitationActionDialog } from "./InvitationActionDialog";
import { InvitationPagination } from "./InvitationPagination";
import { createInboxFixture, inboxCopy as copy, type InboxFixture, type InboxInvitation, type InvitationAction, type InvitationActionPhase } from "./invitationsData";

interface MyInvitationsPageProps { readonly fixture?: InboxFixture; }
interface Selection { readonly invitation: InboxInvitation; readonly action: InvitationAction; readonly phase: InvitationActionPhase; }

export function MyInvitationsPage({ fixture = createInboxFixture() }: MyInvitationsPageProps) {
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(() => {
    const preview = fixture.actionPreview;
    const invitation = fixture.invitations.find((item) => item.id === preview?.invitationId && item.status === "PENDING");
    if (!preview || !invitation || (preview.action === "accept" && invitation.roles.some((role) => role.resource_type === "EVENT"))) return null;
    return { invitation, action: preview.action, phase: preview.phase };
  });
  const visible = fixture.invitations.slice(page * limit, (page + 1) * limit);
  const failed = fixture.state === "error";
  const loading = fixture.state === "loading";
  const firstAccepted = fixture.invitations.find((item) => item.status === "ACCEPTED");

  function openAction(invitation: InboxInvitation, action: InvitationAction) {
    if (invitation.status !== "PENDING" || (action === "accept" && invitation.roles.some((role) => role.resource_type === "EVENT"))) return;
    setSelection({ invitation, action, phase: "normal" });
  }

  return <div className="inbox-page" style={{ minHeight: "calc(100svh - 72px)", background: "var(--bg-tint)", color: "var(--text)", fontFamily: "var(--font-sans)" }}>
    <div className="inbox-container">
      <div className="row small" style={{ gap: 8, color: "var(--text-soft)", marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/me" prefetch={false} style={{ color: "var(--secondary)", background: "var(--secondary-soft)", borderRadius: 99, padding: "5px 12px", textDecoration: "none", fontSize: 12 }}>{copy.account}</Link>
        <span aria-hidden="true">/</span><span style={{ fontSize: 12 }}>{copy.context}</span>
      </div>
      <header className="spread inbox-heading" style={{ gap: 20, marginBottom: 32 }}>
        <div style={{ minWidth: 0 }}><h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1.25, margin: "0 0 10px" }}>{copy.title}</h1><p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--text-soft)" }}>{copy.description}</p></div>
        <Button aria-disabled="true" disabled={loading} style={{ flexShrink: 0, background: "var(--surface)", borderRadius: 8, padding: "10px 16px", boxShadow: "none", minHeight: 42 }}><span aria-hidden="true">↻</span>{copy.reload}</Button>
      </header>
      <div className="stack" style={{ gap: 16 }}>
        {fixture.state === "rate_limit" && <Banner kind="warn">{copy.rateLimit}</Banner>}
        {fixture.state === "profile_refresh_error" && <Banner kind="warn"><p style={{ margin: "0 0 12px" }}>{copy.profileWarning}</p><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{firstAccepted && <Link className="btn" href={`/organizations/${encodeURIComponent(firstAccepted.organization_id)}`} prefetch={false}>{copy.open}</Link>}<Button aria-disabled="true">{copy.reloadProfile}</Button></div></Banner>}
        {loading ? <section className="stack" role="status" aria-label={copy.loading} style={{ gap: 16 }}>{[0, 1, 2].map((index) => <div className="card stack" key={index} style={{ padding: 24, borderRadius: 16, background: "var(--surface)", gap: 16 }}><div style={{ width: "60%" }}><Skeleton height={24} /></div><div style={{ width: "85%" }}><Skeleton height={16} /></div><div style={{ width: "40%" }}><Skeleton height={16} /></div></div>)}<span className="muted small">{copy.loading}</span></section>
          : failed ? <section className="card stack" style={{ padding: 24, borderRadius: 16, background: "var(--surface)", gap: 16 }}><Banner kind="error">{copy.error}</Banner><div><Button aria-disabled="true">{copy.reload}</Button></div><details style={{ fontSize: 12, color: "var(--muted)" }}><summary style={{ cursor: "pointer" }}>{copy.errorDetails}</summary><p style={{ overflowWrap: "anywhere" }}>Mã tham chiếu: <code>{fixture.requestId}</code></p></details></section>
          : fixture.invitations.length === 0 ? <section className="card stack" style={{ padding: "64px 24px", alignItems: "center", textAlign: "center", background: "var(--surface)", borderRadius: 16, gap: 16 }}>
            <span aria-hidden="true" style={{ width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: 20, background: "var(--surface-2)", fontSize: 28 }}>✉</span>
            <h2 style={{ fontSize: 22, margin: 0 }}>{copy.empty}</h2><p className="muted" style={{ margin: 0 }}>{copy.emptyDescription}</p><Link className="btn btn-primary" href="/organizations" prefetch={false}>{copy.organizations}</Link>
          </section>
          : <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 16 }}>{visible.map((invitation) => {
            const phase = fixture.actionPreview?.invitationId === invitation.id ? fixture.actionPreview.phase : undefined;
            return <li key={invitation.id} style={{ minWidth: 0 }}><InvitationCard invitation={invitation} locked={phase === "submitting" || phase === "unknown"} unknown={phase === "unknown"} onAction={openAction} /></li>;
          })}</ul>}
        {!loading && !failed && <InvitationPagination total={fixture.invitations.length} limit={limit} page={page} onLimit={(value) => { setLimit(value); setPage(0); }} onPage={setPage} />}
      </div>
    </div>
    {selection && <InvitationActionDialog invitation={selection.invitation} action={selection.action} phase={selection.phase} onClose={() => setSelection(null)} />}
    <style jsx>{`
      .inbox-container { max-width: 1240px; margin: 0 auto; padding: 40px 28px 72px; }
      .inbox-page :global(a:focus-visible), .inbox-page :global(button:focus-visible), .inbox-page summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
      @media (max-width: 600px) { .inbox-container { padding: 28px 18px 48px; } .inbox-heading { flex-direction: column; align-items: flex-start; } }
    `}</style>
  </div>;
}
