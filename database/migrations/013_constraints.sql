-- =====================================================================
-- Migration 013: Constraints & Foreign Keys
-- =====================================================================
-- Purpose: Add CHECK constraints, deferred FKs, and exclusion constraints
--          that couldn't be added during initial table creation.
--
-- Run order: 13th (after 012_indexes)
-- Idempotent: YES (uses DO blocks to check existence)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Phone number format CHECK constraints
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_users_phone_format' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_phone_format
      CHECK (phone IS NULL OR phone ~ '^\+?[1-9][0-9]{6,14}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_customers_phone_format' AND table_name = 'customers'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT chk_customers_phone_format
      CHECK (phone IS NULL OR phone ~ '^\+?[1-9][0-9]{6,14}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_distributors_phone_format' AND table_name = 'distributors'
  ) THEN
    ALTER TABLE public.distributors
      ADD CONSTRAINT chk_distributors_phone_format
      CHECK (phone IS NULL OR phone ~ '^\+?[1-9][0-9]{6,14}$');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Currency code CHECK (3-letter ISO 4217)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_products_currency' AND table_name = 'products'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_currency
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_orders_currency' AND table_name = 'orders'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT chk_orders_currency
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Rating range CHECK (1-5 stars)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_product_reviews_rating_range' AND table_name = 'product_reviews'
  ) THEN
    ALTER TABLE public.product_reviews
      ADD CONSTRAINT chk_product_reviews_rating_range
      CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Customer LTV non-negative
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_customers_ltv_nonneg' AND table_name = 'customers'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT chk_customers_ltv_nonneg
      CHECK (lifetime_value >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Lead score range (0-100)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_leads_score_range' AND table_name = 'leads'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT chk_leads_score_range
      CHECK (score >= 0 AND score <= 100);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6. Notification priority valid values
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_notifications_priority' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT chk_notifications_priority
      CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7. Order status transitions (via trigger, not constraint)
--    Allowed transitions:
--    PENDING → CONFIRMED, CANCELLED
--    CONFIRMED → PROCESSING, CANCELLED
--    PROCESSING → SHIPPED, CANCELLED
--    SHIPPED → DELIVERED
--    DELIVERED → RETURNED, REFUNDED
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed TEXT[];
BEGIN
  v_allowed := CASE OLD.status
    WHEN 'PENDING'    THEN ARRAY['CONFIRMED', 'CANCELLED']::TEXT[]
    WHEN 'CONFIRMED'  THEN ARRAY['PROCESSING', 'CANCELLED']::TEXT[]
    WHEN 'PROCESSING' THEN ARRAY['SHIPPED', 'CANCELLED']::TEXT[]
    WHEN 'SHIPPED'    THEN ARRAY['DELIVERED']::TEXT[]
    WHEN 'DELIVERED'  THEN ARRAY['RETURNED', 'REFUNDED']::TEXT[]
    WHEN 'CANCELLED'  THEN ARRAY[]::TEXT[]
    WHEN 'RETURNED'   THEN ARRAY['REFUNDED']::TEXT[]
    WHEN 'REFUNDED'   THEN ARRAY[]::TEXT[]
    ELSE ARRAY[NEW.status]::TEXT[]
  END;

  IF NOT (NEW.status = ANY(v_allowed)) AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Invalid order status transition from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-set timestamp fields based on status
  IF NEW.status = 'CONFIRMED' AND OLD.status = 'PENDING' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at = NOW();
  ELSIF NEW.status = 'SHIPPED' AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at = NOW();
  ELSIF NEW.status = 'DELIVERED' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at = NOW();
  ELSIF NEW.status = 'CANCELLED' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_status_transition ON public.orders;
CREATE TRIGGER trg_orders_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_status_transition();

-- ---------------------------------------------------------------------
-- 8. Conversation ended_at auto-set when status changes to ENDED
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_conversation_ended_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ENDED' AND OLD.status != 'ENDED' AND NEW.ended_at IS NULL THEN
    NEW.ended_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_ended_at ON public.conversations;
CREATE TRIGGER trg_conversations_ended_at
  BEFORE UPDATE OF status ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_conversation_ended_at();

-- ---------------------------------------------------------------------
-- 9. Voice session ended_at + duration auto-set
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_voice_session_ended_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('ENDED', 'FAILED', 'CANCELLED')
     AND OLD.status NOT IN ('ENDED', 'FAILED', 'CANCELLED')
     AND NEW.ended_at IS NULL THEN
    NEW.ended_at = NOW();
    IF NEW.started_at IS NOT NULL AND NEW.duration_seconds IS NULL THEN
      NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INT;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_sessions_ended_at ON public.voice_sessions;
CREATE TRIGGER trg_voice_sessions_ended_at
  BEFORE UPDATE OF status ON public.voice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_voice_session_ended_at();

-- ---------------------------------------------------------------------
-- 10. Inventory consistency — prevent overselling
--     (Trigger: when order_item is created, reserve inventory)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_inventory_on_order_item()
RETURNS TRIGGER AS $$
DECLARE
  v_available INT;
BEGIN
  SELECT available INTO v_available
  FROM public.inventory
  WHERE product_id = NEW.product_id AND tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF v_available IS NULL THEN
    RAISE EXCEPTION 'No inventory record for product %', NEW.product_id;
  END IF;

  IF v_available < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient inventory for product %. Available: %, Requested: %',
      NEW.product_id, v_available, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reserve the stock
  UPDATE public.inventory
  SET reserved = reserved + NEW.quantity
  WHERE product_id = NEW.product_id AND tenant_id = NEW.tenant_id;

  -- Record transaction
  INSERT INTO public.inventory_transactions (
    tenant_id, product_id, quantity_change, reason, reference_type, reference_id
  ) VALUES (
    NEW.tenant_id, NEW.product_id, -NEW.quantity, 'SALE', 'ORDER', NEW.order_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_items_reserve_inventory ON public.order_items;
CREATE TRIGGER trg_order_items_reserve_inventory
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.reserve_inventory_on_order_item();

-- ---------------------------------------------------------------------
-- 11. Update customer LTV and order count when order is delivered
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_customer_stats_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DELIVERED' AND OLD.status != 'DELIVERED' THEN
    UPDATE public.customers
    SET lifetime_value = lifetime_value + NEW.total,
        total_orders = total_orders + 1
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_update_customer_stats ON public.orders;
CREATE TRIGGER trg_orders_update_customer_stats
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_stats_on_delivery();

-- ---------------------------------------------------------------------
-- 12. Maintain message_count on conversations
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.conversations
    SET message_count = message_count + 1,
        tokens_used = tokens_used + COALESCE(NEW.tokens_used, 0)
    WHERE id = NEW.conversation_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.conversations
    SET message_count = GREATEST(0, message_count - 1)
    WHERE id = OLD.conversation_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_update_count ON public.messages;
CREATE TRIGGER trg_messages_update_count
  AFTER INSERT OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_message_count();

COMMIT;

-- =====================================================================
-- End of Migration 013
-- =====================================================================
