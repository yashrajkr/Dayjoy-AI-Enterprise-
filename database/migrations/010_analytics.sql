-- =====================================================================
-- Migration 010: Analytics Schema
-- =====================================================================
-- Purpose: Events, metrics, dashboards, and reports.
--
-- Run order: 10th (after 009_automation)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Analytics Events (raw event stream, partitioned monthly)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID,
  customer_id UUID,
  session_id  VARCHAR(255),
  event_name  VARCHAR(100) NOT NULL,
  event_category VARCHAR(50),  -- PAGE_VIEW, CLICK, PURCHASE, SIGNUP, CALL, MESSAGE
  properties  JSONB DEFAULT '{}'::JSONB,
  page_url    TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  ip_address  INET,
  device_type VARCHAR(50),  -- DESKTOP, MOBILE, TABLET
  browser     VARCHAR(50),
  os          VARCHAR(50),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

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
    v_name  := 'public.analytics_events_' || to_char(v_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF public.analytics_events FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant ON public.analytics_events (tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_customer ON public.analytics_events (customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON public.analytics_events (event_name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category ON public.analytics_events (event_category, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON public.analytics_events (session_id) WHERE session_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Metrics (defined metrics with type and unit)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  type        VARCHAR(50) NOT NULL,  -- COUNTER, GAUGE, HISTOGRAM, SUMMARY
  unit        VARCHAR(50),  -- COUNT, SECONDS, MS, BYTES, PERCENT, CURRENCY
  category    VARCHAR(50),  -- BUSINESS, AI, VOICE, WHATSAPP, RAG, SYSTEM
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_metrics_tenant_name ON public.metrics (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_metrics_category ON public.metrics (category, is_active);

CREATE TRIGGER trg_metrics_updated_at
  BEFORE UPDATE ON public.metrics
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Metric Values (time-series metric data, partitioned monthly)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.metric_values (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  metric_id   UUID NOT NULL,
  value       DECIMAL(20, 4) NOT NULL,
  dimensions  JSONB DEFAULT '{}'::JSONB,  -- {"channel": "voice", "agent_id": "..."}
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

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
    v_name  := 'public.metric_values_' || to_char(v_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF public.metric_values FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_metric_values_tenant ON public.metric_values (tenant_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_metric_values_metric ON public.metric_values (metric_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_metric_values_dims ON public.metric_values USING GIN (dimensions);

-- Add FK (after partitions exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'metric_values_metric_id_fkey' AND table_name = 'metric_values'
  ) THEN
    ALTER TABLE public.metric_values
      ADD CONSTRAINT metric_values_metric_id_fkey
      FOREIGN KEY (metric_id) REFERENCES public.metrics(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Dashboards (saved dashboard configurations)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(50),  -- EXECUTIVE, SALES, SUPPORT, AI, VOICE, RAG
  config      JSONB NOT NULL,  -- widget layout, data sources, filters
  is_shared   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON public.dashboards (tenant_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dashboards_shared ON public.dashboards (tenant_id, is_shared) WHERE deleted_at IS NULL AND is_shared = TRUE;

CREATE TRIGGER trg_dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Dashboard Widgets (individual widgets in a dashboard)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dashboard_id    UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,  -- LINE, BAR, PIE, TABLE, STAT, HEATMAP, GAUGE
  data_source     VARCHAR(100) NOT NULL,  -- metric name or SQL query ref
  config          JSONB DEFAULT '{}'::JSONB,  -- colors, axes, filters
  position_x      INT NOT NULL DEFAULT 0,
  position_y      INT NOT NULL DEFAULT 0,
  width           INT NOT NULL DEFAULT 4,
  height          INT NOT NULL DEFAULT 3,
  refresh_interval_seconds INT DEFAULT 60,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_tenant ON public.dashboard_widgets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard ON public.dashboard_widgets (dashboard_id);

CREATE TRIGGER trg_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Reports (saved reports, can be scheduled)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  type            VARCHAR(50),  -- SALES, CUSTOMERS, ORDERS, AI_PERFORMANCE, VOICE_ANALYTICS
  query           TEXT NOT NULL,  -- SQL query or report-builder config
  parameters      JSONB DEFAULT '{}'::JSONB,
  format          VARCHAR(20) NOT NULL DEFAULT 'PDF',  -- PDF, CSV, XLSX, JSON
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_scheduled    BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_cron   VARCHAR(100),
  schedule_email_recipients TEXT[],  -- array of emails
  last_run_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_tenant ON public.reports (tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reports_scheduled ON public.reports (is_scheduled, schedule_cron)
  WHERE deleted_at IS NULL AND is_scheduled = TRUE;

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Report Schedules (one row per scheduled run)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_id       UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, RUNNING, COMPLETED, FAILED
  output_url      TEXT,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant ON public.report_schedules (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_report ON public.report_schedules (report_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_status ON public.report_schedules (status, scheduled_at);

-- ---------------------------------------------------------------------
-- 8. Web Sessions (for web analytics)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.web_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  session_token   VARCHAR(255) NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  device_type     VARCHAR(50),
  browser         VARCHAR(50),
  os              VARCHAR(50),
  country         VARCHAR(2),
  city            VARCHAR(100),
  referrer        TEXT,
  landing_page    TEXT,
  exit_page       TEXT,
  page_views      INT NOT NULL DEFAULT 0,
  duration_seconds INT,
  is_bounce       BOOLEAN NOT NULL DEFAULT FALSE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_web_sessions_token ON public.web_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_web_sessions_tenant ON public.web_sessions (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON public.web_sessions (user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_web_sessions_customer ON public.web_sessions (customer_id);

COMMIT;

-- =====================================================================
-- End of Migration 010
-- =====================================================================
