-- auth.service.ts's assignDefaultRole() looks up a Role named 'USER' per
-- tenant (matching the DEFAULT_USER_ROLE constant) and silently no-ops if
-- it doesn't exist — which it never did, so every registered user ended up
-- with zero permissions and every ai:*/knowledge:*/voice:* protected route
-- returned 403 regardless of who was calling. Seeds a baseline 'USER' role
-- with a normal end-user permission set (read/chat/create on ai/knowledge/
-- voice, plus ai:update since AiMemory writes are gated on it — update/
-- delete on everything else stays admin-only, granted via separate roles).
INSERT INTO roles (id, tenant_id, name, description, is_system)
SELECT gen_random_uuid(), id, 'USER', 'Default end-user role (auto-seeded)', true
FROM tenants
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE roles.tenant_id = tenants.id AND roles.name = 'USER');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'USER'
  AND (p.resource, p.action) IN (
    ('ai','chat'), ('ai','read'), ('ai','create'), ('ai','update'),
    ('knowledge','read'),
    ('voice','read')
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Backfill user_roles for any users created before this role existed.
INSERT INTO user_roles (user_id, role_id, tenant_id, assigned_by, assigned_at)
SELECT u.id, r.id, u.tenant_id, NULL, now()
FROM users u
JOIN roles r ON r.tenant_id = u.tenant_id AND r.name = 'USER'
WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id);
