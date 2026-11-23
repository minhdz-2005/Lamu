-- Reference data, separate from DDL; IDs 1..10 remain stable.
BEGIN;
INSERT INTO permissions(id,code,description) VALUES ('00000003-0000-4000-8000-000000000011','org.profile.update','Update organization profile media') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.organization_id IS NULL AND r.code IN ('OWNER','ADMIN') AND r.scope='ORG' AND p.code='org.profile.update' ON CONFLICT DO NOTHING;
COMMIT;
