-- =====================================================================
-- Migration 001: Initial Schema — Extensions + Utility Functions
-- =====================================================================
-- Purpose: Enable required PostgreSQL extensions and create shared
--          utility functions used by all subsequent migrations.
--
-- Run order: 1st
-- Idempotent: YES (uses IF NOT EXISTS / CREATE EXTENSION IF NOT EXISTS)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Required Extensions
-- ---------------------------------------------------------------------

-- pgcrypto: for gen_random_uuid() (UUID primary keys)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: for trigram-based fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- vector: pgvector for RAG embeddings (1536-dim OpenAI text-embedding-3-small)
CREATE EXTENSION IF NOT EXISTS vector;

-- citext: case-insensitive text (for emails)
CREATE EXTENSION IF NOT EXISTS citext;

-- pg_stat_statements: query performance monitoring (requires shared_preload_libraries)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- uncomment if enabled in postgresql.conf

-- ---------------------------------------------------------------------
-- 2. Updated_at Trigger Function (shared by every table)
-- ---------------------------------------------------------------------
-- Auto-updates the updated_at column on any row update.
-- Used by: every table with an updated_at column.

CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. Soft Delete Function (sets deleted_at + status='DELETED')
-- ---------------------------------------------------------------------
-- Used by: application layer to soft-delete records.

CREATE OR REPLACE FUNCTION public.soft_delete_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = NOW();
  NEW.status = 'DELETED';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 4. Audit Log Helper Function
-- ---------------------------------------------------------------------
-- Inserts a row into audit_logs. Called by triggers or app code.

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_tenant_id   UUID,
  p_user_id     UUID,
  p_action      TEXT,
  p_table_name  TEXT,
  p_record_id   UUID DEFAULT NULL,
  p_old_values  JSONB DEFAULT NULL,
  p_new_values  JSONB DEFAULT NULL,
  p_ip_address  INET DEFAULT NULL,
  p_user_agent  TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, table_name, record_id,
    old_values, new_values, ip_address, user_agent, created_at
  ) VALUES (
    p_tenant_id, p_user_id, p_action, p_table_name, p_record_id,
    p_old_values, p_new_values, p_ip_address, p_user_agent, NOW()
  ) RETURNING id INTO v_audit_id;
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 5. UUID Generation Helper (uses pgcrypto's gen_random_uuid)
-- ---------------------------------------------------------------------
-- Already provided by pgcrypto as gen_random_uuid(), but we expose
-- a friendly alias.

CREATE OR REPLACE FUNCTION public.generate_uuid()
RETURNS UUID AS $$
BEGIN
  RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 6. Current Tenant Helper (for RLS policies)
-- ---------------------------------------------------------------------
-- Returns the current tenant ID set by the application via
-- SET app.current_tenant = '<uuid>';

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant TEXT;
BEGIN
  v_tenant := current_setting('app.current_tenant', true);
  IF v_tenant IS NULL OR v_tenant = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_tenant::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 7. Slug Generation Function (for URL-safe slugs)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_slug(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      trim(input_text),
      '[^a-zA-Z0-9]+', '-', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 8. Order Number Generation (tenant-scoped, sequential)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_order_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_seq BIGINT;
  v_year TEXT := to_char(NOW(), 'YYYY');
BEGIN
  SELECT nextval('public.order_number_seq') INTO v_next_seq;
  RETURN 'ORD-' || v_year || '-' || lpad(v_next_seq::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

-- Sequence for order numbers (one global sequence, tenant prefix in app)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1 INCREMENT 1;

COMMIT;

-- =====================================================================
-- End of Migration 001
-- =====================================================================
