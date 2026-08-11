-- =====================================================================
-- Migration 005: Orders Schema
-- =====================================================================
-- Purpose: Distributors, orders, order items, and commissions.
--
-- Run order: 5th (after 004_customers)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Distributors
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.distributors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  distributor_code VARCHAR(50) NOT NULL,
  company_name    VARCHAR(255) NOT NULL,
  contact_person  VARCHAR(255),
  email           CITEXT,
  phone           VARCHAR(20),
  alt_phone       VARCHAR(20),
  address_line1   VARCHAR(255),
  address_line2   VARCHAR(255),
  city            VARCHAR(100),
  state           VARCHAR(100),
  postal_code     VARCHAR(20),
  country         VARCHAR(2) NOT NULL DEFAULT 'IN',
  tax_id          VARCHAR(50),
  commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  tier            VARCHAR(20) NOT NULL DEFAULT 'BRONZE',  -- BRONZE, SILVER, GOLD, PLATINUM
  parent_distributor_id UUID REFERENCES public.distributors(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  joined_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  terminated_at   DATE,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_distributors_tenant_code
  ON public.distributors (tenant_id, distributor_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_distributors_tenant_email
  ON public.distributors (tenant_id, email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_distributors_tenant ON public.distributors (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_distributors_user ON public.distributors (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_distributors_status ON public.distributors (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_distributors_tier ON public.distributors (tier) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_distributors_parent ON public.distributors (parent_distributor_id) WHERE deleted_at IS NULL;

-- CHECK: commission 0-100
ALTER TABLE public.distributors ADD CONSTRAINT chk_distributors_commission_range
  CHECK (commission_rate >= 0 AND commission_rate <= 100);

CREATE TRIGGER trg_distributors_updated_at
  BEFORE UPDATE ON public.distributors
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Add FK from appointments to distributors (deferred from 004)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_distributor_id_fkey'
      AND table_name = 'appointments'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_distributor_id_fkey
      FOREIGN KEY (distributor_id) REFERENCES public.distributors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. OrderStatus enum (referenced by orders table)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE public.order_status AS ENUM (
      'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED',
      'CANCELLED', 'REFUNDED', 'RETURNED'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Orders
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  distributor_id  UUID REFERENCES public.distributors(id) ON DELETE SET NULL,
  order_number    VARCHAR(50) NOT NULL,
  status          public.order_status NOT NULL DEFAULT 'PENDING',
  subtotal        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax             DECIMAL(12, 2) NOT NULL DEFAULT 0,
  shipping        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'INR',
  shipping_address JSONB,
  billing_address  JSONB,
  payment_status  VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, PAID, PARTIALLY_PAID, REFUNDED, FAILED
  payment_method  VARCHAR(50),
  payment_id      VARCHAR(255),
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  notes           TEXT,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_number ON public.orders (tenant_id, order_number);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON public.orders (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders (customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_distributor ON public.orders (distributor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);

-- CHECK: total = subtotal + tax + shipping - discount
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_total CHECK (
  total = (subtotal + tax + shipping - discount)
);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Order Items
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_sku     VARCHAR(100) NOT NULL,  -- snapshot at order time
  product_name    VARCHAR(255) NOT NULL,  -- snapshot
  quantity        INT NOT NULL,
  unit_price      DECIMAL(12, 2) NOT NULL,
  tax_rate        DECIMAL(5, 2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  subtotal        DECIMAL(12, 2) NOT NULL,  -- quantity * unit_price
  total           DECIMAL(12, 2) NOT NULL,  -- subtotal + tax_amount - discount_amount
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON public.order_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);

-- CHECK: quantity positive, prices non-negative
ALTER TABLE public.order_items ADD CONSTRAINT chk_order_items_quantity CHECK (quantity > 0);
ALTER TABLE public.order_items ADD CONSTRAINT chk_order_items_subtotal CHECK (
  subtotal = quantity * unit_price
);
ALTER TABLE public.order_items ADD CONSTRAINT chk_order_items_total CHECK (
  total = (subtotal + tax_amount - discount_amount)
);

-- ---------------------------------------------------------------------
-- 5. Distributor Commissions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.distributor_commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  distributor_id  UUID NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  order_id        UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount          DECIMAL(12, 2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'INR',
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, PAID, CANCELLED
  paid_at         TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_distributor ON public.distributor_commissions (distributor_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_tenant ON public.distributor_commissions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commissions_order ON public.distributor_commissions (order_id);

CREATE TRIGGER trg_distributor_commissions_updated_at
  BEFORE UPDATE ON public.distributor_commissions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Shipments
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking_number VARCHAR(255),
  carrier         VARCHAR(100),
  shipping_method VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'CREATED',  -- CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, RETURNED
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  estimated_delivery TIMESTAMPTZ,
  cost            DECIMAL(10, 2),
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON public.shipments (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON public.shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON public.shipments (tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments (status);

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 005
-- =====================================================================
