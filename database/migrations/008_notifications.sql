-- =====================================================================
-- Migration 008: Notifications Schema
-- =====================================================================
-- Purpose: Notification templates, notifications, and delivery logs.
--
-- Run order: 8th (after 007_channels)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Notification Templates
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code            VARCHAR(100) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,  -- EMAIL, SMS, WHATSAPP, PUSH, IN_APP, WEBHOOK
  subject         VARCHAR(500),  -- for EMAIL
  body            TEXT NOT NULL,
  body_html       TEXT,  -- for EMAIL
  variables       JSONB DEFAULT '[]'::JSONB,  -- ["{{name}}", "{{orderNumber}}"]
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_templates_tenant_code
  ON public.notification_templates (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_notif_templates_type ON public.notification_templates (type, is_active);

CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Notifications
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  type            VARCHAR(50) NOT NULL,  -- EMAIL, SMS, WHATSAPP, PUSH, IN_APP, WEBHOOK
  priority        VARCHAR(20) NOT NULL DEFAULT 'NORMAL',  -- LOW, NORMAL, HIGH, URGENT
  subject         VARCHAR(500),
  body            TEXT NOT NULL,
  body_html       TEXT,
  recipient       VARCHAR(255) NOT NULL,  -- email, phone, device token, user id
  status          VARCHAR(20) NOT NULL DEFAULT 'QUEUED',  -- QUEUED, SENT, DELIVERED, READ, FAILED
  provider        VARCHAR(50),  -- SENDGRID, SES, TWILIO, META, FCM
  provider_message_id VARCHAR(255),
  error_code      VARCHAR(50),
  error_message   TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON public.notifications (customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications (status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications (priority, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON public.notifications (scheduled_at)
  WHERE status = 'QUEUED' AND scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications (type, status);

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Notification Logs (delivery audit trail)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notification_id     UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  event               VARCHAR(50) NOT NULL,  -- QUEUED, SENT, DELIVERED, READ, FAILED, RETRIED, BOUNCED
  provider            VARCHAR(50),
  provider_response   JSONB,
  error_code          VARCHAR(50),
  error_message       TEXT,
  latency_ms          INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_tenant ON public.notification_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_logs_notification ON public.notification_logs (notification_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event ON public.notification_logs (event, created_at);

-- ---------------------------------------------------------------------
-- 4. User Notification Preferences
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel         VARCHAR(50) NOT NULL,  -- EMAIL, SMS, WHATSAPP, PUSH, IN_APP
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  categories      JSONB DEFAULT '{}'::JSONB,  -- {"order_updates": true, "promotions": false}
  quiet_hours_start TIME,
  quiet_hours_end   TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_prefs_user_channel
  ON public.notification_preferences (user_id, channel);

CREATE TRIGGER trg_notif_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 008
-- =====================================================================
