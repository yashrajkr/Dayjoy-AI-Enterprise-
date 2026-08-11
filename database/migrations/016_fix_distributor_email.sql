-- 016_fix_distributor_email.sql
-- Align distributors.email with Prisma schema (schema.prisma:437 declares email String NOT NULL,
-- but 005_orders.sql:23 created it as CITEXT nullable). Make the column NOT NULL.
-- Existing rows with NULL email must be backfilled first to satisfy the NOT NULL constraint.

BEGIN;

-- Backfill any NULL distributor emails with a placeholder derived from the company name so
-- the NOT NULL constraint can be applied safely. (No-op if there are no NULL emails.)
UPDATE public.distributors
  SET email = LOWER(REGEXP_REPLACE(company_name, '[^A-Za-z0-9]+', '_', 'g')) || '@placeholder.local'
  WHERE email IS NULL;

-- Drop the partial unique index that filters on `email IS NOT NULL` (no longer needed once NOT NULL),
-- then recreate as a regular composite unique index so the constraint matches a non-null email.
DROP INDEX IF EXISTS public.uq_distributors_tenant_email;
CREATE UNIQUE INDEX IF NOT EXISTS uq_distributors_tenant_email
  ON public.distributors (tenant_id, email) WHERE deleted_at IS NULL;

-- Force the column to NOT NULL (idempotent: only alters when currently nullable).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'distributors'
      AND column_name = 'email'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.distributors
      ALTER COLUMN email SET NOT NULL;
  END IF;
END $$;

COMMIT;
