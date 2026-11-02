"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EventCard } from "@/components/EventCard";
import { Button, Chips, EmptyState, ErrorState, PageSizePicker, Pager, SkeletonList } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { describeError } from "@/lib/errors";
import type { Paged, PublicEventListItem } from "@/lib/types";

const CACHE_MS = 10_000;
const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

/** Ngày lọc -> RFC3339 UTC theo múi máy user (02 §2). */
function toUtcFrom(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizeQuery(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed.length >= MIN_QUERY ? trimmed : "";
}

function readSize(value: string | null): 20 | 50 {
  return value === "50" ? 50 : 20;
}

export function EventListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const size = readSize(searchParams.get("size"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const offset = (page - 1) * size;

  const [qInput, setQInput] = useState(q);
  const [fromDraft, setFromDraft] = useState(from.slice(0, 10));
  const [result, setResult] = useState<Paged<PublicEventListItem> | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const seq = useRef(0);
  const cache = useRef(new Map<string, { at: number; data: Paged<PublicEventListItem> }>());
  const autoResetFor = useRef("");
  const gridTop = useRef<HTMLDivElement>(null);

  const writeUrl = useCallback(
    (next: { q?: string; from?: string; page?: number; size?: number }) => {
      const merged = { q: next.q ?? q, from: next.from ?? from, page: next.page ?? page, size: next.size ?? size };
      const params = new URLSearchParams();
      const query = normalizeQuery(merged.q);
      if (query) params.set("q", query);
      if (merged.from) params.set("from", merged.from);
      if (merged.page > 1) params.set("page", String(merged.page));
      if (merged.size !== 20) params.set("size", String(merged.size));
      const search = params.toString();
      router.replace(search ? `/events?${search}` : "/events", { scroll: false });
    },
    [from, page, q, router, size],
  );

  // Debounce 300 ms: mỗi đợt gõ nhanh chỉ đổi URL (và request) một lần (02 §2).
  useEffect(() => {
    if (normalizeQuery(qInput) === q) return;
    const timer = window.setTimeout(() => writeUrl({ q: qInput, page: 1 }), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [qInput, q, writeUrl]);

  // Lùi/tới của trình duyệt đổi URL thì đưa ô tìm kiếm về đúng giá trị (02 §2).
  useEffect(() => {
    if (normalizeQuery(qInput) !== q) setQInput(q);
  }, [q]);

  const load = useCallback(async () => {
    const key = `${q}|${from}|${offset}|${size}`;
    const cached = cache.current.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setResult(cached.data);
      setError(null);
      setLoading(false);
      return;
    }
    seq.current += 1;
    const mine = seq.current;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: String(size), offset: String(offset) });
    if (q) params.set("q", q);
    if (from) params.set("from", toUtcFrom(from));

    try {
      const data = await request<Paged<PublicEventListItem>>(`/public/events?${params.toString()}`);
      if (mine !== seq.current) return;
      cache.current.set(key, { at: Date.now(), data });

      // 02 §6.1: trang vượt biên -> về trang 1 và refetch đúng một lần.
      if (data.items.length === 0 && data.total > 0 && page > 1 && autoResetFor.current !== key) {
        autoResetFor.current = key;
        writeUrl({ page: 1 });
        return;
      }
      setResult(data);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(describeError(err));
      // Giữ dữ liệu trang cũ để không thành trang trắng (02 §6).
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [from, offset, page, q, size, writeUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const changePage = (nextPage: number) => {
    writeUrl({ page: nextPage });
    gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const clearFilters = () => {
    setQInput("");
    setFromDraft("");
    writeUrl({ q: "", from: "", page: 1 });
  };

  const minFrom = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const booting = loading && !result;
  const total = result?.total ?? 0;
  const hasFilter = Boolean(q || from);

  // Chip ngày = một click thay vì mở ô date rồi bấm Lọc (02 §2 vẫn giữ nguyên tham số from).
  const dayOffset = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const setDateFrom = (days: number | null) => {
    const next = days === null ? "" : dayOffset(days);
    setFromDraft(next);
    writeUrl({ from: next, page: 1 });
  };
  const dateChip = !from ? "all" : from === dayOffset(0) ? "soon" : from === dayOffset(7) ? "week" : "none";

  return (
    <div className="stack events-page">
      <div ref={gridTop} />
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Khám phá sự kiện</h1>
          <p className="page-sub">Những cuộc gặp gỡ mới đang chờ bạn. Tìm theo tên hoặc chọn thời điểm phù hợp.</p>
        </div>
        <Chips
          ariaLabel="Lọc nhanh theo ngày"
          value={dateChip}
          onChange={(value) => setDateFrom(value === "all" ? null : value === "soon" ? 0 : 7)}
          items={[
            { value: "all", label: "Mọi ngày" },
            { value: "soon", label: "Từ hôm nay" },
            { value: "week", label: "Sau 7 ngày" },
          ]}
        />
      </div>

      <div className="card event-filters">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            writeUrl({ q: qInput, page: 1 });
          }}
        >
          <div className="row">
            <input
              id="q"
              name="q"
              type="search"
              placeholder="Tên sự kiện hoặc người tổ chức…"
              aria-label="Khám phá sự kiện"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <label className="row nowrap" style={{ gap: 6, margin: 0 }}>
              <span className="muted small">Từ ngày</span>
              <input
                id="from"
                name="from"
                type="date"
                value={fromDraft}
                min={minFrom}
                onChange={(event) => setFromDraft(event.target.value)}
                style={{ width: 170 }}
              />
            </label>
            <Button type="submit" variant="primary">
              Áp dụng
            </Button>
            {hasFilter && (
              <Button type="button" variant="default" className="btn-ghost" onClick={clearFilters}>
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="spread">
        <p className="muted small" style={{ margin: 0 }} aria-live="polite">
          {booting ? "Đang tải…" : `Kết quả: ${total} sự kiện`}
        </p>
        <PageSizePicker value={size} onChange={(next) => writeUrl({ size: next, page: 1 })} />
      </div>

      {error && <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void load()} />}

      {booting ? (
        <div className="grid grid-3">
          <SkeletonList count={6} />
        </div>
      ) : result && result.items.length > 0 ? (
        <div className="grid grid-3" style={loading ? { opacity: 0.6 } : undefined}>
          {result.items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : !error ? (
        <div className="card">
          <EmptyState
            title="Chưa tìm thấy sự kiện nào khớp bộ lọc."
            description="Thử từ khóa khác hoặc bỏ lọc ngày."
            action={
              <Button onClick={clearFilters} variant="primary">
                Xóa bộ lọc
              </Button>
            }
          />
        </div>
      ) : null}

      {result && <Pager page={page} pageSize={size} total={total} onPageChange={changePage} />}
    </div>
  );
}





