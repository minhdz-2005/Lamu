"use client";

import { Button } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { detailCopy as copy, pageSizes } from "./detailData";

export interface DetailPageControls {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly onPage: (offset: number, limit: number) => void;
}

export function DetailPagination({ limit, offset, total, onPage, unit, id }: DetailPageControls & {
  readonly unit: string;
  readonly id: string;
}) {
  return <div className="spread" style={{ padding: 24, gap: 16, flexWrap: "wrap" }}>
    <p style={{ margin: 0, fontSize: 14, color: "var(--text-soft)" }} aria-live="polite">{copy.show} <strong>{total ? offset + 1 : 0}–{Math.min(offset + limit, total)}</strong> {copy.of} <strong>{total}</strong> {unit}</p>
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <label className="row muted small" style={{ gap: 8, margin: 0 }} htmlFor={id}>{copy.pageSize}
        <select id={id} value={limit} onChange={(event) => onPage(0, Number(event.target.value))} style={{ width: "auto", minHeight: 36, padding: "6px 32px 6px 10px", borderRadius: 8, backgroundColor: "var(--surface-2)", fontSize: 14 }}>{pageSizes.map((size) => <option key={size} value={size}>{size} {copy.perPage}</option>)}</select>
      </label>
      <Button size="sm" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit), limit)} style={{ borderRadius: 8 }}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><AccountIcon name="chevron" size={14} /></span>{copy.previous}</Button>
      <Button size="sm" disabled={offset + limit >= total} onClick={() => onPage(offset + limit, limit)} style={{ borderRadius: 8 }}>{copy.next}<AccountIcon name="chevron" size={14} /></Button>
    </div>
  </div>;
}
