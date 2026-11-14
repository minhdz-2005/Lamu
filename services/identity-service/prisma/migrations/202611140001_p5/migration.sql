-- Additive M1 -> P5 upgrade. Existing memberships start at revision 1;
-- no synthetic history/outbox backfill. No changes to M1 users/sessions/outbox.
-- Production rollback is an explicitly reviewed forward migration, never a
-- destructive automatic DOWN. Keep these columns/table when reverting the app.
ALTER TABLE memberships ADD COLUMN membership_revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE memberships ADD CONSTRAINT memberships_revision_check
  CHECK (membership_revision BETWEEN 1 AND 9007199254740991);

CREATE TABLE idempotency_records (
 id UUID PRIMARY KEY,
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation TEXT NOT NULL,
 idempotency_key VARCHAR(128) NOT NULL,
 request_hash CHAR(64) NOT NULL,
 target_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 target_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
 response_status INTEGER NOT NULL,
 response_body JSONB NOT NULL,
 completed_at TIMESTAMPTZ(6) NOT NULL,
 expires_at TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT idempotency_records_actor_user_id_operation_idempotency_key_key UNIQUE(actor_user_id,operation,idempotency_key),
 CONSTRAINT idempotency_operation_check CHECK(operation IN ('CREATE_ORGANIZATION','REPLACE_MEMBER_ROLES')),
 CONSTRAINT idempotency_key_check CHECK(idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 CONSTRAINT idempotency_hash_check CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT idempotency_result_check CHECK(response_status IN (200,201) AND jsonb_typeof(response_body)='object'),
 CONSTRAINT idempotency_expiry_check CHECK(expires_at=completed_at+interval '24 hours')
);
-- New empty table; these indexes do not block writes on pre-existing tables.
CREATE INDEX idempotency_records_expires_at_idx ON idempotency_records(expires_at);
