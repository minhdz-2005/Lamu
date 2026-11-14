-- Reference data only; schema expansion is 202611140001_p5.
-- Required for a fresh normal runtime: never depend on local demo accounts/orgs.
-- Existing M1 IDs/names/assignments remain unchanged. No domain events/backfill.
-- Forward-only: app rollback keeps reference data; never auto-delete assigned roles.
BEGIN;
INSERT INTO permissions(id,code,description) VALUES
 ('00000003-0000-4000-8000-000000000001','org.read','org.read'),
 ('00000003-0000-4000-8000-000000000002','org.member.read','org.member.read'),
 ('00000003-0000-4000-8000-000000000003','org.member.manage','org.member.manage'),
 ('00000003-0000-4000-8000-000000000004','event.create','event.create'),
 ('00000003-0000-4000-8000-000000000005','event.read','event.read'),
 ('00000003-0000-4000-8000-000000000006','event.update','event.update'),
 ('00000003-0000-4000-8000-000000000007','event.publish','event.publish'),
 ('00000003-0000-4000-8000-000000000008','event.cancel','event.cancel'),
 ('00000003-0000-4000-8000-000000000009','ticket.checkin','ticket.checkin'),
 ('00000003-0000-4000-8000-000000000010','payment.refund','payment.refund')
ON CONFLICT(code) DO NOTHING;

INSERT INTO roles(id,organization_id,code,name,scope) VALUES
 ('00000002-0000-4000-8000-000000000001',NULL,'OWNER','OWNER','ORG'),
 ('00000002-0000-4000-8000-000000000002',NULL,'ADMIN','ADMIN','ORG'),
 ('00000002-0000-4000-8000-000000000003',NULL,'SPEAKER','SPEAKER','EVENT'),
 ('00000002-0000-4000-8000-000000000004',NULL,'ATTENDEE','ATTENDEE','EVENT')
ON CONFLICT(organization_id,code) DO NOTHING;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM roles WHERE organization_id IS NULL AND
  ((code IN ('OWNER','ADMIN') AND scope<>'ORG') OR
   (code IN ('SPEAKER','ATTENDEE') AND scope<>'EVENT'))) THEN
  RAISE EXCEPTION 'System role scope drift: review before RBAC migration';
 END IF;
 -- Never silently remove an unexpected grant or reinterpret a custom policy.
 IF EXISTS(SELECT 1 FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
  JOIN permissions p ON p.id=rp.permission_id WHERE r.organization_id IS NULL
  AND r.code IN ('OWNER','ADMIN','SPEAKER','ATTENDEE') AND NOT (
   (r.code='OWNER' AND p.code IN ('org.read','org.member.read','org.member.manage','event.create','event.read','event.update','event.publish','event.cancel','ticket.checkin','payment.refund')) OR
   (r.code='ADMIN' AND p.code IN ('org.read','org.member.read','event.create','event.read','event.update','event.publish','event.cancel','ticket.checkin','payment.refund')) OR
   (r.code='SPEAKER' AND p.code='event.read'))) THEN
  RAISE EXCEPTION 'System role permission drift: review before RBAC migration';
 END IF;
END $$;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.organization_id IS NULL AND (
 (r.code='OWNER' AND p.code IN ('org.read','org.member.read','org.member.manage','event.create','event.read','event.update','event.publish','event.cancel','ticket.checkin','payment.refund')) OR
 (r.code='ADMIN' AND p.code IN ('org.read','org.member.read','event.create','event.read','event.update','event.publish','event.cancel','ticket.checkin','payment.refund')) OR
 (r.code='SPEAKER' AND p.code='event.read'))
ON CONFLICT(role_id,permission_id) DO NOTHING;
COMMIT;
