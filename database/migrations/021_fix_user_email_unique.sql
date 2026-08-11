-- 021_fix_user_email_unique.sql
-- Change email from globally unique to tenant-scoped unique
-- Allows the same email to exist in different tenants

BEGIN;

-- Drop the global unique constraint on email
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

-- Add tenant-scoped unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx
  ON public.users (tenant_id, email);

COMMIT;
