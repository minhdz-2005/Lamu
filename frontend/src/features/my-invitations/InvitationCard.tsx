"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Banner, Button, cx } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { InvitationStatusBadge } from "./InvitationStatusBadge";
import { InvitationRoles } from "./InvitationRoles";
import { formatInvitationTime, inboxCopy as copy, type InboxInvitation, type InvitationAction } from "./invitationsData";
import { canRespondToInvitation } from "./inboxPolicy";

interface InvitationCardProps {
  readonly invitation: InboxInvitation;
  readonly locked?: boolean;
  readonly unknown?: boolean;
  readonly onAction: (invitation: InboxInvitation, action: InvitationAction) => void;
  readonly onCheck?: () => void;
  readonly unknownMessage?: string;
}

const cardStyle: CSSProperties = { borderRadius: 16, background: "var(--surface)", boxShadow: "var(--neu)", minWidth: 0 };
const buttonStyle: CSSProperties = { borderRadius: 9999, minHeight: 44, fontSize: 14, fontWeight: 500, padding: "9px 16px", whiteSpace: "nowrap" };

export function InvitationCard({ invitation: item, locked = false, unknown = false, onAction, onCheck, unknownMessage }: InvitationCardProps) {
  const pending = item.status === "PENDING";
  const scopeBlocked = pending && !canRespondToInvitation(item, "accept");
  const detailsId = `inbox-details-${item.id}`;
  return <article className={cx("card", "inbox-card")} style={cardStyle} aria-labelledby={`inbox-title-${item.id}`} aria-busy={locked || undefined} data-status={item.status}>
    <div className="inbox-card-main">
      <div className="inbox-card-content">
        <span className="inbox-mark" aria-hidden="true" style={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 12, background: pending ? "var(--accent-soft)" : "var(--surface-2)", color: pending ? "var(--identity-warm-text)" : "var(--text-soft)", fontSize: 17, fontWeight: 600, flexShrink: 0 }}>{item.mark}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
            <h2 id={`inbox-title-${item.id}`} style={{ margin: 0, color: "var(--text)", fontSize: 20, fontWeight: 600, lineHeight: 1.4, letterSpacing: "-.01em", overflowWrap: "anywhere" }}>{item.organization_name}</h2>
            <span className="muted small" style={{ overflowWrap: "anywhere" }}>{item.organization_slug}</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted small" style={{ fontSize: 12, fontStyle: pending ? undefined : "italic" }}>{pending ? copy.invitedRoles : copy.historicalRoles}</span>
            <InvitationRoles roles={item.roles} />
          </div>
          <p className="small" style={{ color: "var(--text-soft)", fontSize: 12, margin: "8px 0 0", lineHeight: 1.6 }}>{copy.invitedAt}: <time dateTime={item.created_at}>{formatInvitationTime(item.created_at)}</time> · {copy.expiresAt}: <time dateTime={item.expires_at}>{formatInvitationTime(item.expires_at)}</time>{item.processed_at !== null && <> · {copy.processedAt}: <time dateTime={item.processed_at}>{formatInvitationTime(item.processed_at)}</time></>}</p>
          {scopeBlocked && <p id={`inbox-event-${item.id}`} style={{ background: "var(--accent-soft)", color: "var(--warn)", borderRadius: 5, padding: "7px 10px", fontSize: 13, margin: "8px 0 0" }}>{copy.eventBlocked}</p>}
          {(item.status === "REVOKED" || item.status === "EXPIRED") && <p className="small" style={{ color: item.status === "REVOKED" ? "var(--danger)" : "var(--muted)", margin: "8px 0 0" }}>{item.status === "REVOKED" ? copy.revokedHint : copy.expiredHint}</p>}
        </div>
      </div>
      <div className="inbox-card-actions">
        <InvitationStatusBadge status={item.status} />
        {pending ? <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button style={{ ...buttonStyle, background: "var(--surface-2)", color: "var(--text)", borderColor: "transparent", boxShadow: "none" }} onClick={() => onAction(item, "decline")} disabled={locked}>{copy.decline}</Button>
          <Button variant="primary" style={buttonStyle} onClick={() => onAction(item, "accept")} disabled={locked || scopeBlocked} aria-describedby={scopeBlocked ? `inbox-event-${item.id}` : undefined}>{copy.accept}</Button>
        </div> : item.status === "ACCEPTED" ? <Link className="btn" href={`/organizations/${encodeURIComponent(item.organization_id)}`} prefetch={false} style={{ ...buttonStyle, background: "var(--surface-2)", borderColor: "transparent", boxShadow: "none" }}>{copy.open}<AccountIcon name="external" size={14} /></Link> : item.status === "DECLINED" ? <span className="muted small" style={{ fontStyle: "italic" }}>{copy.terminal}</span> : null}
      </div>
    </div>
    {unknown && <div style={{ marginTop: 16 }}><Banner kind="warn">{unknownMessage ?? copy.unknown}<div style={{ marginTop: 8 }}><Button size="sm" onClick={onCheck} disabled={!onCheck}>{copy.check}</Button></div></Banner></div>}
    <div className="inbox-card-footer">
      <details id={detailsId} style={{ flex: "1 1 280px", minWidth: 0, fontSize: 13 }}>
        <summary style={{ cursor: "pointer", color: "var(--text-soft)" }}>{copy.details}</summary>
        <dl className="inbox-details" style={{ margin: "14px 0 0" }}>
          <div><dt>{copy.invitationId}</dt><dd><code>{item.id}</code></dd></div>
          <div><dt>{copy.organizationId}</dt><dd><code>{item.organization_id}</code></dd></div>
          <div><dt>{copy.inviterId}</dt><dd><code>{item.inviter_user_id}</code></dd></div>
          <div><dt>{copy.processedAt}</dt><dd>{formatInvitationTime(item.processed_at)}</dd></div>
          <div><dt>{pending ? copy.invitedRoles : copy.historicalRoles}</dt><dd><InvitationRoles roles={item.roles} expanded /></dd></div>
        </dl>
      </details>
    </div>
    <style jsx>{`
      .inbox-card { padding: clamp(16px, 3vw, 24px); }
      .inbox-card[data-status="PENDING"] { border-inline-start: 3px solid var(--accent); }
      .inbox-card[data-status="PENDING"] .inbox-card-actions :global(.badge) { color: var(--identity-warm-text); background: var(--accent-soft); }
      .inbox-card-footer summary { min-height: 44px; align-content: center; width: fit-content; }
      .inbox-card-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
      .inbox-card-content { display: flex; align-items: flex-start; gap: 16px; min-width: 0; flex: 1; }
      .inbox-card-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex-shrink: 0; }
      .inbox-card-footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
      .inbox-details { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
      .inbox-details dt { color: var(--muted); font-size: 11px; margin-bottom: 3px; }
      .inbox-details dd { margin: 0; font-size: 12px; color: var(--text-soft); overflow-wrap: anywhere; }
      .inbox-card :global(button:focus-visible), .inbox-card :global(a:focus-visible), .inbox-card summary:focus-visible { outline: 2px solid var(--secondary); outline-offset: 3px; }
      @media (max-width: 640px) {
        .inbox-card-main { flex-direction: column; align-items: stretch; gap: 14px; }
        .inbox-card-content { gap: 12px; }
        .inbox-card-actions { align-items: flex-start; }
      }
    `}</style>
  </article>;
}
