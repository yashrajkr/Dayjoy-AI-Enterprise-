-- =====================================================================
-- Migration 012: Indexes (Performance Optimization)
-- =====================================================================
-- Purpose: Add composite and specialized indexes for common queries.
--          Most single-column indexes already exist on the tables.
--          This migration adds the composite and covering indexes
--          needed for production performance.
--
-- Run order: 12th (after 011_audit)
-- Idempotent: YES (uses IF NOT EXISTS)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Users — common filters
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_tenant_status_role
  ON public.users (tenant_id, status, role) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_created
  ON public.users (tenant_id, created_at) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Customers — common filters
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_tenant_status_type
  ON public.customers (tenant_id, status, customer_type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_created
  ON public.customers (tenant_id, created_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_ltv
  ON public.customers (tenant_id, lifetime_value DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Products — catalog browsing
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_tenant_category_status
  ON public.products (tenant_id, category_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_status_price
  ON public.products (tenant_id, status, price) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_status_created
  ON public.products (tenant_id, status, created_at DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Orders — order management
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON public.orders (tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_payment_status
  ON public.orders (tenant_id, payment_status, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_distributor_created
  ON public.orders (distributor_id, created_at) WHERE distributor_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Leads — sales pipeline
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status_assigned
  ON public.leads (tenant_id, status, assigned_to);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_status_created
  ON public.leads (tenant_id, status, created_at);

-- ---------------------------------------------------------------------
-- Conversations — chat history
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_started_status
  ON public.conversations (tenant_id, started_at, status);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_channel_started
  ON public.conversations (tenant_id, channel, started_at);

-- ---------------------------------------------------------------------
-- Messages — pagination
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_id
  ON public.messages (conversation_id, created_at, id);

-- ---------------------------------------------------------------------
-- Voice sessions — analytics
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_voice_sessions_tenant_started_status
  ON public.voice_sessions (tenant_id, started_at, status);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_tenant_outcome
  ON public.voice_sessions (tenant_id, outcome, started_at) WHERE outcome IS NOT NULL;

-- ---------------------------------------------------------------------
-- WhatsApp messages — conversation view
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session_created
  ON public.whatsapp_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_direction_created
  ON public.whatsapp_messages (tenant_id, direction, created_at);

-- ---------------------------------------------------------------------
-- Notifications — queue processing
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_status_scheduled_created
  ON public.notifications (status, scheduled_at, created_at)
  WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications (user_id, type, created_at);

-- ---------------------------------------------------------------------
-- Audit logs — query by entity
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_table_record_created
  ON public.audit_logs (tenant_id, table_name, record_id, created_at);

-- ---------------------------------------------------------------------
-- Workflow executions — operations dashboard
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workflow_exec_tenant_status_started
  ON public.workflow_executions (tenant_id, status, started_at);

-- ---------------------------------------------------------------------
-- Analytics events — time-range queries
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_name_occurred
  ON public.analytics_events (tenant_id, event_name, occurred_at);

-- ---------------------------------------------------------------------
-- Metric values — time-series queries
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_metric_values_metric_recorded
  ON public.metric_values (metric_id, recorded_at);

-- ---------------------------------------------------------------------
-- Webhook events — queue processing
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed_received
  ON public.webhook_events (received_at) WHERE processed = FALSE;

COMMIT;

-- =====================================================================
-- End of Migration 012
-- =====================================================================
