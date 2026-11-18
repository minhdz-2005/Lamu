-- Additive P5 -> P6. No seed, history rewrite, reset or destructive DOWN.
-- App rollback keeps schema; production rollback requires reviewed forward SQL.
CREATE TABLE organization_invitations (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 roles JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',
 created_at TIMESTAMPTZ(6) NOT NULL,
 expires_at TIMESTAMPTZ(6) NOT NULL,
 processed_at TIMESTAMPTZ(6),
 CONSTRAINT invitation_status_check CHECK(status IN ('PENDING','ACCEPTED','DECLINED','REVOKED','EXPIRED')),
 CONSTRAINT invitation_roles_check CHECK(jsonb_typeof(roles)='array' AND jsonb_array_length(roles)<=100),
 CONSTRAINT invitation_expiry_check CHECK(expires_at=created_at+interval '7 days'),
 CONSTRAINT invitation_processed_check CHECK(
   (status='PENDING' AND processed_at IS NULL) OR
   (status='EXPIRED' AND processed_at=expires_at AND processed_at IS NOT NULL) OR
   (status IN ('ACCEPTED','DECLINED','REVOKED') AND processed_at IS NOT NULL AND processed_at>=created_at AND processed_at<expires_at))
);
CREATE UNIQUE INDEX organization_invitations_pending_key ON organization_invitations(organization_id,invitee_user_id) WHERE status='PENDING';
CREATE INDEX organization_invitations_inbox_idx ON organization_invitations(invitee_user_id,created_at DESC,id DESC);
ALTER TABLE idempotency_records ADD COLUMN target_invitation_id UUID REFERENCES organization_invitations(id) ON DELETE RESTRICT;
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_operation_check;
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_operation_check CHECK(operation IN ('CREATE_ORGANIZATION','REPLACE_MEMBER_ROLES','CREATE_INVITATION','ACCEPT_INVITATION','DECLINE_INVITATION','REVOKE_INVITATION'));
