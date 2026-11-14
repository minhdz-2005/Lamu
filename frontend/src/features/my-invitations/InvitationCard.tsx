"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Banner, Button, cx } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { InvitationStatusBadge } from "./InvitationStatusBadge";
import { InvitationRoles } from "./InvitationRoles";
import { formatInvitationTime, inboxCopy as copy, type InboxInvitation, type InvitationAction } from "./invitationsData";

interface InvitationCardProps {
  readonly invitation: InboxInvitation;
  readonly locked?: boolean;
  readonly unknown?: boolean;
  readonly onAction: (invitation: InboxInvitation, action: InvitationAction) => void;
}

const cardStyle: CSSProperties = { borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--neu)", minWidth: 0 };
const buttonStyle: CSSProperties = { borderRadius: 8, minHeight: 38, fontSize: 14, fontWeight: 500, padding: "9px 16px", whiteSpace: "nowrap" };

export function InvitationCard({ invitation: item, locked = false, unknown = false, onAction }: InvitationCardProps) {
  const eventScoped = item.roles.some((role) => role.resource_type === "EVENT");
  const pending = item.status === "PENDING";
  const detailsId = `inbox-details-${item.id}`;
  return <article className={cx("card", "inbox-card")} style={cardStyle} aria-labelledby={`inbox-title-${item.id}`} aria-busy={locked || undefined} data-status={item.status}>
    <div className="inbox-card-main">
      <div className="inbox-card-content">
        <span className="inbox-mark" aria-hidden="true" style={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 12, background: item.status === "ACCEPTED" ? "var(--secondary-soft)" : "var(--surface-2)", color: item.status === "ACCEPTED" ? "var(--secondary)" : "var(--text)", fontSize: 17, fontWeight: 600, flexShrink: 0 }}>{item.mark}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
            <h2 id={`inbox-title-${item.id}`} style={{ margin: 0, color: "var(--text)", fontSize: 20, fontWeight: 600, lineHeight: 1.4, letterSpacing: "-.01em", overflowWrap: "anywhere" }}>{item.organization_name}</h2>
            <code style={{ fontSize: 12, fontFamily: "var(--font-sans)", background: "var(--surface-2)", borderRadius: 4, padding: "2px 8px", color: "var(--text-soft)", overflowWrap: "anywhere", maxWidth: "100%" }}>{item.organization_slug}</code>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted small" style={{ fontSize: 12, fontStyle: pending ? undefined : "italic" }}>{pending ? copy.invitedRoles : copy.historicalRoles}</span>
            <InvitationRoles roles={item.roles} />
          </div>
          <p className="small" style={{ color: "var(--text-soft)", fontSize: 12, margin: "8px 0 0", lineHeight: 1.6 }}>{copy.invitedAt}: <time dateTime={item.created_at}>{formatInvitationTime(item.created_at)}</time> · {copy.expiresAt}: <time dateTime={item.expires_at}>{formatInvitationTime(item.expires_at)}</time>{item.processed_at !== null && <> · {copy.processedAt}: <time dateTime={item.processed_at}>{formatInvitationTime(item.processed_at)}</time></>}</p>
          {pending && eventScoped && <p id={`inbox-event-${item.id}`} style={{ background: "var(--accent-soft)", color: "var(--warn)", borderRadius: 5, padding: "7px 10px", fontSize: 13, margin: "8px 0 0" }}>{copy.eventBlocked}</p>}
          {(item.status === "REVOKED" || item.status === "EXPIRED") && <p className="small" style={{ color: item.status === "REVOKED" ? "var(--danger)" : "var(--muted)", margin: "8px 0 0" }}>{item.status === "REVOKED" ? copy.revokedHint : copy.expiredHint}</p>}
        </div>
      </div>
      <div className="inbox-card-actions">
        <InvitationStatusBadge status={item.status} />
        {pending ? <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button style={{ ...buttonStyle, background: "var(--surface-2)", color: "var(--text)", borderColor: "transparent", boxShadow: "none" }} onClick={() => onAction(item, "decline")} disabled={locked}>{copy.decline}</Button>
          <Button variant="primary" style={buttonStyle} onClick={() => onAction(item, "accept")} disabled={locked || eventScoped} aria-describedby={eventScoped ? `inbox-event-${item.id}` : undefined}>{copy.accept}</Button>
        </div> : item.status === "ACCEPTED" ? <Link className="btn" href={`/organizations/${encodeURIComponent(item.organization_id)}`} prefetch={false} style={{ ...buttonStyle, background: "var(--surface-2)", borderColor: "transparent", boxShadow: "none" }}>{copy.open}<AccountIcon name="external" size={14} /></Link> : item.status === "DECLINED" ? <span className="muted small" style={{ fontStyle: "italic" }}>{copy.terminal}</span> : null}
      </div>
    </div>
    {unknown && <div style={{ marginTop: 16 }}><Banner kind="warn">{copy.unknown}<div style={{ marginTop: 8 }}><Button size="sm" aria-disabled="true">{copy.check}</Button></div></Banner></div>}
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
      <code className="muted" style={{ fontSize: 11, overflowWrap: "anywhere", maxWidth: "100%" }}>ID: {item.id}</code>
    </div>
    <style jsx>{`
      .inbox-card { padding: 24px; }
      .inbox-card-main { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
      .inbox-card-content { display: flex; align-items: flex-start; gap: 16px; min-width: 0; flex: 1; }
      .inbox-card-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; max-width: 38%; }
      .inbox-card-footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
      .inbox-details { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
      .inbox-details dt { color: var(--muted); font-size: 11px; margin-bottom: 3px; }
      .inbox-details dd { margin: 0; font-size: 12px; color: var(--text-soft); overflow-wrap: anywhere; }
      .inbox-card :global(button:focus-visible), .inbox-card :global(a:focus-visible), .inbox-card summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
      @media (max-width: 900px) { .inbox-card-main { flex-direction: column; align-items: stretch; } .inbox-card-actions { max-width: none; justify-content: flex-start; } }
      @media (max-width: 480px) { .inbox-card { padding: 20px; } .inbox-card-content { flex-direction: column; gap: 12px; } .inbox-card-actions { align-items: flex-start; flex-direction: column; } }
    `}</style>
  </article>;
}
