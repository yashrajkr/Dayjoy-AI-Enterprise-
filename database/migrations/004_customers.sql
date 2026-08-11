-- =====================================================================
-- Migration 004: Customers Schema
-- =====================================================================
-- Purpose: Customer master data, addresses, and interactions.
--
-- Run order: 4th (after 003_products)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Customers
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_type   VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL',  -- INDIVIDUAL, BUSINESS
  company_name    VARCHAR(255),
  contact_person  VARCHAR(255),
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  email           CITEXT,
  phone           VARCHAR(20),
  alt_phone       VARCHAR(20),
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  date_of_birth   DATE,
  gender          VARCHAR(20),
  tax_id          VARCHAR(50),    -- GST, PAN, etc.
  source          VARCHAR(50),    -- WEBSITE, VOICE, WHATSAPP, REFERRAL
  source_id       UUID,           -- ID of the source record
  lifetime_value  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_orders    INT NOT NULL DEFAULT 0,
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_user ON public.customers (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers (email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_type ON public.customers (customer_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_tags ON public.customers USING GIN (tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING GIN (first_name gin_trgm_ops, last_name gin_trgm_ops) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Customer Addresses
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label       VARCHAR(50),  -- HOME, OFFICE, OTHER
  line1       VARCHAR(255) NOT NULL,
  line2       VARCHAR(255),
  city        VARCHAR(100) NOT NULL,
  state       VARCHAR(100),
  postal_code VARCHAR(20),
  country     VARCHAR(2) NOT NULL DEFAULT 'IN',
  latitude    DECIMAL(10, 7),
  longitude   DECIMAL(10, 7),
  is_default_shipping BOOLEAN NOT NULL DEFAULT FALSE,
  is_default_billing  BOOLEAN NOT NULL DEFAULT FALSE,
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant ON public.customer_addresses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON public.customer_addresses (customer_id);

CREATE TRIGGER trg_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Leads
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_id       UUID,  -- FK to lead_sources
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  email           CITEXT,
  phone           VARCHAR(20),
  company         VARCHAR(255),
  title           VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'NEW',  -- NEW, CONTACTED, QUALIFIED, CONVERTED, LOST
  score           INT NOT NULL DEFAULT 0,
  budget          DECIMAL(12, 2),
  expected_close_date DATE,
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}'::JSONB,
  converted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant ON public.leads (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Lead Sources
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  channel     VARCHAR(50),  -- VOICE, WHATSAPP, WEB, REFERRAL, SOCIAL, EMAIL
  cost_per_lead DECIMAL(10, 2),
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_sources_tenant_name ON public.lead_sources (tenant_id, name);

CREATE TRIGGER trg_lead_sources_updated_at
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Add FK from leads to lead_sources (added after lead_sources creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leads_source_id_fkey'
      AND table_name = 'leads'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Interactions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.interactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id         UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id             UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  type                VARCHAR(50) NOT NULL,  -- CALL, EMAIL, MEETING, MESSAGE, NOTE, WHATSAPP, VOICE
  direction           VARCHAR(10),  -- INBOUND, OUTBOUND
  subject             VARCHAR(255),
  description         TEXT,
  outcome             VARCHAR(100),
  duration_seconds    INT,
  follow_up_required  BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_date      TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_tenant ON public.interactions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_customer ON public.interactions (customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_lead ON public.interactions (lead_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON public.interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON public.interactions (type, created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_follow_up ON public.interactions (follow_up_date)
  WHERE follow_up_required = TRUE AND follow_up_date IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6. Follow-ups
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.follow_ups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  interaction_id  UUID NOT NULL REFERENCES public.interactions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, COMPLETED, CANCELLED
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant ON public.follow_ups (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_interaction ON public.follow_ups (interaction_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON public.follow_ups (user_id, status);

CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Support Tickets
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_to   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ticket_number VARCHAR(50) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  description   TEXT,
  priority      VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',  -- LOW, MEDIUM, HIGH, URGENT
  status        VARCHAR(20) NOT NULL DEFAULT 'OPEN',    -- OPEN, IN_PROGRESS, RESOLVED, CLOSED
  category      VARCHAR(100),
  channel       VARCHAR(50),  -- VOICE, WHATSAPP, EMAIL, WEB
  resolution    TEXT,
  resolved_at   TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_tenant_number ON public.support_tickets (tenant_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status ON public.support_tickets (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON public.support_tickets (customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON public.support_tickets (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.support_tickets (priority, created_at);

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 8. Appointments
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  distributor_id  UUID,  -- FK added in 005_orders
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  location        VARCHAR(255),
  meeting_link    TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED, COMPLETED, CANCELLED, NO_SHOW
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON public.appointments (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON public.appointments (customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned ON public.appointments (assigned_to, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments (status);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 004
-- =====================================================================
