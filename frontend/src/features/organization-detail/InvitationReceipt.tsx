"use client";

import { Badge, Button } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { RoleAssignments } from "./RoleAssignments";
import { DetailDialog } from "./DetailDialog";
import { canRevokeInvitation, detailCopy as copy, invitationStatusLabel, type InvitationReceiptData, type DetailDialogPhase } from "./detailData";
import { DetailOperationStatus, type DetailOperationFeedback } from "./DetailOperationStatus";

interface InvitationReceiptProps {
  readonly receipt: InvitationReceiptData;
  readonly onDismiss: () => void;
  readonly onRevoke: () => void;
  readonly disableRevoke?: boolean;
}

export function InvitationReceipt({ receipt, onDismiss, onRevoke, disableRevoke }: InvitationReceiptProps) {
  return <section className="card org-detail-receipt" style={{ padding: 24, borderRadius: 16, background: "var(--surface)", borderLeft: "6px solid var(--secondary)", boxShadow: "var(--neu)", marginBottom: 24 }} aria-labelledby="org-detail-receipt-title">
    <div className="org-detail-receipt-main">
      <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, flexShrink: 0, borderRadius: 12, color: "var(--secondary)", background: "var(--secondary-soft)" }}><AccountIcon name="notice" size={22} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}><h2 id="org-detail-receipt-title" style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.4 }}>{copy.receiptTitle}</h2><Badge tone={receipt.status === "PENDING" ? "success" : "muted"}>{invitationStatusLabel[receipt.status]}</Badge></div>
        <p className="small" style={{ margin: 0, overflowWrap: "anywhere" }}>{copy.sentTo}: <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{receipt.email}</strong> · {copy.expires}: {receipt.expiresLabel}</p>
        <p className="small" style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}>{copy.proposed}: {receipt.roles.length ? receipt.roles.map((role, index) => <span key={`${role.code}:${role.resource_id}:${index}`} style={{ color: "var(--secondary)" }}>{index > 0 ? ", " : ""}{role.code} ({role.resource_type === "ORG" ? copy.orgScope : `${role.resource_type}: ${role.resource_id}`})</span>) : copy.noRole}</p>
        <p className="muted small" style={{ margin: "6px 0 0", fontSize: 11 }}>{copy.inAppNote}</p>
        <details style={{ marginTop: 10, fontSize: 12 }}><summary style={{ cursor: "pointer" }}>{copy.receiptDetails}</summary><p style={{ overflowWrap: "anywhere" }}>{copy.invitationId}: <code>{receipt.id}</code></p><RoleAssignments assignments={receipt.roles} /></details>
      </div>
    </div>
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignSelf: "center" }}>
      {receipt.status === "PENDING" && (!receipt.expiresAt || canRevokeInvitation(receipt.status, receipt.expiresAt)) && <Button disabled={disableRevoke} onClick={onRevoke} style={{ color: "var(--danger)", background: "transparent", border: 0, borderRadius: 8, boxShadow: "none", fontSize: 14, whiteSpace: "nowrap" }}>{copy.revoke}</Button>}
      <Button onClick={onDismiss} aria-label={copy.dismissReceipt} style={{ width: 32, minHeight: 32, height: 32, padding: 0, background: "transparent", color: "var(--muted)", border: 0, boxShadow: "none", fontSize: 24 }}>×</Button>
    </div>
    <style jsx>{`
      .org-detail-receipt { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .org-detail-receipt-main { display: flex; gap: 16px; min-width: 0; }
      @media (max-width: 768px) { .org-detail-receipt { flex-direction: column; align-items: stretch; } }
    `}</style>
  </section>;
}

interface RevokeInvitationDialogProps extends DetailOperationFeedback {
  readonly receipt: InvitationReceiptData;
  readonly organizationName?: string;
  readonly phase?: DetailDialogPhase;
  readonly onClose: () => void;
  readonly onSubmit?: () => void;
}

export function RevokeInvitationDialog({ receipt, organizationName, phase = "normal", busy, unknown = phase === "unknown", error, onClose, onRetry, onSubmit }: RevokeInvitationDialogProps) {
  return <DetailDialog title={copy.revokeTitle} description={copy.revokeDescription} submitLabel={copy.revoke} danger pending={busy || phase === "submitting"} disableSubmit={unknown} onClose={onClose} onSubmit={onSubmit}>
    <DetailOperationStatus unknown={unknown} error={error} onRetry={onRetry} />
    <p style={{ margin: 0, padding: 12, borderRadius: 8, background: "var(--bg-tint)", color: "var(--text-soft)", fontSize: 12, overflowWrap: "anywhere" }}>{copy.invitationId}: <code>{receipt.id}</code></p>
    <p className="small" style={{ margin: 0, overflowWrap: "anywhere" }}>{copy.sentTo}: {receipt.email}</p>
    {organizationName && <p className="small" style={{ margin: 0, overflowWrap: "anywhere" }}>{copy.orgScope}: {organizationName}</p>}
  </DetailDialog>;
}
