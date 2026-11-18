CREATE INDEX organization_invitations_outgoing_idx
ON organization_invitations(organization_id, created_at DESC, id DESC);
