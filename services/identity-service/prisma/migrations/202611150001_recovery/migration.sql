-- Additive, forward-only. Roll back application/workers while retaining queued data.
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE TABLE password_reset_challenges (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 code_digest char(64) NOT NULL, generation uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
 verified_at timestamptz, consumed_at timestamptz,
 token_digest char(64) UNIQUE, token_expires_at timestamptz,
 CHECK ((token_digest IS NULL) = (token_expires_at IS NULL)),
 CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_challenges_user_id_created_at_idx ON password_reset_challenges(user_id,created_at);
CREATE INDEX password_reset_challenges_expires_at_idx ON password_reset_challenges(expires_at);
CREATE TABLE security_mail_jobs (
 id uuid PRIMARY KEY, challenge_id uuid REFERENCES password_reset_challenges(id) ON DELETE RESTRICT,
 generation uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('OTP','PASSWORD_CHANGED')),
 ciphertext text, key_id text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','CANCELLED','EXPIRED','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 lease_owner uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 CHECK ((lease_owner IS NULL) = (lease_until IS NULL)),
 CHECK (kind <> 'OTP' OR challenge_id IS NOT NULL),
 CHECK (status IN ('PENDING','SENDING') OR ciphertext IS NULL)
);
CREATE INDEX security_mail_jobs_status_next_attempt_at_idx ON security_mail_jobs(status,next_attempt_at);
CREATE INDEX security_mail_jobs_expires_at_idx ON security_mail_jobs(expires_at);
CREATE TABLE security_rate_buckets (key char(64) PRIMARY KEY, count integer NOT NULL CHECK(count > 0), expires_at timestamptz NOT NULL);
CREATE INDEX security_rate_buckets_expires_at_idx ON security_rate_buckets(expires_at);
