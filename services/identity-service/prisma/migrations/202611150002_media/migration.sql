-- Additive schema; application rollback retains all intents and cleanup work.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE TABLE media_assets (
 id uuid PRIMARY KEY,asset_id text NOT NULL UNIQUE,public_id text NOT NULL UNIQUE,
 version bigint NOT NULL CHECK(version>0),secure_url text NOT NULL,display_url text NOT NULL,
 format text NOT NULL CHECK(format IN ('jpg','jpeg','png','webp')),
 bytes integer NOT NULL CHECK(bytes>0),width integer NOT NULL CHECK(width>0),height integer NOT NULL CHECK(height>0),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DELETING','DELETED'))
);
ALTER TABLE users ADD COLUMN avatar_asset_id uuid UNIQUE REFERENCES media_assets(id) ON DELETE RESTRICT,
 ADD COLUMN avatar_revision bigint NOT NULL DEFAULT 0 CHECK(avatar_revision>=0);
ALTER TABLE organizations ADD COLUMN cover_asset_id uuid UNIQUE REFERENCES media_assets(id) ON DELETE RESTRICT,
 ADD COLUMN cover_revision bigint NOT NULL DEFAULT 0 CHECK(cover_revision>=0);
CREATE TABLE media_upload_intents (
 id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users(id),user_id uuid REFERENCES users(id),organization_id uuid REFERENCES organizations(id),
 purpose text NOT NULL CHECK(purpose IN ('AVATAR','COVER')),
 expected_public_id text NOT NULL UNIQUE,expected_revision bigint NOT NULL CHECK(expected_revision>=0),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,watch_until timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','COMMITTED','EXPIRED')),
 committed_at timestamptz,asset_id uuid UNIQUE REFERENCES media_assets(id),result jsonb,
 CHECK ((purpose='AVATAR' AND user_id IS NOT NULL AND user_id=actor_id AND organization_id IS NULL) OR (purpose='COVER' AND user_id IS NULL AND organization_id IS NOT NULL)),
 CHECK ((state='COMMITTED')=(committed_at IS NOT NULL AND asset_id IS NOT NULL AND result IS NOT NULL)),
 CHECK(expires_at>created_at AND watch_until>expires_at)
);
CREATE INDEX media_upload_intents_actor_id_expires_at_idx ON media_upload_intents(actor_id,expires_at);
CREATE TABLE media_cleanup_jobs (
 id uuid PRIMARY KEY,intent_id uuid NOT NULL UNIQUE REFERENCES media_upload_intents(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),next_attempt_at timestamptz NOT NULL,
 lease_owner uuid,lease_until timestamptz,CHECK((lease_owner IS NULL)=(lease_until IS NULL))
);
CREATE INDEX media_cleanup_jobs_status_next_attempt_at_idx ON media_cleanup_jobs(status,next_attempt_at);
