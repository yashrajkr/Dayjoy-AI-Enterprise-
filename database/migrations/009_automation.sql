-- =====================================================================
-- Migration 009: Automation Schema
-- =====================================================================
-- Purpose: Workflow definitions, executions, triggers, and steps.
--
-- Run order: 9th (after 008_notifications)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Workflows
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  type            VARCHAR(50) NOT NULL,  -- BUSINESS, AI, INTEGRATION, NOTIFICATION
  trigger_type    VARCHAR(50) NOT NULL,  -- EVENT, SCHEDULE, MANUAL, WEBHOOK
  trigger_config  JSONB DEFAULT '{}'::JSONB,  -- {"event": "lead.created"} or {"cron": "0 9 * * *"}
  definition      JSONB NOT NULL,  -- workflow DSL (nodes + edges)
  version         INT NOT NULL DEFAULT 1,
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',  -- DRAFT, ACTIVE, PAUSED, ARCHIVED
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON public.workflows (tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflows_status ON public.workflows (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON public.workflows (trigger_type, status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Workflow Versions (audit trail of workflow changes)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  definition      JSONB NOT NULL,
  change_summary  TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_versions_wf_version
  ON public.workflow_versions (workflow_id, version);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_tenant ON public.workflow_versions (tenant_id, created_at);

-- ---------------------------------------------------------------------
-- 3. Workflow Triggers (active trigger registrations)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_triggers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type    VARCHAR(50) NOT NULL,  -- EVENT, SCHEDULE, WEBHOOK
  trigger_value   VARCHAR(255) NOT NULL,  -- event name, cron expr, webhook path
  config          JSONB DEFAULT '{}'::JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_fired_at   TIMESTAMPTZ,
  fire_count      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_tenant ON public.workflow_triggers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow ON public.workflow_triggers (workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_active ON public.workflow_triggers (trigger_type, trigger_value, is_active)
  WHERE is_active = TRUE;

CREATE TRIGGER trg_workflow_triggers_updated_at
  BEFORE UPDATE ON public.workflow_triggers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Workflow Steps (template of steps in a workflow)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_key        VARCHAR(100) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,  -- ACTION, CONDITION, WAIT, PARALLEL, LOOP
  config          JSONB DEFAULT '{}'::JSONB,
  next_step_key   VARCHAR(100),
  position        INT NOT NULL DEFAULT 0,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_steps_wf_key
  ON public.workflow_steps (workflow_id, step_key);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON public.workflow_steps (workflow_id, position);

CREATE TRIGGER trg_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Workflow Executions (each run of a workflow)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  workflow_version INT NOT NULL,
  trigger_type    VARCHAR(50) NOT NULL,
  trigger_data    JSONB DEFAULT '{}'::JSONB,
  input           JSONB DEFAULT '{}'::JSONB,
  output          JSONB DEFAULT '{}'::JSONB,
  status          VARCHAR(20) NOT NULL DEFAULT 'RUNNING',  -- RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INT,
  triggered_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_exec_tenant ON public.workflow_executions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_workflow ON public.workflow_executions (workflow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_status ON public.workflow_executions (status, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_started ON public.workflow_executions (started_at);

CREATE TRIGGER trg_workflow_exec_updated_at
  BEFORE UPDATE ON public.workflow_executions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Execution Logs (per-step execution audit)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.execution_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_execution_id UUID NOT NULL REFERENCES public.workflow_executions(id) ON DELETE CASCADE,
  workflow_step_id    UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  step_key            VARCHAR(100) NOT NULL,
  status              VARCHAR(20) NOT NULL,  -- STARTED, COMPLETED, FAILED, SKIPPED
  input               JSONB,
  output              JSONB,
  error_message       TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_tenant ON public.execution_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_execution_logs_execution ON public.execution_logs (workflow_execution_id, started_at);
CREATE INDEX IF NOT EXISTS idx_execution_logs_status ON public.execution_logs (status);

-- ---------------------------------------------------------------------
-- 7. Scheduled Jobs (cron-style jobs that fire workflows)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  cron_expression VARCHAR(100) NOT NULL,
  timezone        VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  workflow_id     UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  input           JSONB DEFAULT '{}'::JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  run_count       INT NOT NULL DEFAULT 0,
  failure_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tenant ON public.scheduled_jobs (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON public.scheduled_jobs (next_run_at)
  WHERE is_active = TRUE;

CREATE TRIGGER trg_scheduled_jobs_updated_at
  BEFORE UPDATE ON public.scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 009
-- =====================================================================
