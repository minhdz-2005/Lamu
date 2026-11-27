-- Schema registration_db theo docs/architecture.md §3.3 (bản main, commit 29a23be).
-- event_id / user_id / organization_id là tham chiếu logic, không FK chéo service.

CREATE TABLE ticket_types (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    currency CHAR(3) NOT NULL,
    capacity INT NOT NULL CHECK (capacity BETWEEN 1 AND 100000),
    sales_start TIMESTAMPTZ NOT NULL,
    sales_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sales_end > sales_start)
);

CREATE TABLE inventory (
    ticket_type_id UUID PRIMARY KEY REFERENCES ticket_types(id),
    capacity INT NOT NULL,
    sold INT NOT NULL DEFAULT 0,
    reserved INT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sold >= 0 AND reserved >= 0 AND sold + reserved <= capacity)
);

CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    recipient_email TEXT NOT NULL,
    event_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('HELD','CONFIRMED','RELEASED')),
    payment_status TEXT CHECK (payment_status IN ('PENDING','SUCCEEDED','FAILED')),
    expires_at TIMESTAMPTZ,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reservation_items (
    id UUID PRIMARY KEY,
    reservation_id UUID NOT NULL REFERENCES reservations(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE registrations (
    id UUID PRIMARY KEY,
    reservation_id UUID NOT NULL REFERENCES reservations(id),
    user_id UUID NOT NULL,
    -- enum registrations.status chưa chốt với nhóm (plan.md M1) nên chưa đặt CHECK
    status TEXT NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    registration_id UUID NOT NULL REFERENCES registrations(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','USED','VOIDED')),
    checked_in_at TIMESTAMPTZ
);

CREATE TABLE event_snapshot (
    event_id UUID PRIMARY KEY,
    organization_id UUID,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE TABLE processed_messages (
    message_id UUID PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_types_event ON ticket_types (event_id);
CREATE INDEX idx_reservation_items_reservation ON reservation_items (reservation_id);
CREATE INDEX idx_registrations_reservation ON registrations (reservation_id);
CREATE INDEX idx_tickets_registration ON tickets (registration_id);
CREATE INDEX idx_reservations_held ON reservations (expires_at) WHERE status = 'HELD';
CREATE INDEX idx_outbox_unpublished ON outbox_events (id) WHERE published_at IS NULL;