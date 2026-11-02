"use client";

import Link from "next/link";

import { Countdown } from "@/components/Countdown";
import { Badge, Banner, Button, PaymentBadge, SalesBadge, Skeleton, cx } from "@/components/ui";
import { formatDateTime, formatMoney, msLeft } from "@/lib/format";
import type { AvailabilityItem, IssuedTicket, PaymentStatus } from "@/lib/types";

export type BookingPhase =
  | { kind: "cart" }
  | { kind: "held"; reservation_id: string; expires_at: string; total_amount: string; currency: string; payment_status: PaymentStatus; slow: boolean }
  | { kind: "success"; tickets: IssuedTicket[] }
  | { kind: "failed"; message: string };

export interface BookingDisabled {
  kind: "no_tickets" | "sold_out" | "sales_closed";
  title: string;
  hint?: string;
  /** sales_start tương lai gần nhất để đếm ngược (03 §8). */
  countdownTo?: string;
}

export interface BookingView {
  availability: AvailabilityItem[] | null;
  availabilityLoading: boolean;
  degradedAvailability: boolean;
  cancelled: boolean;
  authed: boolean;
  cart: Record<string, number>;
  phase: BookingPhase;
  submitting: boolean;
  error: { message: string; requestId?: string } | null;
  disabled: BookingDisabled | null;
  draftTotal: string;
  onQtyChange: (ticketTypeId: string, next: number) => void;
  onReserve: () => void;
  onCancelHold: () => void;
  onReloadAvailability: () => void;
  onCheckAgain: () => void;
}

function waitLabel(status: PaymentStatus): string {
  if (status === "PENDING") return "Đang chờ kết quả thanh toán…";
  return "Đang chuẩn bị giao dịch…";
}

export function BookingPanel(view: BookingView) {
  const { availability, cart, phase, disabled, cancelled, degradedAvailability } = view;
  const locked = cancelled || disabled !== null || degradedAvailability;
  const selected = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  const panel = (
    <div className="card sticky-panel">
      <h2 style={{ marginTop: 0 }}>Loại vé</h2>

      {view.availabilityLoading && <Skeleton height={120} />}

      {view.degradedAvailability && (
        <>
          <Banner kind="warn">Kho vé chưa tải được, không phải vì sự kiện hết vé.</Banner>
          <Button block onClick={view.onReloadAvailability}>
            Tải lại kho vé
          </Button>
        </>
      )}

      {!view.availabilityLoading && !view.degradedAvailability && (availability === null || availability.length === 0) && (
        <p className="muted">Chưa có loại vé nào cho sự kiện này.</p>
      )}

      {!view.degradedAvailability && availability && availability.length > 0 && (
        <div className="stack" style={{ gap: 10 }} aria-disabled={locked}>
          {availability.map((item) => {
            const qty = cart[item.ticket_type_id] ?? 0;
            const cap = Math.min(10, item.available);
            return (
              <div key={item.ticket_type_id} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <label htmlFor={`pick-${item.ticket_type_id}`} style={{ margin: 0 }}>
                    <input
                      id={`pick-${item.ticket_type_id}`}
                      type="checkbox"
                      checked={qty > 0}
                      disabled={locked || !item.sales_open || item.available === 0}
                      onChange={(event) => view.onQtyChange(item.ticket_type_id, event.target.checked ? 1 : 0)}
                      style={{ width: 16, marginRight: 8 }}
                    />
                    {item.name}
                  </label>
                  <strong className="nowrap">{formatMoney(item.price, item.currency)}</strong>
                </div>
                <div className="spread">
                  <span className={cx("muted small", item.available <= 10 && "nowrap")} style={{ color: item.available <= 10 ? "var(--danger)" : undefined }}>
                    còn {item.available}
                    {item.available <= 10 && item.available > 0 && (
                      <Badge tone="warn" title="Số vé còn lại dưới 10">
                        {" "}Sắp hết
                      </Badge>
                    )}
                  </span>
                  <span className="qty">
                    <Button
                      size="sm"
                      aria-label={`Giảm số lượng ${item.name}`}
                      disabled={locked || qty === 0}
                      onClick={() => view.onQtyChange(item.ticket_type_id, qty - 1)}
                    >
                      −
                    </Button>
                    <input
                      aria-label={`Số lượng ${item.name}`}
                      inputMode="numeric"
                      value={qty}
                      disabled={locked}
                      onChange={(event) => view.onQtyChange(item.ticket_type_id, Number(event.target.value.replace(/\D/g, "")))}
                      onBlur={(event) => view.onQtyChange(item.ticket_type_id, Number(event.target.value) || 0)}
                    />
                    <Button
                      size="sm"
                      aria-label={`Tăng số lượng ${item.name}`}
                      disabled={locked || qty >= cap}
                      onClick={() => view.onQtyChange(item.ticket_type_id, qty + 1)}
                    >
                      +
                    </Button>
                  </span>
                  <SalesBadge sales_open={item.sales_open} status={item.status} />
                </div>
              </div>
            );
          })}

          <hr className="hr" />
          <div className="spread">
            <span>Tổng tạm tính</span>
            <strong>{selected === 0 ? "—" : view.draftTotal}</strong>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Số tiền chốt do server tính lại khi giữ chỗ.
          </p>
        </div>
      )}
    </div>
  );

  // Khu trạng thái + nút chính đặt dưới panel theo 03 §1.
  const action = (
    <div className="card no-print" style={{ marginTop: 14 }}>
      {view.error && (
        <Banner kind="error" requestId={view.error.requestId}>
          {view.error.message}
        </Banner>
      )}

      {cancelled && (
        <Banner kind="error">
          Sự kiện đã bị hủy. Bạn đã giữ chỗ/đã mua sẽ được hoàn tiền tự động.
        </Banner>
      )}

      {disabled && (
        <>
          <Banner kind="warn">{disabled.title}</Banner>
          {disabled.hint && <p className="muted small">{disabled.hint}</p>}
          {disabled.countdownTo && msLeft(disabled.countdownTo) > 0 && (
            <p className="small">
              Mở bán lúc {formatDateTime(disabled.countdownTo)} — <Countdown target={disabled.countdownTo} />
            </p>
          )}
          {disabled.kind === "sold_out" && (
            <Link href="/events" className="btn btn-sm">
              Xem sự kiện khác
            </Link>
          )}
        </>
      )}

      {phase.kind === "cart" && !disabled && !cancelled && (
        <>
          <Button
            variant="accent"
            size="lg"
            block
            loading={view.submitting}
            disabled={view.submitting || selected === 0}
            onClick={view.onReserve}
          >
            {view.submitting ? "Đang giữ chỗ..." : view.authed ? "Giữ chỗ" : "Giữ chỗ (cần đăng nhập)"}
          </Button>
          {!view.authed && (
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Bạn sẽ đăng nhập rồi quay lại đúng trang này, giỏ vé vẫn còn.
            </p>
          )}
        </>
      )}

      {phase.kind === "held" && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="spread">
            <span>{waitLabel(phase.payment_status)}</span>
            <Countdown target={phase.expires_at} />
          </div>
          <div className="skeleton" style={{ height: 8 }} aria-hidden="true" />
          <div className="spread">
            <span className="mono small">{formatMoney(phase.total_amount, phase.currency)}</span>
            <PaymentBadge status={phase.payment_status} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Chúng tôi đang xử lý giao dịch mock, không cần bấm thêm nút thanh toán.
          </p>
          {phase.slow && (
            <Banner kind="warn">Chờ lâu bất thường.</Banner>
          )}
          <div className="row">
            {phase.slow && (
              <Button onClick={view.onCheckAgain}>Kiểm tra lại</Button>
            )}
            <Button variant="danger" onClick={view.onCancelHold}>
              Hủy giữ chỗ
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "success" && (
        <div className="print-area">
          <Banner kind="ok">Bạn đã có vé.</Banner>
          <ul className="list-plain" style={{ marginBottom: 12 }}>
            {phase.tickets.map((ticket) => (
              <li key={ticket.ticket_id} style={{ marginBottom: 6 }}>
                <div className="mono">{ticket.code}</div>
                <span className="muted small">{ticket.ticket_type_name}</span>
              </li>
            ))}
          </ul>
          <div className="row no-print">
            <Link href="/me/tickets" className="btn btn-primary btn-sm">
              Xem vé của tôi
            </Link>
            <Button size="sm" onClick={() => window.print()}>
              Tải vé
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "failed" && (
        <>
          <Banner kind="error">{phase.message}</Banner>
          <Button onClick={view.onReserve}>Thử lại</Button>
        </>
      )}
    </div>
  );

  return (
    <>
      {panel}
      {action}
    </>
  );
}
