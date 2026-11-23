-- Additive M3; keep business state and stored envelopes. No destructive DOWN.
-- App rollback keeps metadata/audit. Legacy SENT timestamps remain unknown/NULL.
ALTER TABLE outbox_events
 ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN next_attempt_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 ADD COLUMN claim_token UUID,
 ADD COLUMN lease_until TIMESTAMPTZ(6),
 ADD COLUMN last_attempt_at TIMESTAMPTZ(6),
 ADD COLUMN sent_at TIMESTAMPTZ(6),
 ADD COLUMN last_error_code VARCHAR(64),
 ADD COLUMN parked_at TIMESTAMPTZ(6);
ALTER TABLE outbox_events DROP CONSTRAINT outbox_events_status_check;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_status_check CHECK(status IN ('PENDING','PROCESSING','SENT','PARKED'));
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_attempt_check CHECK(attempt_count>=0);
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_claim_check CHECK(
 (status='PROCESSING' AND claim_token IS NOT NULL AND lease_until IS NOT NULL)
 OR (status<>'PROCESSING' AND claim_token IS NULL AND lease_until IS NULL));
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_sent_check CHECK(sent_at IS NULL OR status='SENT');
CREATE INDEX outbox_events_due_idx ON outbox_events(next_attempt_at,occurred_at,event_id) WHERE status='PENDING';
CREATE INDEX outbox_events_reclaim_idx ON outbox_events(lease_until,event_id) WHERE status='PROCESSING';
CREATE TABLE outbox_delivery_attempts (
 claim_token UUID PRIMARY KEY,
 event_id UUID NOT NULL REFERENCES outbox_events(event_id) ON DELETE RESTRICT,
 attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
 started_at TIMESTAMPTZ(6) NOT NULL,
 finished_at TIMESTAMPTZ(6),
 outcome VARCHAR(64),
 CHECK((finished_at IS NULL)=(outcome IS NULL))
);
CREATE INDEX outbox_delivery_attempts_event_idx ON outbox_delivery_attempts(event_id,started_at);
CREATE TABLE outbox_replays (
 id UUID PRIMARY KEY,
 event_id UUID NOT NULL REFERENCES outbox_events(event_id) ON DELETE RESTRICT,
 replayed_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
 reason VARCHAR(256) NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 256),
 previous_attempt_count INTEGER NOT NULL
);
