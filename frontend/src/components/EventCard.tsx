"use client";

import Link from "next/link";

import { formatDateTime, isPast } from "@/lib/format";
import type { PublicEventListItem } from "@/lib/types";
import { Badge } from "./ui";

/** 02 §4: chỉ hiển thị field API list trả về, không bịa giá/tồn kho/ảnh. */
export function EventCard({ event }: { event: PublicEventListItem }) {
  const past = isPast(event.starts_at);
  const date = new Date(event.starts_at);
  const month = new Intl.DateTimeFormat("vi-VN", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  const day = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", timeZone: "UTC" }).format(date);
  const art = Array.from(event.slug).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;

  return (
    <Link href={`/events/${event.slug}`} className={`card event-card event-art-${art}`}>
      <div className="event-card-cover" aria-hidden="true">
        <span className="event-cover-orbit" />
        <span className="event-cover-symbol">✳</span>
        <span className="event-cover-date"><strong>{day}</strong><small>{month}</small></span>
        <span className="event-cover-word">GẶP<br />GỠ.</span>
      </div>
      <div className="card-body">
        <div className="event-card-date-row">
          <span className="event-card-date">{formatDateTime(event.starts_at)}</span>
          {past && <Badge tone="muted">Đã diễn ra</Badge>}
        </div>
        <h3>{event.title}</h3>
        <p className="event-card-host">Tổ chức bởi <strong>{event.organization_slug || "Cộng đồng Lamu"}</strong></p>
        <span className="cta">Xem sự kiện <span className="arrow" aria-hidden="true">↗</span></span>
      </div>
    </Link>
  );
}
