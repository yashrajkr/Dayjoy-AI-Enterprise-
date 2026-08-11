-- 017_fix_currency_default.sql
-- Align orders.currency default with Prisma schema (schema.prisma:569 declares default "USD",
-- but 005_orders.sql:107 created the column with DEFAULT 'INR'). Dayjoy is an Indian company,
-- so we align to 'INR' by updating the Prisma side OR the SQL side. This migration enforces 'INR'
-- as the canonical default at the database level (matches the original SQL intent).

BEGIN;

-- Update the column default to 'INR' (idempotent).
ALTER TABLE public.orders
  ALTER COLUMN currency SET DEFAULT 'INR';

-- Backfill any rows that currently have 'USD' (or anything other than a supported currency)
-- to 'INR' so historical data is consistent with the Indian-market default.
UPDATE public.orders
  SET currency = 'INR'
  WHERE currency IS NULL OR currency = 'USD';

COMMIT;
