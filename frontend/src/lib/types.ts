// Shape khớp docs/api/catalog.md. Field UI đọc đều có trong contract, không tự thêm.

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CONFLICT"
  | "SOLD_OUT"
  | "SALES_CLOSED"
  | "TIME_LOCKED"
  | "EMAIL_TAKEN"
  | "SLUG_TAKEN"
  | "ALREADY_CHECKED_IN"
  | "TICKET_VOIDED"
  | "UPSTREAM_UNAVAILABLE";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; request_id: string };
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Membership {
  organization_id: string;
  name: string;
  slug: string;
  roles: string[];
}

export interface MeProfile {
  id: string;
  email: string;
  display_name: string;
  memberships: Membership[];
}

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type TicketTypeStatus = "ACTIVE" | "CLOSED";
export type TicketStatus = "ISSUED" | "USED" | "VOIDED";
export type ReservationStatus = "HELD" | "CONFIRMED" | "RELEASED";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | null;

export interface PublicEventListItem {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  organization_slug: string;
}

export interface OrganizerEvent {
  id: string;
  title: string;
  slug: string;
  status: EventStatus;
  starts_at: string;
}

export interface Venue {
  name: string;
  address: string;
}

export interface EventDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue: Venue;
  status: EventStatus;
  organization_id: string;
}

export interface AvailabilityItem {
  ticket_type_id: string;
  name: string;
  price: string;
  currency: string;
  capacity: number;
  sold: number;
  reserved: number;
  available: number;
  sales_open: boolean;
  sales_start: string;
  sales_end: string;
  status: TicketTypeStatus;
}

export interface OrganizationInfo {
  name: string;
  slug: string;
}

export interface EventDetailsComposition {
  event: EventDetail | null;
  organization: OrganizationInfo | null;
  availability: AvailabilityItem[] | null;
  degraded: boolean;
  degraded_sources: string[];
}

export interface IssuedTicket {
  ticket_id: string;
  code: string;
  ticket_type_name: string;
  status: TicketStatus;
}

export interface FreeReservationResult {
  registration_id: string;
  tickets: IssuedTicket[];
  status?: undefined;
}

export interface HeldReservationResult {
  reservation_id: string;
  status: "HELD";
  expires_at: string;
  total_amount: string;
  currency: string;
}

export type ReservationCreateResult = FreeReservationResult | HeldReservationResult;

export interface ReservationState {
  status: ReservationStatus;
  expires_at: string;
  items: { ticket_type_id: string; name: string; quantity: number; unit_price: string }[];
  total_amount: string;
  payment_status: PaymentStatus;
}

export interface MyTicket {
  ticket_id: string;
  code: string;
  event_id: string;
  event_title: string | null;
  event_slug: string | null;
  event_starts_at: string | null;
  event_status: EventStatus | null;
  ticket_type_name: string;
  status: TicketStatus;
  checked_in_at: string | null;
}

export interface EventTicketRow {
  ticket_id: string;
  code: string;
  ticket_type_name: string;
  status: TicketStatus;
  checked_in_at: string | null;
}

export interface CheckInResult {
  ticket_id: string;
  status: "USED";
  checked_in_at: string;
  event_id: string;
  event_title: string;
  ticket_type_name: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}
