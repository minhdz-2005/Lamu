// Mock gateway in-memory, mô phỏng đúng docs/api/catalog.md để UI chạy được trước khi
// năm service thật tồn tại. Chỉ route handler được import file này (server-side).
// Quy tắc nghiệp vụ lấy từ docs/architecture.md §1.1 (8 quyết định) và §4.2.

import { createHash, randomUUID } from "node:crypto";

export const HOLD_SECONDS = 120;
export const PAYMENT_DELAY_SECONDS = Number(process.env.NEXT_PUBLIC_MOCK_PAYMENT_DELAY_SECONDS ?? 5);

export interface User {
  id: string;
  email: string;
  display_name: string;
  /** Mock local so sánh trực tiếp; bản thật do Identity service băm bằng bcrypt/argon2. */
  password: string;
  status: "ACTIVE" | "LOCKED";
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_by: string;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  status: "ACTIVE";
  roles: string[];
}

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type TicketStatus = "ISSUED" | "USED" | "VOIDED";
export type ReservationStatus = "HELD" | "CONFIRMED" | "RELEASED";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface EventRecord {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  slug: string;
  description: string;
  status: EventStatus;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue: { name: string; address: string };
  version: number;
  cancelled_reason?: string;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  price: string;
  currency: string;
  capacity: number;
  sales_start: string;
  sales_end: string;
  status: "ACTIVE" | "CLOSED";
}

export interface Inventory {
  ticket_type_id: string;
  capacity: number;
  sold: number;
  reserved: number;
}

export interface ReservationItem {
  ticket_type_id: string;
  quantity: number;
  unit_price: string;
}

export interface Reservation {
  id: string;
  user_id: string;
  event_id: string;
  status: ReservationStatus;
  payment_status: PaymentStatus | null;
  expires_at: string;
  release_reason: string | null;
  idempotency_key: string;
  items: ReservationItem[];
  total_amount: string;
  currency: string;
  payment_ready_at: string;
  registration_id: string | null;
}

export interface Ticket {
  id: string;
  code: string;
  registration_id: string;
  ticket_type_id: string;
  event_id: string;
  user_id: string;
  status: TicketStatus;
  checked_in_at: string | null;
}

export interface Registration {
  id: string;
  reservation_id: string;
  user_id: string;
  event_id: string;
  status: "CONFIRMED";
  registered_at: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  reservation_id: string;
  event_id: string;
  amount: string;
  status: "COMPLETED";
  created_at: string;
}

interface Session {
  token_hash: string;
  user_id: string;
  revoked_at: string | null;
}

interface Store {
  users: User[];
  organizations: Organization[];
  memberships: Membership[];
  events: EventRecord[];
  ticketTypes: TicketType[];
  inventory: Inventory[];
  reservations: Reservation[];
  registrations: Registration[];
  tickets: Ticket[];
  payments: Record<string, { reservation_id: string; event_id: string; amount: string; status: string }>;
  refunds: Refund[];
  sessions: Session[];
  idempotency: Record<string, string>;
}

export const PERMISSIONS = [
  "org.read",
  "org.member.read",
  "org.member.manage",
  "event.create",
  "event.read",
  "event.update",
  "event.publish",
  "event.cancel",
  "ticket.checkin",
  "payment.refund",
] as const;

const ALL_BUT_MANAGE = PERMISSIONS.filter((p) => p !== "org.member.manage");

export function rolePermissions(role: string): readonly string[] {
  if (role === "OWNER") return PERMISSIONS;
  if (role === "ADMIN") return ALL_BUT_MANAGE;
  if (role === "SPEAKER") return ["event.read"];
  return [];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function iso(date: Date): string {
  return date.toISOString();
}

function plusSeconds(seconds: number): string {
  return iso(new Date(Date.now() + seconds * 1000));
}

function ticketCode(): string {
  const part = () => randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `LUMA-${part()}-${part()}`;
}

function seed(): Store {
  const ownerId = randomUUID();
  const attendeeId = randomUUID();
  const speakerId = randomUUID();
  const orgId = randomUUID();
  const publishedId = randomUUID();
  const freeOnlyId = randomUUID();
  const draftId = randomUUID();
  const cancelledId = randomUUID();

  const paidEarly = randomUUID();
  const paidRegular = randomUUID();
  const freeType = randomUUID();
  const draftType = randomUUID();
  const cancelledType = randomUUID();

  const store: Store = {
    users: [
      { id: ownerId, email: "demo@luma.dev", display_name: "Chủ tọa demo", password: "password123", status: "ACTIVE" },
      { id: attendeeId, email: "khach@luma.dev", display_name: "Khách tham dự", password: "password123", status: "ACTIVE" },
      { id: speakerId, email: "speaker@luma.dev", display_name: "Diễn giả chỉ đọc", password: "password123", status: "ACTIVE" },
    ],
    organizations: [{ id: orgId, name: "Luma Studio", slug: "luma", created_by: ownerId }],
    memberships: [
      { id: randomUUID(), organization_id: orgId, user_id: ownerId, status: "ACTIVE", roles: ["OWNER"] },
      { id: randomUUID(), organization_id: orgId, user_id: speakerId, status: "ACTIVE", roles: ["SPEAKER"] },
    ],
    events: [
      {
        id: publishedId, organization_id: orgId, created_by: ownerId, title: "Luma Dev Summit 2026",
        slug: "luma-dev-summit", description: "Hội nghị kỹ thuật một ngày: microservices, event-driven và RBAC đa cấp.\n\nCó quầy coffee và khu networking.",
        status: "PUBLISHED", starts_at: plusSeconds(86400 * 7), ends_at: plusSeconds(86400 * 7 + 21600),
        timezone: "Asia/Ho_Chi_Minh", venue: { name: "Nhà A, ĐHBK", address: "268 Lý Thường Kiệt, Q.10" }, version: 2,
      },
      {
        id: freeOnlyId, organization_id: orgId, created_by: ownerId, title: "Buổi chia sẻ miễn phí: Tổng quan SOA",
        slug: "soa-open-talk", description: "Buổi nói chuyện miễn phí, vé xác nhận ngay khi giữ chỗ, không qua thanh toán.",
        status: "PUBLISHED", starts_at: plusSeconds(86400 * 2), ends_at: plusSeconds(86400 * 2 + 5400),
        timezone: "Asia/Ho_Chi_Minh", venue: { name: "Phòng 104", address: "Cơ sở 2" }, version: 2,
      },
      {
        id: draftId, organization_id: orgId, created_by: ownerId, title: "Workshop Go cho backend (bản nháp)",
        slug: "go-workshop", description: "Chưa publish nên không hiển thị công khai.",
        status: "DRAFT", starts_at: plusSeconds(86400 * 30), ends_at: plusSeconds(86400 * 30 + 10800),
        timezone: "Asia/Ho_Chi_Minh", venue: { name: "", address: "" }, version: 1,
      },
      {
        id: cancelledId, organization_id: orgId, created_by: ownerId, title: "Vui fest (đã hủy)",
        slug: "vui-fest", description: "Event đã hủy để demo nhánh hoàn tiền tự động.",
        status: "CANCELLED", starts_at: plusSeconds(86400 * 5), ends_at: plusSeconds(86400 * 5 + 7200),
        timezone: "Asia/Ho_Chi_Minh", venue: { name: "Sân 1", address: "Q.7" }, version: 3, cancelled_reason: "Thiếu an toàn",
      },
    ],
    ticketTypes: [
      { id: paidEarly, event_id: publishedId, name: "Early bird", price: "150000.00", currency: "VND", capacity: 60, sales_start: iso(new Date(Date.now() - 86400000)), sales_end: plusSeconds(86400 * 6), status: "ACTIVE" },
      { id: paidRegular, event_id: publishedId, name: "Regular", price: "300000.00", currency: "VND", capacity: 40, sales_start: iso(new Date(Date.now() - 86400000)), sales_end: plusSeconds(86400 * 6), status: "ACTIVE" },
      { id: freeType, event_id: freeOnlyId, name: "Miễn phí", price: "0.00", currency: "VND", capacity: 50, sales_start: iso(new Date(Date.now() - 86400000)), sales_end: plusSeconds(86400), status: "ACTIVE" },
      { id: draftType, event_id: draftId, name: "Early", price: "99000.00", currency: "VND", capacity: 20, sales_start: plusSeconds(3600), sales_end: plusSeconds(86400 * 20), status: "ACTIVE" },
      { id: cancelledType, event_id: cancelledId, name: "Standard", price: "500000.00", currency: "VND", capacity: 30, sales_start: iso(new Date(Date.now() - 86400000)), sales_end: plusSeconds(86400 * 4), status: "CLOSED" },
    ],
    inventory: [
      { ticket_type_id: paidEarly, capacity: 60, sold: 12, reserved: 0 },
      { ticket_type_id: paidRegular, capacity: 40, sold: 35, reserved: 0 },
      { ticket_type_id: freeType, capacity: 50, sold: 3, reserved: 0 },
      { ticket_type_id: draftType, capacity: 20, sold: 0, reserved: 0 },
      { ticket_type_id: cancelledType, capacity: 30, sold: 0, reserved: 0 },
    ],
    reservations: [],
    registrations: [],
    tickets: [],
    payments: {},
    refunds: [],
    sessions: [],
    idempotency: {},
  };

  // Một vé đã bán sẵn để trang "Vé của tôi" và bàn check-in có dữ liệu ngay.
  const reservation: Reservation = {
    id: randomUUID(), user_id: ownerId, event_id: publishedId, status: "CONFIRMED", payment_status: "SUCCEEDED",
    expires_at: plusSeconds(HOLD_SECONDS), release_reason: null, idempotency_key: `seed-${randomUUID()}`,
    items: [{ ticket_type_id: paidEarly, quantity: 2, unit_price: "150000.00" }], total_amount: "300000.00",
    currency: "VND", payment_ready_at: iso(new Date()), registration_id: null,
  };
  const registration: Registration = {
    id: randomUUID(), reservation_id: reservation.id, user_id: ownerId, event_id: publishedId,
    status: "CONFIRMED", registered_at: iso(new Date()),
  };
  reservation.registration_id = registration.id;
  store.reservations.push(reservation);
  store.registrations.push(registration);
  for (let i = 0; i < 2; i += 1) {
    store.tickets.push({
      id: randomUUID(), code: ticketCode(), registration_id: registration.id, ticket_type_id: paidEarly,
      event_id: publishedId, user_id: ownerId, status: "ISSUED", checked_in_at: null,
    });
  }
  store.payments[reservation.id] = {
    reservation_id: reservation.id, event_id: publishedId, amount: "300000.00", status: "SUCCEEDED",
  };
  return store;
}

declare global {
  // eslint-disable-next-line no-var
  var __lumaMockStore: Store | undefined;
}

export function db(): Store {
  if (!global.__lumaMockStore) global.__lumaMockStore = seed();
  return global.__lumaMockStore;
}

export function resetDb(): Store {
  global.__lumaMockStore = seed();
  return global.__lumaMockStore;
}

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function findUserByToken(authorization?: string | null): User | null {
  const store = db();
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const userId = token.startsWith("at_") ? token.slice(3).split(".")[0] : null;
  if (!userId) return null;
  return store.users.find((u) => u.id === userId) ?? null;
}

export function issueTokens(user: User): { access_token: string; refresh_token: string; expires_in: number } {
  const store = db();
  const refresh = `rt_${user.id}_${randomUUID()}`;
  store.sessions.push({ token_hash: hash(refresh), user_id: user.id, revoked_at: null });
  return { access_token: `at_${user.id}`, refresh_token: refresh, expires_in: 900 };
}

export function consumeRefresh(refreshToken: string): User | null {
  const store = db();
  const session = store.sessions.find((s) => s.token_hash === hash(refreshToken) && !s.revoked_at);
  if (!session) return null;
  session.revoked_at = iso(new Date());
  return store.users.find((u) => u.id === session.user_id) ?? null;
}

export function revokeRefresh(refreshToken: string): void {
  const session = db().sessions.find((s) => s.token_hash === hash(refreshToken));
  if (session) session.revoked_at = iso(new Date());
}

export function membershipsOf(userId: string): Membership[] {
  return db().memberships.filter((m) => m.user_id === userId);
}

export function hasPermission(user: User, organizationId: string, permission: string): boolean {
  const membership = db().memberships.find((m) => m.user_id === user.id && m.organization_id === organizationId);
  if (!membership) return false;
  return membership.roles.some((role) => rolePermissions(role).includes(permission));
}

/** Event nào cũng thuộc một org; organizer có quyền nếu mang permission trên org đó. */
export function canManageEvent(user: User, event: EventRecord, permission: string): boolean {
  return hasPermission(user, event.organization_id, permission);
}

export function eventSnapshot(eventId: string) {
  return db().events.find((e) => e.id === eventId) ?? null;
}

export function inventoryOf(ticketTypeId: string): Inventory {
  const store = db();
  let row = store.inventory.find((i) => i.ticket_type_id === ticketTypeId);
  if (!row) {
    const type = store.ticketTypes.find((t) => t.id === ticketTypeId);
    row = { ticket_type_id: ticketTypeId, capacity: type?.capacity ?? 0, sold: 0, reserved: 0 };
    store.inventory.push(row);
  }
  return row;
}

export function salesOpen(type: TicketType): boolean {
  const now = Date.now();
  return type.status === "ACTIVE" && new Date(type.sales_start).getTime() <= now && new Date(type.sales_end).getTime() >= now;
}

export function availabilityFor(eventId: string) {
  const store = db();
  return store.ticketTypes
    .filter((t) => t.event_id === eventId)
    .map((t) => {
      const inv = inventoryOf(t.id);
      return {
        ticket_type_id: t.id,
        name: t.name,
        price: t.price,
        currency: t.currency,
        capacity: inv.capacity,
        sold: inv.sold,
        reserved: inv.reserved,
        available: Math.max(0, inv.capacity - inv.sold - inv.reserved),
        sales_open: salesOpen(t),
        sales_start: t.sales_start,
        sales_end: t.sales_end,
        status: t.status,
      };
    });
}

/**
 * Xác định trạng thái reservation tại thời điểm đọc: mock payment tự kết quả sau
 * PAYMENT_DELAY_SECONDS, và HELD quá expires_at thì release. Không cần background worker.
 */
export function settleReservation(reservation: Reservation): Reservation {
  const store = db();
  const now = Date.now();

  if (reservation.status === "HELD") {
    const pending = new Date(reservation.expires_at).getTime() <= now;
    if (pending) {
      releaseReservation(reservation, reservation.payment_status === "FAILED" ? "PAYMENT_FAILED" : "EXPIRED");
      return reservation;
    }
    if (reservation.payment_status === "PENDING" && new Date(reservation.payment_ready_at).getTime() <= now) {
      const failed = endsWithFailMarker(reservation.total_amount);
      if (failed) {
        store.payments[reservation.id] = {
          reservation_id: reservation.id, event_id: reservation.event_id, amount: reservation.total_amount, status: "FAILED",
        };
        reservation.payment_status = "FAILED";
        releaseReservation(reservation, "PAYMENT_FAILED");
      } else {
        reservation.payment_status = "SUCCEEDED";
        store.payments[reservation.id] = {
          reservation_id: reservation.id, event_id: reservation.event_id, amount: reservation.total_amount, status: "SUCCEEDED",
        };
        confirmReservation(reservation);
      }
    }
  }
  return reservation;
}

/** Demo nhánh PaymentFailed: tổng tiền lẻ có phần thập phân .99 thì mock trả thất bại. */
function endsWithFailMarker(total: string): boolean {
  return total.endsWith(".99");
}

export function confirmReservation(reservation: Reservation): Registration {
  const store = db();
  const registration: Registration = {
    id: randomUUID(), reservation_id: reservation.id, user_id: reservation.user_id,
    event_id: reservation.event_id, status: "CONFIRMED", registered_at: iso(new Date()),
  };
  store.registrations.push(registration);
  reservation.registration_id = registration.id;
  reservation.status = "CONFIRMED";
  for (const item of reservation.items) {
    const inv = inventoryOf(item.ticket_type_id);
    inv.reserved = Math.max(0, inv.reserved - item.quantity);
    inv.sold += item.quantity;
    for (let i = 0; i < item.quantity; i += 1) {
      store.tickets.push({
        id: randomUUID(), code: ticketCode(), registration_id: registration.id, ticket_type_id: item.ticket_type_id,
        event_id: reservation.event_id, user_id: reservation.user_id, status: "ISSUED", checked_in_at: null,
      });
    }
  }
  return registration;
}

export function releaseReservation(reservation: Reservation, reason: string): void {
  if (reservation.status !== "HELD") return;
  for (const item of reservation.items) {
    const inv = inventoryOf(item.ticket_type_id);
    inv.reserved = Math.max(0, inv.reserved - item.quantity);
  }
  reservation.status = "RELEASED";
  reservation.release_reason = reason;
}

/** Event cancel: release HELD, void vé đã phát, refund 100% giao dịch SUCCEEDED (quyết định 7). */
export function cancelEvent(event: EventRecord, reason: string): { released: number; voided: number; refunded: number } {
  const store = db();
  event.status = "CANCELLED";
  event.cancelled_reason = reason;
  event.version += 1;
  let released = 0;
  let voided = 0;
  let refunded = 0;

  for (const reservation of store.reservations.filter((r) => r.event_id === event.id)) {
    if (reservation.status === "HELD") {
      releaseReservation(reservation, "EVENT_CANCELLED");
      released += 1;
    }
  }
  for (const ticket of store.tickets.filter((t) => t.event_id === event.id && t.status !== "VOIDED")) {
    ticket.status = "VOIDED";
    voided += 1;
  }
  for (const [reservationId, payment] of Object.entries(store.payments)) {
    if (payment.event_id === event.id && payment.status === "SUCCEEDED") {
      store.refunds.push({
        id: randomUUID(), payment_id: reservationId, reservation_id: reservationId, event_id: event.id,
        amount: payment.amount, status: "COMPLETED", created_at: iso(new Date()),
      });
      payment.status = "REFUNDED";
      refunded += 1;
    }
  }
  return { released, voided, refunded };
}

export function totals(items: { quantity: number; unit_price: string }[]): string {
  const cents = items.reduce((acc, item) => acc + Math.round(Number(item.unit_price) * 100) * item.quantity, 0);
  return (cents / 100).toFixed(2);
}
