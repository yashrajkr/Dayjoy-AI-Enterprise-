-- =====================================================================
-- Migration 011: Audit Schema
-- =====================================================================
-- Purpose: Activity logs, webhook events, integration registry.
--          (audit_logs and access_logs already created in 002_auth.)
--
-- Run order: 11th (after 010_analytics)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Activity Logs (user-facing activity feed)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activity_type   VARCHAR(100) NOT NULL,  -- LOGIN, LOGOUT, CREATE, UPDATE, DELETE, EXPORT
  entity_type     VARCHAR(100),  -- CUSTOMER, ORDER, PRODUCT, LEAD
  entity_id       UUID,
  description     TEXT,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON public.activity_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON public.activity_logs (activity_type, created_at);

-- ---------------------------------------------------------------------
-- 2. Webhook Events (inbound webhook payloads, for replay/debug)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source          VARCHAR(50) NOT NULL,  -- VAPI, TWILIO, WHATSAPP, STRIPE, RAZORPAY
  event_type      VARCHAR(100) NOT NULL,
  event_id_external VARCHAR(255),  -- provider's event ID for idempotency
  payload         JSONB NOT NULL,
  headers         JSONB,
  signature       TEXT,
  raw_body        TEXT,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  processing_error TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant ON public.webhook_events (tenant_id, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source_type ON public.webhook_events (source, event_type, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON public.webhook_events (received_at)
  WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_webhook_events_external_id ON public.webhook_events (source, event_id_external)
  WHERE event_id_external IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Integrations (third-party service configurations)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  type            VARCHAR(50) NOT NULL,  -- VAPI, TWILIO, WHATSAPP, STRIPE, RAZORPAY, SENDGRID, SENTRY
  config          JSONB NOT NULL,  -- API keys (encrypted at app layer), URLs, settings
  credentials     JSONB,  -- encrypted credentials
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, INACTIVE, ERROR
  last_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_tenant_type_name
  ON public.integrations (tenant_id, type, name);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON public.integrations (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON public.integrations (type, status);

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Tenant Configuration (key-value settings per tenant)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key         VARCHAR(255) NOT NULL,
  value       JSONB NOT NULL,
  category    VARCHAR(100),  -- GENERAL, BILLING, NOTIFICATIONS, AI, SECURITY
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,  -- value should be masked in UI
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_config_tenant_key
  ON public.tenant_config (tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_tenant_config_category ON public.tenant_config (tenant_id, category);

CREATE TRIGGER trg_tenant_config_updated_at
  BEFORE UPDATE ON public.tenant_config
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Knowledge Articles (help center / FAQ)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) NOT NULL,
  content         TEXT NOT NULL,
  excerpt         TEXT,
  category        VARCHAR(100),
  tags            TEXT[] DEFAULT '{}',
  author_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',  -- DRAFT, PUBLISHED, ARCHIVED
  view_count      INT NOT NULL DEFAULT 0,
  helpful_count   INT NOT NULL DEFAULT 0,
  not_helpful_count INT NOT NULL DEFAULT 0,
  search_vector   TSVECTOR,
  metadata        JSONB DEFAULT '{}'::JSONB,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_articles_tenant_slug
  ON public.knowledge_articles (tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tenant ON public.knowledge_articles (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON public.knowledge_articles (category, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags ON public.knowledge_articles USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_search ON public.knowledge_articles USING GIN (search_vector);

CREATE TRIGGER trg_knowledge_articles_search_vector
  BEFORE INSERT OR UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', title, content);

CREATE TRIGGER trg_knowledge_articles_updated_at
  BEFORE UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 011
-- =====================================================================
