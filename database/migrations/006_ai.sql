-- =====================================================================
-- Migration 006: AI Schema
-- =====================================================================
-- Purpose: AI agents, conversations, messages, memory, and tools.
--
-- Run order: 6th (after 005_orders)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. AI Agents
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,  -- SUPPORT, SALES, VOICE, WHATSAPP, WEB, EXECUTIVE
  description     TEXT,
  system_prompt   TEXT,
  configuration   JSONB DEFAULT '{}'::JSONB,
  capabilities    JSONB DEFAULT '[]'::JSONB,  -- ["search_knowledge", "create_lead", ...]
  model           VARCHAR(100) DEFAULT 'gpt-4o',
  temperature     DECIMAL(3, 2) DEFAULT 0.7,
  max_tokens      INT DEFAULT 1000,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  version         VARCHAR(20) DEFAULT '1.0.0',
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON public.ai_agents (tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agents_status ON public.ai_agents (status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Conversations
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  channel         VARCHAR(50) NOT NULL,  -- VOICE, WHATSAPP, WEB, API
  session_id      VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, ENDED, ARCHIVED
  context         JSONB DEFAULT '{}'::JSONB,
  metadata        JSONB DEFAULT '{}'::JSONB,
  message_count   INT NOT NULL DEFAULT 0,
  tokens_used     INT NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON public.conversations (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON public.conversations (agent_id, started_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations (user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON public.conversations (customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON public.conversations (channel, started_at);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations (status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_conversations_session ON public.conversations (session_id) WHERE session_id IS NOT NULL;

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Messages
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,  -- USER, ASSISTANT, SYSTEM, TOOL
  content         TEXT NOT NULL,
  content_type    VARCHAR(20) NOT NULL DEFAULT 'TEXT',  -- TEXT, AUDIO, IMAGE, STRUCTURED
  tool_call_id    VARCHAR(255),
  tool_name       VARCHAR(100),
  tool_args       JSONB,
  tool_result     JSONB,
  tokens_used     INT,
  model           VARCHAR(100),
  latency_ms      INT,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON public.messages (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_role ON public.messages (role, created_at);

-- ---------------------------------------------------------------------
-- 4. AI Memory
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,  -- PREFERENCE, FACT, CONTEXT, SUMMARY
  key             VARCHAR(255) NOT NULL,
  value           TEXT NOT NULL,
  importance      INT NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  metadata        JSONB DEFAULT '{}'::JSONB,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_tenant ON public.ai_memory (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_memory_agent ON public.ai_memory (agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_user ON public.ai_memory (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_customer ON public.ai_memory (customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_expires ON public.ai_memory (expires_at) WHERE expires_at IS NOT NULL;

CREATE TRIGGER trg_ai_memory_updated_at
  BEFORE UPDATE ON public.ai_memory
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Tool Executions (audit trail of tool calls)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tool_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  tool_name       VARCHAR(100) NOT NULL,
  arguments       JSONB NOT NULL,
  result          JSONB,
  success         BOOLEAN NOT NULL DEFAULT TRUE,
  error_message   TEXT,
  latency_ms      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_tenant ON public.tool_executions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_executions_conversation ON public.tool_executions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_tool ON public.tool_executions (tool_name, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_executions_success ON public.tool_executions (success) WHERE success = FALSE;

COMMIT;

-- =====================================================================
-- End of Migration 006
-- =====================================================================
