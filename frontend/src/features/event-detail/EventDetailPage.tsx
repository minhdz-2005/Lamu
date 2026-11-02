"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Banner, Button, ErrorState, Skeleton, EventStatusBadge } from "@/components/ui";
import { request } from "@/lib/apiClient";
import { copyText } from "@/lib/clipboard";
import { redirectToAuth, isAuthenticated } from "@/lib/auth";
import { ApiException, describeError } from "@/lib/errors";
import { formatDateTime, formatDateTimeWithZone, formatMoney, isPast, msLeft } from "@/lib/format";
import { idKey } from "@/lib/idKey";
import { useToast } from "@/components/Toast";
import type {
  AvailabilityItem,
  EventDetailsComposition,
  IssuedTicket,
  MyTicket,
  Paged,
  ReservationCreateResult,
  ReservationState,
} from "@/lib/types";
import { BookingPanel, type BookingDisabled, type BookingPhase } from "./BookingPanel";

const POLL_MS = 2000;
const POLL_MAX_MS = 10_000;
const REFRESH_AFTER_MS = 15_000;

type Cart = Record<string, number>;

function clampQty(qty: number, available: number): number {
  return Math.max(0, Math.min(10, Math.min(qty, available)));
}

/** 03 §8: giỏ vé phải còn nguyên sau lượt đăng nhập nhờ next=/events/<slug>. */
const cartKey = (slug: string) => `luma.cart.${slug}`;

function saveCart(slug: string, cart: Cart) {
  window.sessionStorage.setItem(cartKey(slug), JSON.stringify(cart));
}

function readCart(slug: string): Cart {
  try {
    const raw = window.sessionStorage.getItem(cartKey(slug));
    return raw ? (JSON.parse(raw) as Cart) : {};
  } catch {
    return {};
  }
}

export function EventDetailPage({ slug, degradedParam }: { slug: string; degradedParam?: string }) {
  const toast = useToast();
  const [data, setData] = useState<EventDetailsComposition | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const [cart, setCart] = useState<Cart>({});
  const [phase, setPhase] = useState<BookingPhase>({ kind: "cart" });
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<{ message: string; requestId?: string } | null>(null);
  const [authed, setAuthed] = useState(false);

  const keyRef = useRef<string | null>(null);
  const loadedAt = useRef(0);
  const eventIdRef = useRef("");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, [slug, data]);

  const loadComposition = useCallback(
    async (quiet = false) => {
      const eventId = eventIdRef.current;
      if (!quiet) setLoading(true);
      try {
        const composition = await request<EventDetailsComposition>(
          `/public/events/${slug}/details${degradedParam ? `?degraded=${degradedParam}` : ""}`,
        );
        setData(composition);
        if (composition.event) eventIdRef.current = composition.event.id;
        loadedAt.current = Date.now();
        setError(null);
        setNotFound(false);
      } catch (err) {
        if (err instanceof ApiException && err.status === 404) setNotFound(true);
        else setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [slug, degradedParam],
  );

  // 03 §8: đổi slug là reset hết trạng thái giữ chỗ trước khi start poll mới.
  useEffect(() => {
    eventIdRef.current = "";
    keyRef.current = null;
    setPhase({ kind: "cart" });
    setBookingError(null);
    setCart(isAuthenticated() ? readCart(slug) : {});
    void loadComposition();
    return () => {
      if (phaseRef.current.kind === "held") {
        toast.push("Giữ chỗ vẫn đang chờ, vào lại trang này để xem kết quả.");
      }
    };
  }, [slug, loadComposition, toast]);

  // 03 §2: quay lại tab và dữ liệu cũ hơn 15 giây thì refetch, giữ nguyên cart.
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - loadedAt.current > REFRESH_AFTER_MS) void loadComposition(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadComposition]);

  const collectTickets = useCallback(async (eventId: string): Promise<IssuedTicket[]> => {
    const mine = await request<Paged<MyTicket>>("/users/me/tickets");
    return mine.items
      .filter((ticket) => ticket.event_id === eventId)
      .map<IssuedTicket>((ticket) => ({
        ticket_id: ticket.ticket_id,
        code: ticket.code,
        ticket_type_name: ticket.ticket_type_name,
        status: ticket.status,
      }));
  }, []);

  // 00 §7 + 03 §5: poll 2s, lỗi thì nhân đôi tới 10s, dừng khi chốt hoặc quá expires_at + 10s.
  const heldId = phase.kind === "held" ? phase.reservation_id : null;
  useEffect(() => {
    if (!heldId) return;
    let stopped = false;
    let delay = POLL_MS;
    let timer = 0;

    const pollOnce = async (): Promise<"stop" | "again" | "backoff"> => {
      try {
        const state = await request<ReservationState>(`/reservations/${heldId}`);
        if (stopped) return "stop";
        if (state.status === "CONFIRMED") {
          const tickets = await collectTickets(eventIdRef.current);
          if (stopped) return "stop";
          keyRef.current = null;
          setCart({});
          window.sessionStorage.removeItem(cartKey(slug));
          setPhase({ kind: "success", tickets });
          return "stop";
        }
        if (state.status === "RELEASED") {
          keyRef.current = null;
          setPhase({
            kind: "failed",
            message:
              state.payment_status === "FAILED"
                ? "Thanh toán thất bại, chỗ đã được giải phóng."
                : "Hết thời gian giữ chỗ. Chọn lại vé giúp bạn.",
          });
          return "stop";
        }
        if (msLeft(state.expires_at) <= -10_000) {
          setPhase((prev) => (prev.kind === "held" ? { ...prev, slow: true } : prev));
          return "stop";
        }
        setPhase((prev) =>
          prev.kind === "held"
            ? { ...prev, payment_status: state.payment_status, expires_at: state.expires_at }
            : prev,
        );
        return "again";
      } catch (err) {
        if (stopped) return "stop";
        setError(describeError(err));
        return "backoff";
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        const result = await pollOnce();
        if (stopped || result === "stop") return;
        delay = result === "backoff" ? Math.min(POLL_MAX_MS, delay * 2) : POLL_MS;
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [heldId, collectTickets, slug]);

  const availability = data?.availability ?? null;

  const setQty = (ticketTypeId: string, next: number) => {
    const item = availability?.find((row) => row.ticket_type_id === ticketTypeId);
    const qty = clampQty(next, item?.available ?? 0);
    // 00 §5: đổi giỏ vé = giao dịch khác = phải có key mới.
    keyRef.current = null;
    setCart((prev) => ({ ...prev, [ticketTypeId]: qty }));
    if (phase.kind !== "held") setPhase({ kind: "cart" });
  };

  const disabledFrom = (rows: AvailabilityItem[] | null): BookingDisabled | null => {
    if (!rows || rows.length === 0) return { kind: "no_tickets", title: "Chưa có loại vé nào." };
    if (rows.every((row) => row.available === 0)) return { kind: "sold_out", title: "Hết vé" };
    if (rows.every((row) => !row.sales_open)) {
      const upcoming = rows
        .filter((row) => !isPast(row.sales_start))
        .sort((a, b) => new Date(a.sales_start).getTime() - new Date(b.sales_start).getTime())[0];
      if (upcoming) {
        return {
          kind: "sales_closed",
          title: "Chưa mở bán",
          hint: `Loại ${upcoming.name} mở bán từ ${formatDateTime(upcoming.sales_start)}.`,
          countdownTo: upcoming.sales_start,
        };
      }
      const last = [...rows].sort(
        (a, b) => new Date(b.sales_end).getTime() - new Date(a.sales_end).getTime(),
      )[0];
      return {
        kind: "sales_closed",
        title: "Đã đóng bán",
        hint: `Cửa bán đóng từ ${formatDateTime(last.sales_end)}.`,
      };
    }
    return null;
  };

  const reserve = async () => {
    if (!data?.event) return;
    if (!authed) {
      saveCart(slug, cart);
      redirectToAuth(`/events/${slug}`);
      return;
    }
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));
    if (items.length === 0) return;

    // 00 §5: một key cho một lần bấm; retry khi chưa có response dùng lại key cũ.
    if (!keyRef.current) keyRef.current = idKey();
    const eventId = data.event.id;
    setSubmitting(true);
    setBookingError(null);
    try {
      const created = await request<ReservationCreateResult>(`/events/${eventId}/reservations`, {
        method: "POST",
        body: { items },
        headers: { "Idempotency-Key": keyRef.current },
      });
      if ("registration_id" in created) {        // 03 §4A: vé miễn phí chốt một bước, không countdown.
        keyRef.current = null;
        setCart({});
        window.sessionStorage.removeItem(cartKey(slug));
        setPhase({ kind: "success", tickets: created.tickets });
        toast.push("Bạn đã có vé miễn phí.", "success");
      } else {
        setPhase({
          kind: "held",
          reservation_id: created.reservation_id,
          expires_at: created.expires_at,
          total_amount: created.total_amount,
          currency: created.currency,
          payment_status: "PENDING",
          slow: false,
        });
      }
    } catch (err) {
      const described = describeError(err);
      if (err instanceof ApiException && err.code === "SOLD_OUT") {
        setBookingError(described);
        await loadComposition(true);
        setCart((prev) => {
          const next: Cart = {};
          for (const [id, qty] of Object.entries(prev)) {
            const row = data.availability?.find((item) => item.ticket_type_id === id);
            next[id] = row ? clampQty(qty, row.available) : 0;
          }
          return next;
        });
        keyRef.current = null;
      } else if (err instanceof ApiException && (err.code === "SALES_CLOSED" || err.status < 500)) {
        setBookingError(described);
        if (err.code === "SALES_CLOSED") await loadComposition(true);
      } else {
        // 03 §4: 5xx/mất mạng -> giữ nguyên cart và key để bấm Thử lại.
        setBookingError({ message: "Chưa gửi được yêu cầu, thử lại.", requestId: described.requestId });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelHold = async () => {
    if (phase.kind !== "held") return;
    const id = phase.reservation_id;
    setSubmitting(true);
    try {
      await request(`/reservations/${id}`, { method: "DELETE" });
      setPhase({ kind: "cart" });
      keyRef.current = null;
      toast.push("Đã hủy giữ chỗ.", "success");
      await loadComposition(true);
    } catch (err) {
      if (err instanceof ApiException && err.code === "CONFLICT") {
        // 03 §6: 409 nghĩa là đã confirm mất -> hiển thị Success.
        const tickets = await collectTickets(eventIdRef.current).catch(() => [] as IssuedTicket[]);
        setPhase({ kind: "success", tickets });
      } else {
        setBookingError(describeError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const checkAgain = async () => {
    if (phase.kind !== "held") return;
    const id = phase.reservation_id;
    try {
      const state = await request<ReservationState>(`/reservations/${id}`);
      if (state.status === "CONFIRMED") {
        setPhase({ kind: "success", tickets: await collectTickets(eventIdRef.current) });
      } else if (state.status === "RELEASED") {
        setPhase({ kind: "failed", message: "Chỗ giữ đã được giải phóng." });
      } else {
        setPhase({ ...phase, payment_status: state.payment_status, slow: true });
      }
    } catch (err) {
      setBookingError(describeError(err));
    }
  };

  if (loading && !data) {
    return (
      <div className="split">
        <div className="stack">
          <Skeleton height={36} />
          <Skeleton height={20} />
          <Skeleton height={180} />
        </div>
        <div>
          <Skeleton height={260} />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="card">
        <EmptyNotFound slug={slug} />
      </div>
    );
  }

  if (error && !data) {
    return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void loadComposition()} />;
  }

  const event = data?.event ?? null;
  const degraded = data?.degraded ?? false;
  const degradedSources = data?.degraded_sources ?? [];
  const degradedAvailability = degradedSources.includes("availability");
  const disabled = event && event.status === "PUBLISHED" && !degradedAvailability ? disabledFrom(availability) : null;
  const draftTotal = formatMoney(
    (availability ?? []).reduce((sum, item) => sum + Number(item.price) * (cart[item.ticket_type_id] ?? 0), 0),
  );

  return (
    <div className="event-detail-page">
      {degraded && (
        <Banner kind="warn">
          Một số thông tin ({degradedSources.join(", ") || "không rõ nguồn"}) chưa tải được.
        </Banner>
      )}
      <div className="split">
        <div className="stack">
          <nav className="muted small no-print">
            <Link href="/events">Sự kiện</Link> / <span>{event?.title ?? slug}</span>
          </nav>
          {event ? (
            <>
              <div className={`event-detail-art event-art-${Array.from(event.slug).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4}`} aria-hidden="true">
                <span className="detail-art-orbit" />
                <span className="detail-art-spark">✳</span>
                <span className="detail-art-word">MEET<br />HERE.</span>
              </div>
              <div className="spread">
                <h1 style={{ margin: 0 }}>{event.title}</h1>
                <EventStatusBadge status={event.status} />
              </div>
              <div className="row event-meta">
                <span className="meta-pill">
                  <span aria-hidden="true">🗓</span> {formatDateTimeWithZone(event.starts_at, event.timezone)}
                </span>
                <span className="meta-pill">
                  <span aria-hidden="true">📍</span>{" "}
                  {event.venue?.name || event.venue?.address
                    ? [event.venue.name, event.venue.address].filter(Boolean).join(" — ")
                    : "Địa điểm đang cập nhật"}
                </span>
                {isPast(event.starts_at) && event.status === "PUBLISHED" && (
                  <Badge tone="muted">Đã diễn ra</Badge>
                )}
                {new Date(event.ends_at) < new Date(event.starts_at) && (
                  <Badge tone="warn" title="Dữ liệu seed sai: ends_at trước starts_at">
                    dữ liệu giờ bất thường
                  </Badge>
                )}
              </div>
              <hr className="hr" />
              <p style={{ whiteSpace: "pre-wrap" }}>{event.description || "Ban tổ chức chưa mô tả sự kiện."}</p>
              <hr className="hr" />
              <div>
                <h3>Ban tổ chức</h3>
                {data?.organization ? (
                  <p style={{ margin: 0 }}>
                    <Link href={`/events?q=${encodeURIComponent(data.organization.slug)}`}>
                      {data.organization.name}
                    </Link>
                    <span className="muted small"> · {data.organization.slug}</span>
                  </p>
                ) : (
                  <p className="muted">Thông tin ban tổ chức tạm không tải được.</p>
                )}
              </div>
            </>
          ) : (
            <Banner kind="warn">Thông tin sự kiện tạm không tải được.</Banner>
          )}
        </div>

        <div>
          <BookingPanel
            availability={availability}
            availabilityLoading={loading}
            degradedAvailability={degradedSources.includes("availability")}
            cancelled={event?.status === "CANCELLED"}
            authed={authed}
            cart={cart}
            phase={phase}
            submitting={submitting}
            error={bookingError}
            disabled={disabled}
            draftTotal={draftTotal}
            onQtyChange={setQty}
            onReserve={() => void reserve()}
            onCancelHold={() => void cancelHold()}
            onReloadAvailability={() => void loadComposition()}
            onCheckAgain={() => void checkAgain()}
          />
          {event?.status === "PUBLISHED" && (
            <p className="muted small no-print" style={{ marginTop: 10 }}>
              Link chia sẻ: <span className="mono">/events/{event.slug}</span>{" "}
              <Button
                size="sm"
                onClick={async () => {
                  const ok = await copyText(`${window.location.origin}/events/${event.slug}`);
                  toast.push(ok ? "Đã chép link sự kiện." : "Trình duyệt chặn sao chép link.", ok ? "success" : "error");
                }}
              >
                Copy
              </Button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyNotFound({ slug }: { slug: string }) {
  return (
    <div className="stack" style={{ textAlign: "center" }}>
      <h1>Không tìm thấy sự kiện</h1>
      <p className="muted">
        <span className="mono">/events/{slug}</span> chưa publish hoặc đã bị xóa.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link href="/events" className="btn btn-primary">
          Về danh sách sự kiện
        </Link>
      </div>
    </div>
  );
}




