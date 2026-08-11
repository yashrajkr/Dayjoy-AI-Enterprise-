-- =====================================================================
-- Migration 003: Products Schema
-- =====================================================================
-- Purpose: Product catalog, categories, inventory, and reviews.
--
-- Run order: 3rd (after 002_auth)
-- Idempotent: YES
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Product Categories (hierarchical via parent_id)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(200) NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_tenant_slug
  ON public.product_categories (tenant_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_tenant ON public.product_categories (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON public.product_categories (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_sort ON public.product_categories (tenant_id, sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Products
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  sku             VARCHAR(100) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) NOT NULL,
  description     TEXT,
  short_description VARCHAR(500),
  price           DECIMAL(12, 2) NOT NULL,
  cost            DECIMAL(12, 2),
  compare_at_price DECIMAL(12, 2),
  currency        VARCHAR(3) NOT NULL DEFAULT 'INR',
  tax_rate        DECIMAL(5, 2) DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  images          JSONB DEFAULT '[]'::JSONB,
  attributes      JSONB DEFAULT '{}'::JSONB,
  tags            TEXT[] DEFAULT '{}',
  search_vector   TSVECTOR,
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_sku
  ON public.products (tenant_id, sku) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_slug
  ON public.products (tenant_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products (price) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_tags ON public.products USING GIN (tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products USING GIN (search_vector) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING GIN (name gin_trgm_ops) WHERE deleted_at IS NULL;

-- CHECK: price must be non-negative
ALTER TABLE public.products ADD CONSTRAINT chk_products_price_nonneg CHECK (price >= 0);

-- Trigger to keep search_vector up to date
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', name, description);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Inventory (one row per product, tracks stock)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity        INT NOT NULL DEFAULT 0,
  reserved        INT NOT NULL DEFAULT 0,  -- held for pending orders
  available       INT GENERATED ALWAYS AS (quantity - reserved) STORED,
  low_stock_threshold INT NOT NULL DEFAULT 10,
  warehouse_location VARCHAR(100),
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_tenant_product ON public.inventory (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON public.inventory (tenant_id)
  WHERE available <= low_stock_threshold;

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- CHECK: quantity and reserved must be non-negative
ALTER TABLE public.inventory ADD CONSTRAINT chk_inventory_quantity_nonneg CHECK (quantity >= 0);
ALTER TABLE public.inventory ADD CONSTRAINT chk_inventory_reserved_nonneg CHECK (reserved >= 0);

-- ---------------------------------------------------------------------
-- 4. Inventory Transactions (audit trail of stock changes)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_change INT NOT NULL,  -- positive = stock in, negative = stock out
  reason          VARCHAR(50) NOT NULL,  -- PURCHASE, SALE, RETURN, ADJUSTMENT, TRANSFER
  reference_type  VARCHAR(50),  -- ORDER, PURCHASE_ORDER, ADJUSTMENT
  reference_id    UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_txn_tenant ON public.inventory_transactions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_txn_product ON public.inventory_transactions (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_txn_reason ON public.inventory_transactions (reason);

-- ---------------------------------------------------------------------
-- 5. Product Reviews
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id UUID,
  rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title       VARCHAR(255),
  body        TEXT,
  verified    BOOLEAN NOT NULL DEFAULT FALSE,
  helpful_count INT NOT NULL DEFAULT 0,
  reported_count INT NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_customer
  ON public.product_reviews (product_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_rating ON public.product_reviews (tenant_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON public.product_reviews (product_id, created_at);

CREATE TRIGGER trg_product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

COMMIT;

-- =====================================================================
-- End of Migration 003
-- =====================================================================
