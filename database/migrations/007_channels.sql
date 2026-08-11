-- =====================================================================
-- Migration 007: Channels Schema
-- =====================================================================
-- Purpose: Voice calls, WhatsApp messages, website chats, telephony.
--
-- Run order: 7th (after 006_ai)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Voice Sessions (Vapi calls)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_id         UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  vapi_call_id        VARCHAR(255),
  direction           VARCHAR(10) NOT NULL,  -- INBOUND, OUTBOUND
  from_number         VARCHAR(20),
  to_number           VARCHAR(20),
  assistant_id_vapi   VARCHAR(255),  -- Vapi assistant ID
  status              VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
  outcome             VARCHAR(50),  -- COMPLETED, TRANSFERRED, ABANDONED, FAILED, VOICEMAIL
  intent_detected     VARCHAR(100),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at         TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  duration_seconds    INT,
  silence_seconds     INT DEFAULT 0,
  talk_time_seconds   INT DEFAULT 0,
  recording_url       TEXT,
  transcript_url      TEXT,
  cost_usd            DECIMAL(10, 4),
  metadata            JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_tenant ON public.voice_sessions (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_conversation ON public.voice_sessions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_customer ON public.voice_sessions (customer_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_vapi_call ON public.voice_sessions (vapi_call_id) WHERE vapi_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_sessions_status ON public.voice_sessions (status, started_at);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_outcome ON public.voice_sessions (outcome) WHERE outcome IS NOT NULL;

CREATE TRIGGER trg_voice_sessions_updated_at
  BEFORE UPDATE ON public.voice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Voice Transcripts
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_transcripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES public.voice_sessions(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,  -- USER, ASSISTANT, SYSTEM, TOOL
  content         TEXT NOT NULL,
  confidence      DECIMAL(5, 4),
  start_time_ms   INT,  -- offset from call start
  end_time_ms     INT,
  tokens_used     INT,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_session ON public.voice_transcripts (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_tenant ON public.voice_transcripts (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- 3. Voice Analytics (one row per session, computed at call end)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_analytics (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id              UUID NOT NULL UNIQUE REFERENCES public.voice_sessions(id) ON DELETE CASCADE,
  duration_seconds        INT NOT NULL,
  silence_duration_ms     INT NOT NULL DEFAULT 0,
  talk_time_ms            INT NOT NULL DEFAULT 0,
  tool_calls_count        INT NOT NULL DEFAULT 0,
  human_handoff_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  ai_accuracy_score       DECIMAL(5, 2),  -- 0-100
  customer_satisfaction   DECIMAL(3, 2),  -- 1-5
  sentiment_score         DECIMAL(4, 3),  -- -1 to 1
  intent_detected         VARCHAR(100),
  outcome                 VARCHAR(50),
  cost_usd                DECIMAL(10, 4),
  metadata                JSONB DEFAULT '{}'::JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_analytics_tenant ON public.voice_analytics (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_voice_analytics_outcome ON public.voice_analytics (outcome) WHERE outcome IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. WhatsApp Sessions (per-customer conversation state)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  phone_number    VARCHAR(20) NOT NULL,
  contact_name    VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, ENDED, BLOCKED
  last_message_at TIMESTAMPTZ,
  message_count   INT NOT NULL DEFAULT 0,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_sessions_tenant_phone
  ON public.whatsapp_sessions (tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_customer ON public.whatsapp_sessions (customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON public.whatsapp_sessions (status);

CREATE TRIGGER trg_whatsapp_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. WhatsApp Messages
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  conversation_id     UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_id         UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  message_id_wa       VARCHAR(255),  -- WhatsApp message ID
  from_number         VARCHAR(20) NOT NULL,
  to_number           VARCHAR(20) NOT NULL,
  type                VARCHAR(50) NOT NULL,  -- TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, TEMPLATE, INTERACTIVE, LOCATION
  direction           VARCHAR(10) NOT NULL,  -- INBOUND, OUTBOUND
  content             JSONB NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'QUEUED',  -- QUEUED, SENT, DELIVERED, READ, FAILED, RECEIVED
  error_code          INT,
  error_message       TEXT,
  template_name       VARCHAR(100),
  template_language   VARCHAR(10),
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON public.whatsapp_messages (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session ON public.whatsapp_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer ON public.whatsapp_messages (customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id ON public.whatsapp_messages (message_id_wa) WHERE message_id_wa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON public.whatsapp_messages (status, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON public.whatsapp_messages (direction, created_at);

-- ---------------------------------------------------------------------
-- 6. WhatsApp Contacts (opt-in registry)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number    VARCHAR(20) NOT NULL,
  name            VARCHAR(255),
  opt_in_status   VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, OPTED_IN, OPTED_OUT
  opt_in_at       TIMESTAMPTZ,
  opt_out_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contacts_tenant_phone
  ON public.whatsapp_contacts (tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_customer ON public.whatsapp_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_opt_in ON public.whatsapp_contacts (opt_in_status);

CREATE TRIGGER trg_whatsapp_contacts_updated_at
  BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Website Chats (web chat sessions)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.website_chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  session_token   VARCHAR(255) NOT NULL,
  visitor_id      VARCHAR(255),  -- anonymous visitor tracking
  user_agent      TEXT,
  ip_address      INET,
  referrer        TEXT,
  landing_page    TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, ENDED, ABANDONED
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  message_count   INT NOT NULL DEFAULT 0,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_chats_token ON public.website_chats (session_token);
CREATE INDEX IF NOT EXISTS idx_website_chats_tenant ON public.website_chats (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_website_chats_customer ON public.website_chats (customer_id);
CREATE INDEX IF NOT EXISTS idx_website_chats_visitor ON public.website_chats (visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_website_chats_status ON public.website_chats (status);

CREATE TRIGGER trg_website_chats_updated_at
  BEFORE UPDATE ON public.website_chats
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 8. Telephony Calls (Twilio etc.)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.telephony_calls (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_id         UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  provider            VARCHAR(50) NOT NULL,  -- TWILIO, PLIVO, EXOTEL, KNOWLARITY
  provider_call_id    VARCHAR(255),
  direction           VARCHAR(10) NOT NULL,  -- INBOUND, OUTBOUND
  from_number         VARCHAR(20) NOT NULL,
  to_number           VARCHAR(20) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
  outcome             VARCHAR(50),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at         TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  duration_seconds    INT,
  recording_url       TEXT,
  cost                DECIMAL(10, 4),
  currency            VARCHAR(3) DEFAULT 'INR',
  metadata            JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telephony_tenant ON public.telephony_calls (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_telephony_provider_call ON public.telephony_calls (provider, provider_call_id);
CREATE INDEX IF NOT EXISTS idx_telephony_customer ON public.telephony_calls (customer_id);
CREATE INDEX IF NOT EXISTS idx_telephony_status ON public.telephony_calls (status, started_at);

CREATE TRIGGER trg_telephony_calls_updated_at
  BEFORE UPDATE ON public.telephony_calls
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 007
-- =====================================================================
