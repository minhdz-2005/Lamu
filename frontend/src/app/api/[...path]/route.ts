import { randomUUID } from "node:crypto";

import {
  HttpError,
  HOLD_SECONDS,
  PAYMENT_DELAY_SECONDS,
  availabilityFor,
  cancelEvent,
  canManageEvent,
  confirmReservation,
  consumeRefresh,
  db,
  eventSnapshot,
  findUserByToken,
  hasPermission,
  inventoryOf,
  issueTokens,
  membershipsOf,
  releaseReservation,
  revokeRefresh,
  salesOpen,
  settleReservation,
  totals,
  type EventRecord,
  type Reservation,
  type User,
} from "@/mock/store";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ path: string[] }> };

function json(payload: unknown, status = 200, requestId = "") {
  return Response.json(payload, { status, headers: { "X-Request-Id": requestId } });
}

function fail(status: number, code: string, message: string, requestId: string) {
  return json({ error: { code, message, request_id: requestId } }, status, requestId);
}

function iso(date: Date): string {
  return date.toISOString();
}

const localTime = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

/** Message cho nhân viên cửa, dùng giờ địa phương thay vì RFC3339. */
function hhmm(isoString: string | null): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? isoString : localTime.format(date);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "VALIDATION_FAILED", "Body không phải JSON hợp lệ.");
  }
}

function requireUser(req: Request): User {
  const user = findUserByToken(req.headers.get("authorization"));
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Chưa đăng nhập.");
  return user;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pageOf(url: URL) {
  const limit = Math.min(100, Math.max(1, asNumber(url.searchParams.get("limit")) || 20));
  const offset = Math.max(0, asNumber(url.searchParams.get("offset")));
  return { limit, offset };
}

function reservationView(reservation: Reservation) {
  const store = db();
  return {
    status: reservation.status,
    expires_at: reservation.expires_at,
    items: reservation.items.map((item) => ({
      ticket_type_id: item.ticket_type_id,
      name: store.ticketTypes.find((t) => t.id === item.ticket_type_id)?.name ?? item.ticket_type_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
    total_amount: reservation.total_amount,
    currency: reservation.currency,
    payment_status: reservation.payment_status,
  };
}

function ticketsOfEvent(eventId: string) {
  return db().tickets.filter((t) => t.event_id === eventId);
}

function publicEventItem(event: EventRecord) {
  const org = db().organizations.find((o) => o.id === event.organization_id);
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    starts_at: event.starts_at,
    organization_slug: org?.slug ?? "",
  };
}

async function handle(req: NextRequest, path: string[]): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? `req-${randomUUID().slice(0, 8)}`;
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const joined = path.join("/");
  const store = db();

  // ---------------- Identity ----------------
  if (method === "POST" && joined === "auth/register") {
    const body = await readBody(req);
    const email = asString(body.email).trim().toLowerCase();
    const password = asString(body.password);
    const displayName = asString(body.display_name).trim();
    if (!email.includes("@") || password.length < 8 || !displayName) {
      throw new HttpError(400, "VALIDATION_FAILED", "Email, mật khẩu (≥ 8 ký tự) và tên hiển thị là bắt buộc.");
    }
    if (store.users.some((u) => u.email === email)) {
      throw new HttpError(409, "EMAIL_TAKEN", "Email này đã có tài khoản.");
    }
    const user: User = { id: randomUUID(), email, display_name: displayName, password, status: "ACTIVE" };
    store.users.push(user);
    return json({ user_id: user.id }, 200, requestId);
  }

  if (method === "POST" && joined === "auth/login") {
    const body = await readBody(req);
    const email = asString(body.email).trim().toLowerCase();
    const password = asString(body.password);
    const user = store.users.find((u) => u.email === email);
    if (!user || user.password !== password) {
      throw new HttpError(401, "UNAUTHENTICATED", "Email hoặc mật khẩu không đúng.");
    }
    if (user.status === "LOCKED") throw new HttpError(403, "FORBIDDEN", "Tài khoản bị khóa. Liên hệ ban tổ chức demo.");
    return json(issueTokens(user), 200, requestId);
  }

  if (method === "POST" && joined === "auth/refresh") {
    const body = await readBody(req);
    const user = consumeRefresh(asString(body.refresh_token));
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Refresh token không còn hiệu lực.");
    return json(issueTokens(user), 200, requestId);
  }

  if (method === "POST" && joined === "auth/logout") {
    const body = await readBody(req);
    revokeRefresh(asString(body.refresh_token));
    return json({ status: "OK" }, 200, requestId);
  }

  if (method === "GET" && joined === "users/me") {
    const user = requireUser(req);
    const memberships = membershipsOf(user.id).map((m) => {
      const org = store.organizations.find((o) => o.id === m.organization_id);
      return { organization_id: m.organization_id, name: org?.name ?? "", slug: org?.slug ?? "", roles: m.roles };
    });
    return json({ id: user.id, email: user.email, display_name: user.display_name, memberships }, 200, requestId);
  }

  if (method === "POST" && joined === "organizations") {
    const user = requireUser(req);
    const body = await readBody(req);
    const name = asString(body.name).trim();
    const slug = asString(body.slug).trim().toLowerCase();
    if (!name || !slug) throw new HttpError(400, "VALIDATION_FAILED", "Tên và slug tổ chức là bắt buộc.");
    if (store.organizations.some((o) => o.slug === slug)) throw new HttpError(409, "SLUG_TAKEN", "Đường dẫn (slug) này đã tồn tại.");
    const id = randomUUID();
    store.organizations.push({ id, name, slug, created_by: user.id });
    store.memberships.push({ id: randomUUID(), organization_id: id, user_id: user.id, status: "ACTIVE", roles: ["OWNER"] });
    return json({ organization_id: id }, 200, requestId);
  }

  if (method === "GET" && path[0] === "public" && path[1] === "organizations") {
    const org = store.organizations.find((o) => o.slug === path[2]);
    if (!org) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy tổ chức.");
    return json({ name: org.name, slug: org.slug }, 200, requestId);
  }

  if (method === "GET" && path[0] === "organizations" && path[2] === "members") {
    const user = requireUser(req);
    const orgId = path[1];
    if (!hasPermission(user, orgId, "org.member.read")) throw new HttpError(403, "FORBIDDEN", "Không có quyền xem thành viên.");
    const members = store.memberships
      .filter((m) => m.organization_id === orgId)
      .map((m) => {
        const u = store.users.find((x) => x.id === m.user_id);
        return { user_id: m.user_id, display_name: u?.display_name ?? "", status: m.status, roles: m.roles };
      });
    return json({ items: members, total: members.length }, 200, requestId);
  }

  if (method === "GET" && path[0] === "organizations" && path.length === 2) {
    const user = requireUser(req);
    const org = store.organizations.find((o) => o.id === path[1]);
    if (!org) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy tổ chức.");
    const membership = store.memberships.find((m) => m.organization_id === org.id && m.user_id === user.id);
    if (!membership) throw new HttpError(403, "FORBIDDEN", "Bạn không thuộc tổ chức này.");
    return json({ id: org.id, name: org.name, slug: org.slug, my_roles: membership.roles }, 200, requestId);
  }

  if (method === "GET" && path[0] === "organizations" && path[2] === "events") {
    const user = requireUser(req);
    const orgId = path[1];
    if (!hasPermission(user, orgId, "event.read")) throw new HttpError(403, "FORBIDDEN", "Bạn không có quyền xem event của tổ chức này.");
    const statusFilter = url.searchParams.get("status");
    const items = store.events
      .filter((e) => e.organization_id === orgId && (!statusFilter || e.status === statusFilter))
      .map((e) => ({ id: e.id, title: e.title, slug: e.slug, status: e.status, starts_at: e.starts_at }));
    return json({ items, total: items.length }, 200, requestId);
  }

  // ---------------- Event ----------------
  if (method === "POST" && joined === "events") {
    const user = requireUser(req);
    const body = await readBody(req);
    const orgId = asString(body.organization_id);
    const org = store.organizations.find((o) => o.id === orgId);
    if (!org) throw new HttpError(404, "NOT_FOUND", "Tổ chức không tồn tại.");
    if (!hasPermission(user, orgId, "event.create")) throw new HttpError(403, "FORBIDDEN", "Bạn không có quyền tạo event.");
    const title = asString(body.title).trim();
    const slug = asString(body.slug).trim().toLowerCase();
    const startsAt = asString(body.starts_at);
    const endsAt = asString(body.ends_at);
    if (!title || !slug || !startsAt || !endsAt) {
      throw new HttpError(400, "VALIDATION_FAILED", "title, slug, starts_at, ends_at là bắt buộc.");
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new HttpError(400, "VALIDATION_FAILED", "ends_at phải sau starts_at.");
    }
    if (store.events.some((e) => e.organization_id === orgId && e.slug === slug)) {
      throw new HttpError(409, "SLUG_TAKEN", "Đường dẫn (slug) này đã tồn tại trong tổ chức.");
    }
    const venue = (body.venue ?? {}) as { name?: string; address?: string };
    const event: EventRecord = {
      id: randomUUID(), organization_id: orgId, created_by: user.id, title, slug,
      description: asString(body.description), status: "DRAFT", starts_at: startsAt, ends_at: endsAt,
      timezone: asString(body.timezone) || "Asia/Ho_Chi_Minh",
      venue: { name: asString(venue.name), address: asString(venue.address) }, version: 1,
    };
    store.events.push(event);
    return json({ event_id: event.id, version: event.version }, 200, requestId);
  }

  if (method === "GET" && path[0] === "events" && path.length === 2) {
    const user = requireUser(req);
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (!canManageEvent(user, event, "event.read")) throw new HttpError(403, "FORBIDDEN", "Không có quyền xem event này.");
    return json({ ...event }, 200, requestId);
  }

  if (method === "POST" && path[0] === "events" && path[2] === "publish") {
    const user = requireUser(req);
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (!canManageEvent(user, event, "event.publish")) throw new HttpError(403, "FORBIDDEN", "Không có quyền publish event.");
    if (event.status !== "DRAFT") throw new HttpError(409, "CONFLICT", "Event không ở trạng thái DRAFT.");
    event.status = "PUBLISHED";
    event.version += 1;
    return json({ status: "PUBLISHED" }, 200, requestId);
  }

  if (method === "POST" && path[0] === "events" && path[2] === "cancel") {
    const user = requireUser(req);
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (!canManageEvent(user, event, "event.cancel")) throw new HttpError(403, "FORBIDDEN", "Không có quyền hủy event.");
    const body = await readBody(req);
    const reason = asString(body.reason).trim();
    if (!reason) throw new HttpError(400, "VALIDATION_FAILED", "Lý do hủy là bắt buộc.");
    if (event.status === "CANCELLED") throw new HttpError(409, "CONFLICT", "Event đã bị hủy trước đó.");
    const result = cancelEvent(event, reason);
    return json({ status: "CANCELLED", ...result }, 200, requestId);
  }

  if (method === "GET" && joined === "public/events") {
    const { limit, offset } = pageOf(url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const from = url.searchParams.get("from");
    let items = store.events.filter((e) => e.status === "PUBLISHED" || e.status === "CANCELLED");
    if (q) items = items.filter((e) => e.title.toLowerCase().includes(q) || e.slug.includes(q));
    if (from) items = items.filter((e) => new Date(e.starts_at).getTime() >= new Date(from).getTime());
    const sorted = [...items].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return json(
      { items: sorted.slice(offset, offset + limit).map(publicEventItem), total: sorted.length },
      200,
      requestId,
    );
  }

  if (method === "GET" && path[0] === "public" && path[1] === "events" && path[3] === "details") {
    const event = store.events.find((e) => e.slug === path[2]);
    if (!event || event.status === "DRAFT") throw new HttpError(404, "NOT_FOUND", "Không tìm thấy sự kiện.");
    const org = store.organizations.find((o) => o.id === event.organization_id) ?? null;
    // ?degraded=availability|organization|event để demo nhánh degraded của Gateway.
    const degradedParam = (url.searchParams.get("degraded") ?? "").split(",").filter(Boolean);
    const eventView = degradedParam.includes("event") ? null : { ...event };
    const organization = degradedParam.includes("organization") ? null : org && { name: org.name, slug: org.slug };
    const availability = degradedParam.includes("availability") ? null : availabilityFor(event.id);
    const degraded_sources = degradedParam;
    return json(
      { event: eventView, organization, availability, degraded: degraded_sources.length > 0, degraded_sources },
      200,
      requestId,
    );
  }

  if (method === "GET" && path[0] === "public" && path[1] === "events" && path.length === 3) {
    const event = store.events.find((e) => e.slug === path[2]);
    if (!event || event.status !== "PUBLISHED") throw new HttpError(404, "NOT_FOUND", "Không tìm thấy sự kiện.");
    return json(
      {
        id: event.id, title: event.title, slug: event.slug, description: event.description,
        starts_at: event.starts_at, ends_at: event.ends_at, timezone: event.timezone,
        venue: event.venue, status: event.status, organization_id: event.organization_id,
      },
      200,
      requestId,
    );
  }

  // ---------------- Registration ----------------
  if (method === "POST" && path[0] === "events" && path[2] === "ticket-types") {
    const user = requireUser(req);
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (!canManageEvent(user, event, "event.update")) throw new HttpError(403, "FORBIDDEN", "Không có quyền thêm loại vé.");
    if (event.status !== "PUBLISHED") throw new HttpError(409, "CONFLICT", "Publish event trước khi mở bán.");
    const body = await readBody(req);
    const name = asString(body.name).trim();
    const capacity = asNumber(body.capacity);
    const price = asString(body.price) || "0.00";
    const salesStart = asString(body.sales_start);
    const salesEnd = asString(body.sales_end);
    if (!name || capacity < 1 || !salesStart || !salesEnd) {
      throw new HttpError(400, "VALIDATION_FAILED", "name, capacity ≥ 1, sales_start, sales_end là bắt buộc.");
    }
    if (new Date(salesEnd).getTime() <= new Date(salesStart).getTime()) {
      throw new HttpError(400, "VALIDATION_FAILED", "sales_end phải sau sales_start.");
    }
    const id = randomUUID();
    store.ticketTypes.push({
      id, event_id: event.id, name, price, currency: asString(body.currency) || "VND",
      capacity, sales_start: salesStart, sales_end: salesEnd, status: "ACTIVE",
    });
    store.inventory.push({ ticket_type_id: id, capacity, sold: 0, reserved: 0 });
    return json({ ticket_type_id: id }, 200, requestId);
  }

  if (method === "GET" && path[0] === "events" && path[2] === "ticket-types") {
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (event.status !== "PUBLISHED") throw new HttpError(409, "CONFLICT", "Event chưa publish.");
    const items = store.ticketTypes
      .filter((t) => t.event_id === event.id)
      .map((t) => ({ id: t.id, name: t.name, price: t.price, currency: t.currency, status: t.status, sales_start: t.sales_start, sales_end: t.sales_end }));
    return json({ items, total: items.length }, 200, requestId);
  }

  if (method === "GET" && path[0] === "events" && path[2] === "availability") {
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (event.status !== "PUBLISHED") throw new HttpError(409, "CONFLICT", "Event chưa publish.");
    return json({ items: availabilityFor(event.id), total: availabilityFor(event.id).length }, 200, requestId);
  }

  if (method === "GET" && path[0] === "events" && path[2] === "tickets") {
    const user = requireUser(req);
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    if (!canManageEvent(user, event, "event.read")) throw new HttpError(403, "FORBIDDEN", "Không có quyền xem bảng vé.");
    const { limit, offset } = pageOf(url);
    const statusFilter = url.searchParams.get("status");
    let rows = ticketsOfEvent(event.id);
    if (statusFilter) rows = rows.filter((t) => t.status === statusFilter);
    const items = rows.slice(offset, offset + limit).map((t) => ({
      ticket_id: t.id, code: t.code, ticket_type_name:
        store.ticketTypes.find((x) => x.id === t.ticket_type_id)?.name ?? "",
      status: t.status, checked_in_at: t.checked_in_at,
    }));
    return json({ items, total: rows.length }, 200, requestId);
  }

  if (method === "POST" && path[0] === "events" && path[2] === "reservations") {
    const user = requireUser(req);
    const event = store.events.find((e) => e.id === path[1]);
    if (!event) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy event.");
    const key = req.headers.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu header Idempotency-Key.");
    const existing = store.reservations.find((r) => r.idempotency_key === key);
    if (existing) {
      settleReservation(existing);
      return json(viewOfCreateResult(existing), 200, requestId);
    }
    if (event.status !== "PUBLISHED") throw new HttpError(409, "SALES_CLOSED", "Sự kiện chưa mở bán hoặc đã đóng bán.");

    const body = await readBody(req);
    const rawItems = Array.isArray(body.items) ? (body.items as { ticket_type_id?: string; quantity?: number }[]) : [];
    if (!rawItems.length) throw new HttpError(400, "VALIDATION_FAILED", "Chọn ít nhất một loại vé.");

    const items = rawItems.map((item) => {
      const type = store.ticketTypes.find((t) => t.id === asString(item.ticket_type_id) && t.event_id === event.id);
      if (!type) throw new HttpError(404, "NOT_FOUND", "Loại vé không thuộc sự kiện này.");
      const quantity = asNumber(item.quantity);
      if (quantity < 1 || quantity > 10) throw new HttpError(400, "VALIDATION_FAILED", "Mỗi loại vé từ 1 đến 10 chỗ.");
      if (!salesOpen(type)) throw new HttpError(409, "SALES_CLOSED", "Cửa bán của loại vé này chưa mở hoặc đã đóng.");
      return { ticket_type_id: type.id, quantity, unit_price: type.price };
    });

    for (const item of items) {
      const inv = inventoryOf(item.ticket_type_id);
      if (inv.sold + inv.reserved + item.quantity > inv.capacity) {
        throw new HttpError(409, "SOLD_OUT", "Vé này đã hết. Chọn loại vé khác hoặc số lượng ít hơn.");
      }
    }
    for (const item of items) inventoryOf(item.ticket_type_id).reserved += item.quantity;

    const total = totals(items);
    const currency = store.ticketTypes.find((t) => t.id === items[0].ticket_type_id)?.currency ?? "VND";
    const reservation: Reservation = {
      id: randomUUID(), user_id: user.id, event_id: event.id,
      status: "HELD", payment_status: Number(total) === 0 ? null : "PENDING",
      expires_at: iso(new Date(Date.now() + HOLD_SECONDS * 1000)), release_reason: null,
      idempotency_key: key, items, total_amount: total, currency,
      payment_ready_at: iso(new Date(Date.now() + PAYMENT_DELAY_SECONDS * 1000)), registration_id: null,
    };
    store.reservations.push(reservation);
    store.idempotency[key] = reservation.id;

    if (Number(total) === 0) {
      // Quyết định 2: vé miễn phí confirm ngay trong cùng "transaction".
      confirmReservation(reservation);
    }
    return json(viewOfCreateResult(reservation), 200, requestId);
  }

  if (method === "GET" && path[0] === "reservations" && path.length === 2) {
    const user = requireUser(req);
    const reservation = store.reservations.find((r) => r.id === path[1]);
    if (!reservation) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy giữ chỗ.");
    if (reservation.user_id !== user.id) throw new HttpError(403, "FORBIDDEN", "Không phải giữ chỗ của bạn.");
    return json(reservationView(settleReservation(reservation)), 200, requestId);
  }

  if (method === "DELETE" && path[0] === "reservations" && path.length === 2) {
    const user = requireUser(req);
    const reservation = store.reservations.find((r) => r.id === path[1]);
    if (!reservation) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy giữ chỗ.");
    if (reservation.user_id !== user.id) throw new HttpError(403, "FORBIDDEN", "Không phải giữ chỗ của bạn.");
    settleReservation(reservation);
    if (reservation.status !== "HELD") throw new HttpError(409, "CONFLICT", "Giữ chỗ đã chốt trạng thái, không hủy được.");
    releaseReservation(reservation, "CANCELLED");
    return json({ status: "RELEASED" }, 200, requestId);
  }

  if (method === "GET" && joined === "users/me/tickets") {
    const user = requireUser(req);
    const items = store.tickets
      .filter((t) => t.user_id === user.id)
      .map((t) => {
        const type = store.ticketTypes.find((x) => x.id === t.ticket_type_id);
        const event = eventSnapshot(t.event_id);
        return {
          ticket_id: t.id, code: t.code, event_id: t.event_id,
          event_title: event?.title ?? null, event_slug: event?.slug ?? null,
          event_starts_at: event?.starts_at ?? null, event_status: event?.status ?? null,
          ticket_type_name: type?.name ?? "", status: t.status, checked_in_at: t.checked_in_at,
        };
      })
      .sort((a, b) => new Date(a.event_starts_at ?? 0).getTime() - new Date(b.event_starts_at ?? 0).getTime());
    return json({ items, total: items.length }, 200, requestId);
  }

  if (method === "POST" && joined === "tickets/check-in") {
    const user = requireUser(req);
    const body = await readBody(req);
    const code = asString(body.code).trim().toUpperCase();
    if (!code) throw new HttpError(400, "VALIDATION_FAILED", "Mã vé không được để trống.");
    const ticket = store.tickets.find((t) => t.code.toUpperCase() === code);
    if (!ticket) throw new HttpError(404, "NOT_FOUND", "Mã vé không tồn tại.");
    const event = store.events.find((e) => e.id === ticket.event_id);
    if (!event || !canManageEvent(user, event, "ticket.checkin")) {
      throw new HttpError(403, "FORBIDDEN", "Bạn không có quyền check-in event này.");
    }
    if (ticket.status === "VOIDED") throw new HttpError(409, "TICKET_VOIDED", "Vé đã bị hủy vì sự kiện bị hủy.");
    if (ticket.status === "USED") {
      throw new HttpError(409, "ALREADY_CHECKED_IN", `Mã vé đã được check-in lúc ${hhmm(ticket.checked_in_at)}.`);
    }
    ticket.status = "USED";
    ticket.checked_in_at = iso(new Date());
    return json(
      {
        ticket_id: ticket.id,
        status: "USED",
        checked_in_at: ticket.checked_in_at,
        event_id: event.id,
        event_title: event.title,
        ticket_type_name: store.ticketTypes.find((x) => x.id === ticket.ticket_type_id)?.name ?? "",
      },
      200,
      requestId,
    );
  }

  throw new HttpError(404, "NOT_FOUND", `Mock gateway chưa cài đặt ${method} /${joined}`);
}

function viewOfCreateResult(reservation: Reservation) {
  const store = db();
  if (reservation.status === "CONFIRMED" && reservation.registration_id) {
    return {
      registration_id: reservation.registration_id,
      tickets: store.tickets
        .filter((t) => t.registration_id === reservation.registration_id)
        .map((t) => ({
          ticket_id: t.id, code: t.code,
          ticket_type_name: store.ticketTypes.find((x) => x.id === t.ticket_type_id)?.name ?? "",
          status: t.status,
        })),
    };
  }
  return {
    reservation_id: reservation.id,
    status: reservation.status,
    expires_at: reservation.expires_at,
    total_amount: reservation.total_amount,
    currency: reservation.currency,
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return dispatch(req, await ctx.params);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return dispatch(req, await ctx.params);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return dispatch(req, await ctx.params);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return dispatch(req, await ctx.params);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return dispatch(req, await ctx.params);
}

async function dispatch(req: NextRequest, params: { path: string[] }) {
  const requestId = req.headers.get("x-request-id") ?? `req-${randomUUID().slice(0, 8)}`;
  try {
    return await handle(req, params.path ?? []);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.code, err.message, requestId);
    return fail(500, "UPSTREAM_UNAVAILABLE", "Mock gateway lỗi không xác định.", requestId);
  }
}

export const dynamic = "force-dynamic";
