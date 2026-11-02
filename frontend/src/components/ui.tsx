"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";
import type { EventStatus, PaymentStatus, TicketStatus, TicketTypeStatus } from "@/lib/types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Focus lại field đầu tiên bị lỗi theo 00 §10. */
export function focusField(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.focus();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "secondary" | "danger" | "default";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "default",
  size = "md",
  block = false,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        loading && "pulse",
        variant === "primary" && "btn-primary",
        variant === "accent" && "btn-accent",
        variant === "secondary" && "btn-secondary",
        variant === "danger" && "btn-danger",
        size === "sm" && "btn-sm",
        size === "lg" && "btn-lg",
        block && "btn-block",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {children}
    </button>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur"> {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: ReactNode;
  requiredMark?: boolean;
  mono?: boolean;
}

export function Field({
  name,
  label,
  value,
  onChange,
  error,
  hint,
  requiredMark,
  mono,
  className,
  ...rest
}: FieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {requiredMark && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(error && "input-invalid", mono && "mono", className)}
        {...rest}
      />
      {hint && !error && <p className="muted small" style={{ margin: "4px 0 0" }}>{hint}</p>}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: FieldProps) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="field">
      <label htmlFor={props.name}>
        {props.label}
        {props.requiredMark && <span aria-hidden="true"> *</span>}
      </label>
      <div className="row" style={{ gap: 8 }}>
        <input
          id={props.name}
          name={props.name}
          type={reveal ? "text" : "password"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={props.onBlur}
          autoComplete={props.autoComplete}
          readOnly={props.readOnly}
          disabled={props.disabled}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${props.name}-error` : undefined}
          className={cx(props.error && "input-invalid")}
          style={{ flex: 1 }}
        />
        <Button size="sm" onClick={() => setReveal((prev) => !prev)} aria-pressed={reveal}>
          {reveal ? "Ẩn" : "Hiện"}
        </Button>
      </div>
      {props.error && (
        <p className="field-error" id={`${props.name}-error`}>
          {props.error}
        </p>
      )}
    </div>
  );
}

export function Select({
  label,
  name,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string }) {
  return (
    <div className="field" style={{ minWidth: 150 }}>
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} className={className} {...rest}>
        {children}
      </select>
    </div>
  );
}

export function Skeleton({ height = 16, className }: { height?: number; className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton", className)} style={{ height }} />;
}

export function SkeletonList({ count, height = 150, className }: { count: number; height?: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={height} className={className} />
      ))}
    </>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="stack" style={{ textAlign: "center", padding: "32px 0" }}>
      <div className="empty-mark" aria-hidden="true">
        ∅
      </div>
      <h3 style={{ marginBottom: 4 }}>{title}</h3>
      {description && <p className="muted" style={{ margin: 0 }}>{description}</p>}
      {action && <div className="row" style={{ justifyContent: "center" }}>{action}</div>}
    </div>
  );
}

export interface ChipItem {
  value: string;
  label: string;
}

/** Bộ lọc một chạm: một click thay vì mở select rồi chọn (dùng ở 02 và 04). */
export function Chips({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: ChipItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="chips" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="chip"
          data-active={item.value === value}
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({
  kind,
  children,
  requestId,
}: {
  kind: "error" | "warn" | "ok";
  children: ReactNode;
  requestId?: string;
}) {
  const role = kind === "error" ? "alert" : "status";
  return (
    <div className={cx("banner", `banner-${kind}`)} role={role}>
      {children}
      {requestId && <span className="request-id mono">{requestId}</span>}
    </div>
  );
}

export function ErrorState({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry?: () => void }) {
  return (
    <div className="stack">
      <Banner kind="error" requestId={requestId}>
        {message}
      </Banner>
      {onRetry && (
        <div>
          <Button onClick={onRetry}>Thử lại</Button>
        </div>
      )}
    </div>
  );
}

export type Tone = "success" | "danger" | "warn" | "muted";

export function Badge({ tone = "muted", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const className = cx(
    "badge",
    tone === "success" && "badge-success",
    tone === "danger" && "badge-danger",
    tone === "warn" && "badge-warn",
  );
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  if (status === "PUBLISHED") return <Badge tone="success">PUBLISHED · Đang mở</Badge>;
  if (status === "CANCELLED") return <Badge tone="danger">CANCELLED · Đã hủy</Badge>;
  return <Badge tone="muted">DRAFT · Nháp</Badge>;
}

export interface TicketBadgeView {
  label: string;
  tone: Tone;
  note?: string;
}

/** Bảng nhãn vé ở 04 §3, cộng nhánh "sự kiện đã diễn ra" ở 04 §6. */
export function ticketBadge(status: TicketStatus, eventStatus: EventStatus | null, eventPast: boolean): TicketBadgeView {
  if (status === "USED") return { label: "Đã check-in", tone: "muted" };
  if (status === "VOIDED") return { label: "Vé đã hủy", tone: "muted" };
  if (status === "ISSUED") {
    if (eventStatus === "CANCELLED") {
      return { label: "Sự kiện đã hủy", tone: "danger", note: "Bạn sẽ được hoàn tiền tự động." };
    }
    if (eventPast) return { label: "Chưa dùng", tone: "muted", note: "Sự kiện đã diễn ra." };
    return { label: "Còn hiệu lực", tone: "success" };
  }
  return { label: `Trạng thái: ${String(status)}`, tone: "muted" };
}

export function StatusBadge({
  status,
  event_status,
  event_past,
}: {
  status: TicketStatus;
  event_status: EventStatus | null;
  event_past?: boolean;
}) {
  const view = ticketBadge(status, event_status, Boolean(event_past));
  return <Badge tone={view.tone}>{view.label}</Badge>;
}

export function SalesBadge({
  sales_open,
  status,
}: {
  sales_open: boolean;
  status: TicketTypeStatus;
}) {
  if (status === "CLOSED") return <Badge tone="muted">Đã đóng</Badge>;
  return sales_open ? <Badge tone="success">Đang mở</Badge> : <Badge tone="warn">Chưa mở</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === "SUCCEEDED") return <Badge tone="success">Thanh toán ok</Badge>;
  if (status === "FAILED") return <Badge tone="danger">Thanh toán lỗi</Badge>;
  if (status === "PENDING") return <Badge tone="warn">Đang chờ</Badge>;
  return <Badge tone="muted">Chưa có giao dịch</Badge>;
}

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Tabs({ items, value, onChange }: { items: TabItem[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="tabs no-print" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          type="button"
          aria-selected={item.value === value}
          data-active={item.value === value}
          className="tab"
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="row" style={{ marginTop: 18 }}>
      <Button size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        &lt; Lùi
      </Button>
      <span className="muted small">
        Trang {page} / {pages}
      </span>
      <Button size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
        Tiếp &gt;
      </Button>
    </div>
  );
}

/** Nhãn "kết quả" + chọn pageSize cho 02 §5. */
export function PageSizePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="row nowrap" style={{ gap: 6, marginBottom: 0 }}>
      <span className="muted small">Hiển thị</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: 74 }}
        aria-label="Số sự kiện mỗi trang"
      >
        <option value={20}>20</option>
        <option value={50}>50</option>
      </select>
    </label>
  );
}
