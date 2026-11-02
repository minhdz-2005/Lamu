"use client";

import Link from "next/link";

import { copyText } from "@/lib/clipboard";
import { formatDateTime, formatDateTimeWithZone, isPast } from "@/lib/format";
import { useToast } from "./Toast";
import { Badge, Button, StatusBadge, cx, ticketBadge } from "./ui";
import type { MyTicket } from "@/lib/types";

/** 04: một vé = một card, không gộp hai vé cùng event. */
export function TicketCard({
  ticket,
  printing = false,
  onPrint,
}: {
  ticket: MyTicket;
  printing?: boolean;
  onPrint?: (ticket: MyTicket) => void;
}) {
  const toast = useToast();
  const past = isPast(ticket.event_starts_at);
  const badge = ticketBadge(ticket.status, ticket.event_status, past);
  const faded = ticket.status !== "ISSUED" || ticket.event_status === "CANCELLED";
  // event_slug null = snapshot chưa chiếu kịp (04 §6), vẫn hiện card nhưng ẩn link.
  const slug = ticket.event_slug;
  const title = ticket.event_title || `Sự kiện ${ticket.event_id.slice(0, 8)}`;

  const copy = async () => {
    const ok = await copyText(ticket.code);
    if (ok) toast.push("Đã chép mã vé.", "success");
    else toast.push("Trình duyệt chặn sao chép — bôi đen mã và nhấn Ctrl+C.", "error");
  };

  return (
    <article className={cx("card", "ticket-card", faded && "paid-out", printing && "print-area")}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <StatusBadge status={ticket.status} event_status={ticket.event_status} event_past={past} />
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        {formatDateTimeWithZone(ticket.event_starts_at)}
        {" · "}
        Loại vé: {ticket.ticket_type_name || "—"}
      </p>
      {badge.note && (
        <p className="small" style={{ margin: "6px 0 0", color: "var(--danger)" }}>
          {badge.note}
        </p>
      )}
      {ticket.status === "USED" && ticket.checked_in_at && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          đã vào lúc {formatDateTime(ticket.checked_in_at)}
        </p>
      )}
      {ticket.status === "ISSUED" && past && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Sự kiện đã diễn ra.
        </p>
      )}

      <div className="ticket-code mono" onDoubleClick={copy}>
        {ticket.code}
      </div>

      <div className="row no-print">
        <Button size="sm" onClick={copy}>
          Sao chép mã
        </Button>
        <Button size="sm" onClick={() => onPrint?.(ticket)}>
          In vé
        </Button>
        {slug ? (
          <Link href={`/events/${slug}`} className="btn btn-sm" style={{ padding: "6px 10px" }}>
            Xem sự kiện
          </Link>
        ) : (
          <Badge tone="warn">chưa có link sự kiện</Badge>
        )}
      </div>
    </article>
  );
}
