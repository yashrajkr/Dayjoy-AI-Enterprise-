-- 015_user_email_verified_column.sql
-- Add is_email_verified column to users table (Prisma schema expects it, 002_auth.sql missed it)
-- This fixes the Prisma camelCase vs SQL snake_case mismatch that breaks user registration

BEGIN;

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill from existing email_verified_at timestamps
UPDATE public.users 
  SET is_email_verified = TRUE 
  WHERE email_verified_at IS NOT NULL;

-- Add index for fast filtering of unverified users
CREATE INDEX IF NOT EXISTS idx_users_is_email_verified 
  ON public.users (is_email_verified) 
  WHERE is_email_verified = FALSE;

COMMIT;
