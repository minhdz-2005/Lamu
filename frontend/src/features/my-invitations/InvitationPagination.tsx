"use client";

import { Button } from "@/components/ui";
import { inboxCopy as copy } from "./invitationsData";

interface InvitationPaginationProps {
  readonly total: number;
  readonly limit: number;
  readonly page: number;
  readonly onLimit: (limit: number) => void;
  readonly onPage: (page: number) => void;
}

export function InvitationPagination({ total, limit, page, onLimit, onPage }: InvitationPaginationProps) {
  const start = total === 0 ? 0 : page * limit + 1;
  const end = Math.min((page + 1) * limit, total);
  return <nav className="card spread inbox-pagination" aria-label="Phân trang lời mời" style={{ gap: 16, flexWrap: "wrap", padding: "18px 24px", borderRadius: 16, background: "var(--surface)", boxShadow: "none", border: "1px solid var(--border)" }}>
    <p className="small muted" style={{ margin: 0 }}>{copy.show} <strong style={{ color: "var(--text)" }}>{start}–{end}</strong> {copy.of} <strong style={{ color: "var(--text)" }}>{total}</strong> {copy.invitations}</p>
    <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
      <label className="row small muted" style={{ gap: 8 }} htmlFor="inbox-page-size">{copy.size}
        <select id="inbox-page-size" value={limit} onChange={(event) => onLimit(Number(event.target.value))} style={{ color: "var(--text)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", minHeight: 40, font: "inherit" }}>
          {[20, 50, 100].map((size) => <option key={size} value={size}>{size} {copy.perPage}</option>)}
        </select>
      </label>
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>{copy.previous}</Button>
        <Button size="sm" disabled={end >= total} onClick={() => onPage(page + 1)}>{copy.next}</Button>
      </div>
    </div>
    <style jsx>{`.inbox-pagination select:focus-visible { outline: 2px solid var(--secondary); outline-offset: 3px; } @media (max-width: 480px) { .inbox-pagination { align-items: flex-start; flex-direction: column; } }`}</style>
  </nav>;
}
