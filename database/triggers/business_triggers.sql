-- =====================================================================
-- Database Triggers — Auto-update Logic
-- =====================================================================
-- These triggers enforce business rules at the database layer.
-- They are loaded AFTER migrations 001-014.
-- =====================================================================

-- Note: Many triggers were already created inline in migrations:
--   - trigger_set_updated_at (function in 001, triggers per table)
--   - validate_order_status_transition (013)
--   - set_conversation_ended_at (013)
--   - set_voice_session_ended_at (013)
--   - reserve_inventory_on_order_item (013)
--   - update_customer_stats_on_delivery (013)
--   - update_conversation_message_count (013)
--   - audit_trigger_fn (014)
--
-- This file contains ADDITIONAL triggers that are useful but
// optional for production.

-- ---------------------------------------------------------------------
-- 1. Auto-generate order_number on INSERT (if not provided)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := public.generate_order_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_set_number ON public.orders;
CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- ---------------------------------------------------------------------
-- 2. Auto-generate ticket_number on INSERT
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_ticket_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_set_number ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_set_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

-- ---------------------------------------------------------------------
-- 3. Auto-generate slug from name (products, categories)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_slug_from_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_set_slug ON public.products;
CREATE TRIGGER trg_products_set_slug
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_slug_from_name();

DROP TRIGGER IF EXISTS trg_product_categories_set_slug ON public.product_categories;
CREATE TRIGGER trg_product_categories_set_slug
  BEFORE INSERT ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_slug_from_name();

DROP TRIGGER IF EXISTS trg_knowledge_articles_set_slug ON public.knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_set_slug
  BEFORE INSERT ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_slug_from_name();

-- ---------------------------------------------------------------------
-- 4. Update inventory on order status change (release reserved stock
--    on cancellation, deduct on delivery)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_inventory_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
BEGIN
  -- On CANCEL: release reserved stock
  IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    FOR item IN SELECT * FROM public.order_items WHERE order_id = NEW.id LOOP
      UPDATE public.inventory
      SET reserved = GREATEST(0, reserved - item.quantity)
      WHERE product_id = item.product_id AND tenant_id = NEW.tenant_id;

      INSERT INTO public.inventory_transactions (
        tenant_id, product_id, quantity_change, reason, reference_type, reference_id
      ) VALUES (
        NEW.tenant_id, item.product_id, item.quantity, 'RETURN', 'ORDER', NEW.id
      );
    END LOOP;
  END IF;

  -- On DELIVERED: deduct from quantity (reserved already set on order_item insert)
  IF NEW.status = 'DELIVERED' AND OLD.status != 'DELIVERED' THEN
    FOR item IN SELECT * FROM public.order_items WHERE order_id = NEW.id LOOP
      UPDATE public.inventory
      SET
        quantity = GREATEST(0, quantity - item.quantity),
        reserved = GREATEST(0, reserved - item.quantity)
      WHERE product_id = item.product_id AND tenant_id = NEW.tenant_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_inventory_status ON public.orders;
CREATE TRIGGER trg_orders_inventory_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_inventory_on_order_status();

-- ---------------------------------------------------------------------
-- 5. Auto-update customer LTV + total_orders (denormalized counters)
--    On order INSERT, immediately add to customer's LTV (if PAID).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_customer_stats_on_order_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'PAID' THEN
    UPDATE public.customers
    SET lifetime_value = lifetime_value + NEW.total,
        total_orders = total_orders + 1
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_customer_stats_insert ON public.orders;
CREATE TRIGGER trg_orders_customer_stats_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_stats_on_order_insert();

-- ---------------------------------------------------------------------
-- 6. Auto-create distributor commission on order with distributor_id
--    Commission = order.total * distributor.commission_rate / 100
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_commission_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_rate DECIMAL(5, 2);
  v_amount DECIMAL(12, 2);
BEGIN
  IF NEW.distributor_id IS NOT NULL AND NEW.distributor_id IS DISTINCT FROM OLD.distributor_id THEN
    SELECT commission_rate INTO v_rate
    FROM public.distributors
    WHERE id = NEW.distributor_id;

    IF v_rate IS NOT NULL AND v_rate > 0 THEN
      v_amount := NEW.total * v_rate / 100;
      INSERT INTO public.distributor_commissions (
        tenant_id, distributor_id, order_id, amount, currency, status
      ) VALUES (
        NEW.tenant_id, NEW.distributor_id, NEW.id, v_amount, NEW.currency, 'PENDING'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_create_commission ON public.orders;
CREATE TRIGGER trg_orders_create_commission
  AFTER INSERT OR UPDATE OF distributor_id, total ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_commission_on_order();

-- ---------------------------------------------------------------------
-- 7. Update whatsapp_session last_message_at + message_count on msg insert
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_whatsapp_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.session_id IS NOT NULL THEN
    UPDATE public.whatsapp_sessions
    SET last_message_at = NEW.created_at,
        message_count = message_count + 1
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_messages_session_stats ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_messages_session_stats
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_session_stats();

-- ---------------------------------------------------------------------
-- 8. Update website_chat message_count + ended_at on status change
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_website_chat_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ENDED' AND OLD.status != 'ENDED' AND NEW.ended_at IS NULL THEN
    NEW.ended_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_website_chats_ended ON public.website_chats;
CREATE TRIGGER trg_website_chats_ended
  BEFORE UPDATE OF status ON public.website_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_website_chat_stats();

-- ---------------------------------------------------------------------
-- 9. Sync soft-delete: when a record is soft-deleted (deleted_at set),
--    also write an audit log entry
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (tenant_id, action, table_name, record_id, old_values, created_at)
    VALUES (
      NEW.tenant_id,
      'SOFT_DELETE',
      TG_TABLE_NAME,
      NEW.id,
      to_jsonb(OLD),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_soft_delete_customers ON public.customers;
CREATE TRIGGER trg_audit_soft_delete_customers
  AFTER UPDATE OF deleted_at ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

DROP TRIGGER IF EXISTS trg_audit_soft_delete_products ON public.products;
CREATE TRIGGER trg_audit_soft_delete_products
  AFTER UPDATE OF deleted_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

DROP TRIGGER IF EXISTS trg_audit_soft_delete_distributors ON public.distributors;
CREATE TRIGGER trg_audit_soft_delete_distributors
  AFTER UPDATE OF deleted_at ON public.distributors
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

DROP TRIGGER IF EXISTS trg_audit_soft_delete_users ON public.users;
CREATE TRIGGER trg_audit_soft_delete_users
  AFTER UPDATE OF deleted_at ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();
