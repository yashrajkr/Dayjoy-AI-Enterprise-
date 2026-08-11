-- =====================================================================
-- Migration 002: Authentication & RBAC Schema
-- =====================================================================
-- Purpose: Create multi-tenant, RBAC, and authentication tables.
--          Every tenant-scoped table has tenant_id + RLS policy.
--
-- Run order: 2nd (after 001_initial)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tenants (top of the hierarchy)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  settings        JSONB DEFAULT '{}'::JSONB,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug ON public.tenants (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants (status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Users
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email               CITEXT NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,
  phone               VARCHAR(20),
  first_name          VARCHAR(100),
  last_name           VARCHAR(100),
  role                VARCHAR(50) NOT NULL DEFAULT 'USER',
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  last_login_at       TIMESTAMPTZ,
  email_verified_at   TIMESTAMPTZ,
  phone_verified_at   TIMESTAMPTZ,
  failed_login_count  INT NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON public.users (tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users (last_login_at) WHERE deleted_at IS NULL;

-- CHECK constraint: email format
ALTER TABLE public.users ADD CONSTRAINT chk_users_email_format
  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Sessions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash      VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255),
  ip_address      INET,
  user_agent      TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token ON public.sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON public.sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions (expires_at) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- 4. Password Reset Tokens
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token ON public.password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON public.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON public.password_reset_tokens (expires_at) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. Email Verification Tokens
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_verify_token ON public.email_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON public.email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_email_verify_expires ON public.email_verification_tokens (expires_at) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------
-- 6. Roles
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_tenant_name ON public.roles (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles (tenant_id);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Permissions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource    VARCHAR(100) NOT NULL,
  action      VARCHAR(50) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_resource_action ON public.permissions (resource, action);

-- ---------------------------------------------------------------------
-- 8. Role-Permission Mapping (many-to-many)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_perms_perm ON public.role_permissions (permission_id);

-- ---------------------------------------------------------------------
-- 9. User-Role Mapping (many-to-many)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES public.users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON public.user_roles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires ON public.user_roles (expires_at) WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 10. Audit Logs (append-only, partitioned monthly)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  user_id     UUID,
  action      VARCHAR(100) NOT NULL,
  table_name  VARCHAR(100) NOT NULL,
  record_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for current + next 12 months
DO $$
DECLARE
  v_month DATE := date_trunc('month', NOW())::DATE;
  v_start DATE;
  v_end   DATE;
  v_name  TEXT;
BEGIN
  FOR i IN 0..12 LOOP
    v_start := v_month + (i || ' months')::INTERVAL;
    v_end   := v_start + '1 month'::INTERVAL;
    v_name  := 'public.audit_logs_' || to_char(v_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.audit_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON public.audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs (action);

-- ---------------------------------------------------------------------
-- 11. Access Logs
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.access_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  user_id     UUID,
  resource_type VARCHAR(100) NOT NULL,
  resource_id   UUID,
  action      VARCHAR(50) NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  result      VARCHAR(20) NOT NULL,
  error_message TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_tenant ON public.access_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_access_user ON public.access_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_access_resource ON public.access_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_access_result ON public.access_logs (result, created_at);

-- ---------------------------------------------------------------------
-- 12. Compliance Records
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.compliance_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,  -- GDPR, HIPAA, SOX, PCI, DPDP
  subject     VARCHAR(255) NOT NULL,
  description TEXT,
  evidence    JSONB,
  status      VARCHAR(30) NOT NULL DEFAULT 'COMPLIANT',
  review_date TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id),
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_tenant ON public.compliance_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_type ON public.compliance_records (type, status);

CREATE TRIGGER trg_compliance_updated_at
  BEFORE UPDATE ON public.compliance_records
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 13. Retention Policies
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.retention_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type       VARCHAR(100) NOT NULL,
  retention_days      INT NOT NULL,
  archive_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  archive_after_days  INT,
  delete_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  delete_after_days   INT,
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_tenant_resource ON public.retention_policies (tenant_id, resource_type);

CREATE TRIGGER trg_retention_updated_at
  BEFORE UPDATE ON public.retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 002
-- =====================================================================
