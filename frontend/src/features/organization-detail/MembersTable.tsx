"use client";

import { useState, type CSSProperties } from "react";
import { Badge, Banner, Button, Skeleton } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { RoleAssignments } from "./RoleAssignments";
import { detailCopy as copy, pageSizes, supportsOrgEditor, type OrganizationMember, type MembersState, type DetailPresentation } from "./detailData";

interface MembersTableProps {
  readonly orgId: string;
  readonly members: readonly OrganizationMember[];
  readonly state: MembersState;
  readonly presentation: DetailPresentation;
  readonly onInvite: () => void;
  readonly onEdit: (member: OrganizationMember) => void;
}

const actionStyle: CSSProperties = { border: 0, borderRadius: 8, boxShadow: "none", background: "transparent", padding: "8px 12px", minHeight: 36, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" };
const headerStyle: CSSProperties = { padding: 24, gap: 16, flexWrap: "wrap", alignItems: "center" };

export function MembersTable({ orgId, members, state, presentation, onInvite, onEdit }: MembersTableProps) {
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);
  if (presentation === "member") return <Banner kind="warn">{copy.noMembersAccess}</Banner>;
  const total = members.length;
  const visible = members.slice(page * limit, (page + 1) * limit);
  return <section className="card org-detail-members" style={{ padding: 0, borderRadius: 16, background: "var(--surface)", boxShadow: "var(--neu)", minWidth: 0, overflow: "hidden" }} aria-labelledby="org-detail-members-heading">
    <div className="spread" style={headerStyle}>
      <h2 id="org-detail-members-heading" style={{ margin: 0, fontSize: 24, fontWeight: 600, lineHeight: 1.35 }}>{copy.list} <span className="small" style={{ display: "inline-block", padding: "2px 10px", background: "var(--surface-2)", color: "var(--text-soft)", borderRadius: 9999, verticalAlign: "middle" }}>{total}</span></h2>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <Button aria-disabled="true" style={actionStyle}><AccountIcon name="reload" />{copy.reload}</Button>
        {presentation === "owner" && <Button variant="primary" onClick={onInvite} style={{ borderRadius: 8, fontSize: 14, minHeight: 40, padding: "10px 16px" }}><AccountIcon name="people" />{copy.invite}</Button>}
      </div>
    </div>
    {state === "loading" ? <div className="stack" style={{ padding: 24, gap: 16 }} role="status" aria-label={copy.loadingMembers} aria-busy="true">{[0, 1, 2].map((key) => <Skeleton key={key} height={64} />)}</div>
      : state === "error" ? <div style={{ padding: "0 24px 24px" }}><Banner kind="error">{copy.membersError}</Banner></div>
      : !total ? <p className="muted" style={{ margin: 0, padding: "32px 24px", textAlign: "center" }}>{copy.noMembers}</p>
      : <table className="org-detail-members-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", textAlign: "left", margin: 0 }}>
        <thead><tr><th scope="col" style={{ width: "28%" }}>{copy.members}</th><th scope="col" style={{ width: "18%" }}>{copy.status}</th><th scope="col" style={{ width: "36%" }}>{copy.assignments}</th><th scope="col" style={{ width: "18%", textAlign: "right" }}>{copy.action}</th></tr></thead>
        <tbody>{visible.map((member) => {
          const supported = supportsOrgEditor(member, orgId);
          return <tr key={member.user_id} className="org-detail-member-row">
            <td><div className="row" style={{ gap: 6, flexWrap: "wrap" }}><strong style={{ fontWeight: 600, overflowWrap: "anywhere", color: member.status === "INACTIVE" ? "var(--muted)" : undefined }}>{member.display_name}</strong>{member.is_current_user && <Badge tone="success">{copy.you}</Badge>}</div></td>
            <td><span className="org-detail-mobile-label muted small">{copy.status}</span><Badge tone={member.status === "ACTIVE" ? "success" : "muted"}>{member.status === "ACTIVE" ? copy.active : copy.inactive}</Badge></td>
            <td><span className="org-detail-mobile-label muted small">{copy.assignments}</span><RoleAssignments assignments={member.roles} />{!supported && <p className="small" style={{ color: "var(--warn)", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>{copy.unsupported}</p>}</td>
            <td className="org-detail-member-action">{presentation === "owner" && member.status === "ACTIVE" ? <Button onClick={() => onEdit(member)} disabled={!supported} aria-describedby={!supported ? `unsupported-${member.user_id}` : undefined} style={{ ...actionStyle, background: !supported ? "var(--surface-2)" : undefined }}>{copy.changeRole}</Button> : <span className="muted small">{copy.viewOnly}</span>}
              {!supported && <span id={`unsupported-${member.user_id}`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>{copy.unsupported}</span>}
            </td>
          </tr>;
        })}</tbody>
      </table>}
    {(state === "success" || state === "empty") && <div className="spread" style={{ padding: 24, gap: 16, flexWrap: "wrap" }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-soft)" }} aria-live="polite">{copy.show} <strong>{total ? page * limit + 1 : 0}–{Math.min((page + 1) * limit, total)}</strong> {copy.of} <strong>{total}</strong> {copy.memberUnit}</p>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <label className="row muted small" style={{ gap: 8, margin: 0 }} htmlFor="org-detail-page-size">{copy.pageSize}
          <select id="org-detail-page-size" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} style={{ width: "auto", minHeight: 36, padding: "6px 32px 6px 10px", borderRadius: 8, backgroundColor: "var(--surface-2)", fontSize: 14 }}>{pageSizes.map((size) => <option key={size} value={size}>{size} {copy.perPage}</option>)}</select>
        </label>
        <Button size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)} style={{ borderRadius: 8 }}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><AccountIcon name="chevron" size={14} /></span>{copy.previous}</Button>
        <Button size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage((value) => value + 1)} style={{ borderRadius: 8 }}>{copy.next}<AccountIcon name="chevron" size={14} /></Button>
      </div>
    </div>}
    <style jsx>{`
      .org-detail-members-table th { padding: 12px 24px; background: var(--bg-tint); color: var(--text-soft); font-size: 12px; font-weight: 500; }
      .org-detail-members-table td { padding: 20px 24px; vertical-align: top; border: 0; font-size: 14px; }
      .org-detail-member-row:hover { background: var(--bg-tint); }
      .org-detail-member-action { text-align: right; }
      .org-detail-mobile-label { display: none; }
      @media (max-width: 768px) {
        .org-detail-members-table { display: block; }
        .org-detail-members-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        .org-detail-members-table tbody { display: block; }
        .org-detail-member-row { display: grid; grid-template-columns: minmax(0, 1fr); padding: 20px 24px; gap: 14px; border-top: 1px solid var(--border); }
        .org-detail-members-table td { display: block; width: 100%; padding: 0; min-width: 0; }
        .org-detail-mobile-label { display: block; margin-bottom: 6px; }
        .org-detail-member-action { text-align: left; }
      }
    `}</style>
  </section>;
}
