"use client";

import { useEffect } from "react";
import { Badge, Banner, Button, Skeleton } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import type { OrganizationInvitations } from "@/lib/identityApi";
import { DetailPagination, type DetailPageControls } from "./DetailPagination";
import { RoleAssignments } from "./RoleAssignments";
import {
  canRevokeInvitation, detailCopy as copy, formatInvitationDate, invitationStatusLabel,
  type InvitationReceiptData, type MembersState,
} from "./detailData";

type SentInvitation = OrganizationInvitations["items"][number];

export function receiptFromSent(row: SentInvitation): InvitationReceiptData {
  return {
    id: row.id,
    organization_id: row.organization_id,
    email: row.invitee_email,
    status: row.status,
    expiresLabel: formatInvitationDate(row.expires_at),
    expiresAt: row.expires_at,
    roles: row.roles,
  };
}

interface SentInvitationsPanelProps extends DetailPageControls {
  readonly items: readonly SentInvitation[];
  readonly state: MembersState;
  readonly message?: string;
  readonly disableActions: boolean;
  readonly onReload: () => void;
  readonly onInvite: () => void;
  readonly onRevoke: (receipt: InvitationReceiptData) => void;
}

export function SentInvitationsPanel({ items, state, message, disableActions, onInvite, onRevoke, onReload, ...pagination }: SentInvitationsPanelProps) {
  useEffect(() => {
    const now = Date.now();
    const deadline = Math.min(...items.filter((row) => canRevokeInvitation(row.status, row.expires_at, now)).map((row) => Date.parse(row.expires_at)));
    if (!Number.isFinite(deadline) || deadline - now >= 2_147_483_647) return;
    const timer = window.setTimeout(onReload, deadline - now);
    return () => window.clearTimeout(timer);
  }, [items, onReload]);

  return <section className="card" style={{ padding: 0, borderRadius: 16, background: "var(--surface)", boxShadow: "var(--neu)", minWidth: 0 }} aria-labelledby="org-detail-sent-heading">
    <div className="spread" style={{ padding: 24, gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      <h2 id="org-detail-sent-heading" style={{ fontSize: 24, margin: 0 }}>{copy.sent}</h2>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <Button onClick={onReload} disabled={state === "loading"}><AccountIcon name="reload" />{copy.reload}</Button>
        <Button variant="primary" onClick={onInvite} disabled={disableActions}><AccountIcon name="people" />{copy.invite}</Button>
      </div>
    </div>
    {state === "loading" && <div className="stack" style={{ padding: "0 24px 24px" }} role="status" aria-label="Đang tải lời mời đã gửi…" aria-busy="true"><Skeleton height={84} /><Skeleton height={84} /></div>}
    {state === "error" && <div style={{ padding: "0 24px 24px" }}><Banner kind="error">{message ?? "Không tải được danh sách lời mời."}</Banner></div>}
    {state === "empty" && <p className="muted" style={{ padding: "12px 24px", textAlign: "center" }}>Chưa có lời mời đã gửi.</p>}
    {state === "success" && items.map((row) =>
      <article key={row.id} className="org-detail-sent-row" aria-label={row.invitee_display_name} style={{ borderTop: "1px solid var(--border)", padding: 24 }}>
        <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <strong style={{ color: "var(--text)" }}>{row.invitee_display_name}</strong>
          <p className="small" style={{ color: "var(--text-soft)", margin: "4px 0 0" }}>{row.invitee_email}</p>
          <dl className="small" style={{ color: "var(--text-soft)", margin: "12px 0 0" }}>
            <div>{dateEntry("Ngày gửi", row.created_at)}</div>
            <div>{dateEntry(copy.expires, row.expires_at)}</div>
            <div>{dateEntry("Xử lý", row.processed_at)}</div>
          </dl>
        </div>
        <div className="stack" style={{ gap: 10, minWidth: 0 }}>
          <Badge tone={row.status === "PENDING" ? "warn" : row.status === "ACCEPTED" ? "success" : "muted"}>{invitationStatusLabel[row.status]}</Badge>
          <RoleAssignments assignments={row.roles} />
        </div>
        {canRevokeInvitation(row.status, row.expires_at) && <Button variant="danger" disabled={disableActions} onClick={() => onRevoke(receiptFromSent(row))}>{copy.revoke}</Button>}
      </article>
    )}
    {(state === "success" || state === "empty") && <DetailPagination {...pagination} id="org-detail-sent-page-size" unit="lời mời" />}
    <style jsx>{`
      .org-detail-sent-row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto; gap: 24px; align-items: start; }
      .org-detail-sent-row :global(dt), .org-detail-sent-row :global(dd) { display: inline; margin: 0 8px 0 0; }
      @media (max-width: 768px) { .org-detail-sent-row { grid-template-columns: minmax(0, 1fr); gap: 12px; } }
    `}</style>
  </section>;
}

function dateEntry(label: string, timestamp: string | null) {
  return <><dt className="muted">{label}</dt><dd>{timestamp ? <time dateTime={timestamp}>{formatInvitationDate(timestamp)}</time> : "—"}</dd></>;
}
