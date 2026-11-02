"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { TicketCard } from "@/components/TicketCard";
import { Button, Chips, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { describeError } from "@/lib/errors";
import { isPast } from "@/lib/format";
import { useSession } from "@/lib/useSession";
import type { MyTicket, Paged } from "@/lib/types";

type Filter = "ALL" | "UPCOMING" | "USED" | "VOIDED";

const CACHE_MS = 30_000;

function matches(ticket: MyTicket, filter: Filter): boolean {
  if (filter === "ALL") return true;
  if (filter === "USED") return ticket.status === "USED";
  if (filter === "VOIDED") return ticket.status === "VOIDED";
  return ticket.status === "ISSUED" && !isPast(ticket.event_starts_at) && ticket.event_status !== "CANCELLED";
}

/** 04 §2: vé của event đã qua xuống cuối, không cần API sắp xếp. */
function byStart(a: MyTicket, b: MyTicket): number {
  const timeA = a.event_starts_at ? new Date(a.event_starts_at).getTime() : 0;
  const timeB = b.event_starts_at ? new Date(b.event_starts_at).getTime() : 0;
  const pastA = isPast(a.event_starts_at) ? 1 : 0;
  const pastB = isPast(b.event_starts_at) ? 1 : 0;
  return pastA - pastB || timeA - timeB;
}

export function MyTicketsPage() {
  const { state } = useSession();
  const [items, setItems] = useState<MyTicket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [printing, setPrinting] = useState<string | null>(null);
  const fetchedAt = useRef(0);
  const itemsRef = useRef<MyTicket[] | null>(null);
  itemsRef.current = items;

  const load = useCallback(async (force = false) => {
    if (!force && itemsRef.current && Date.now() - fetchedAt.current < CACHE_MS) return;
    setLoading(true);
    setError(null);
    try {
      const data = await request<Paged<MyTicket>>("/users/me/tickets");
      // 04 §2: không phân trang ở MUST, chỉ cảnh báo dev khi dữ liệu seed quá tay.
      if (data.items.length > 200) console.warn("[04] users/me/tickets trả về > 200 vé, cân nhắc phân trang.");
      setItems(data.items);
      fetchedAt.current = Date.now();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 00 §8: ANONYMOUS vào thẳng /me/tickets thì về trang đăng nhập kèm next.
    if (state === "ANONYMOUS") {
      window.location.assign("/auth?next=/me/tickets");
      return;
    }
    if (state === "AUTHENTICATED") void load();
  }, [state, load]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - fetchedAt.current > CACHE_MS) void load(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // 04 §4: in qua print stylesheet, chỉ giữ card đang bấm.
  useEffect(() => {
    if (!printing) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [printing]);

  const tickets = items ?? [];
  const visible = tickets.filter((ticket) => matches(ticket, filter));
  const countOf = (next: Filter) => tickets.filter((ticket) => matches(ticket, next)).length;

  if (state === "UNKNOWN") {
    return (
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <SkeletonList count={3} height={190} />
      </div>
    );
  }

  return (
    <div className="stack tickets-page">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>Vé của tôi</h1>
          <p className="page-sub">Mỗi vé một thẻ. Nhấp đúp vào mã để chép, bấm In vé khi tới cửa.</p>
        </div>
        <div className="row no-print">
          <Button onClick={() => void load(true)}>Tải lại</Button>
        </div>
      </div>

      <Chips
        ariaLabel="Lọc vé"
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        items={[
          { value: "ALL", label: `Tất cả (${countOf("ALL")})` },
          { value: "UPCOMING", label: `Sắp diễn ra (${countOf("UPCOMING")})` },
          { value: "USED", label: `Đã check-in (${countOf("USED")})` },
          { value: "VOIDED", label: `Đã hủy (${countOf("VOIDED")})` },
        ]}
      />

      {error && <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void load(true)} />}

      {loading && !items ? (
        <div className="grid">
          <SkeletonList count={3} height={190} />
        </div>
      ) : tickets.length === 0 && !error ? (
        <div className="card">
          <EmptyState
            title="Bạn chưa có vé nào."
            description="Đặt vé ở danh sách sự kiện đang mở bán."
            action={
              <Link href="/events" className="btn btn-primary">
                Xem sự kiện đang mở bán
              </Link>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Không có vé nào ở nhóm này."
            action={
              <Button onClick={() => setFilter("ALL")} variant="primary">
                Xem tất cả
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid">
          {[...visible].sort(byStart).map((ticket) => (
            <TicketCard
              key={ticket.ticket_id}
              ticket={ticket}
              printing={printing === ticket.ticket_id}
              onPrint={(target) => setPrinting(target.ticket_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}



