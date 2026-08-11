-- 018_fix_user_role_default.sql
-- Align users.role default with Prisma schema (schema.prisma:282 declares default "user" lowercase,
-- but 002_auth.sql:48 created the column with DEFAULT 'USER' uppercase). The application code and
-- RBAC guards compare against uppercase enum values (ADMIN, USER, DISTRIBUTOR, EMPLOYEE), so the
-- canonical default must be 'USER'. This migration enforces 'USER' as the database default and
-- backfills any rows that may have been inserted with the lowercase 'user' default.

BEGIN;

-- Update the column default to 'USER' (idempotent).
ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'USER';

-- Backfill any rows that have the lowercase 'user' value to 'USER'.
UPDATE public.users
  SET role = 'USER'
  WHERE role = 'user';

COMMIT;
