-- =====================================================================
-- Database Functions — Utility & Business Logic
-- =====================================================================
-- These functions implement reusable business logic at the database
-- layer. They are used by the application code via Prisma's
-- $queryRaw() or by triggers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_customer_ltv(p_customer_id UUID) — Lifetime value of a customer
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_ltv(p_customer_id UUID)
RETURNS DECIMAL(12, 2) AS $$
DECLARE
  v_ltv DECIMAL(12, 2);
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_ltv
  FROM public.orders
  WHERE customer_id = p_customer_id
    AND status IN ('DELIVERED', 'SHIPPED')
    AND payment_status = 'PAID';
  RETURN v_ltv;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 2. get_customer_order_count(p_customer_id UUID)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_order_count(p_customer_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.orders
  WHERE customer_id = p_customer_id
    AND status != 'CANCELLED';
  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 3. get_distributor_sales(p_distributor_id UUID, p_start DATE, p_end DATE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_distributor_sales(
  p_distributor_id UUID,
  p_start DATE DEFAULT NULL,
  p_end DATE DEFAULT NULL
) RETURNS TABLE (
  total_orders BIGINT,
  total_revenue DECIMAL(12, 2),
  total_commission DECIMAL(12, 2),
  avg_order_value DECIMAL(12, 2)
) AS $$
BEGIN
  SELECT
    COUNT(o.id)::BIGINT,
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(dc.amount), 0),
    COALESCE(AVG(o.total), 0)
  INTO
    total_orders, total_revenue, total_commission, avg_order_value
  FROM public.orders o
  LEFT JOIN public.distributor_commissions dc ON dc.order_id = o.id
  WHERE o.distributor_id = p_distributor_id
    AND o.status NOT IN ('CANCELLED')
    AND (p_start IS NULL OR o.created_at::DATE >= p_start)
    AND (p_end IS NULL OR o.created_at::DATE <= p_end);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 4. search_products(p_tenant_id UUID, p_query TEXT, p_limit INT)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_products(
  p_tenant_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
) RETURNS SETOF public.products AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.products
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
    AND status = 'ACTIVE'
    AND (
      name ILIKE '%' || p_query || '%'
      OR description ILIKE '%' || p_query || '%'
      OR sku ILIKE '%' || p_query || '%'
      OR search_vector @@ plainto_tsquery('pg_catalog.english', p_query)
    )
  ORDER BY
    (similarity(name, p_query) + similarity(description, p_query)) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 5. search_knowledge(p_tenant_id UUID, p_query TEXT, p_limit INT)
--    Fallback text search when pgvector is not configured.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_knowledge(
  p_tenant_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 5
) RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  document_title VARCHAR,
  content TEXT,
  score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    d.title,
    c.content,
    ts_rank(c.search_vector, plainto_tsquery('pg_catalog.english', p_query))::REAL
  FROM public.rag_chunks c
  JOIN public.rag_documents d ON d.id = c.document_id
  WHERE c.tenant_id = p_tenant_id
    AND d.status = 'READY'
    AND c.search_vector @@ plainto_tsquery('pg_catalog.english', p_query)
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 6. generate_ticket_number(p_tenant_id UUID)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_ticket_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_seq BIGINT;
  v_year TEXT := to_char(NOW(), 'YYYY');
BEGIN
  SELECT nextval('public.ticket_number_seq') INTO v_next_seq;
  RETURN 'TKT-' || v_year || '-' || lpad(v_next_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1 INCREMENT 1;

-- ---------------------------------------------------------------------
-- 7. cleanup_expired_sessions() — Cron job: revoke expired sessions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.sessions
  WHERE expires_at < NOW()
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 8. cleanup_expired_tokens() — Cron job: delete used/expired tokens
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.password_reset_tokens WHERE expires_at < NOW();
  DELETE FROM public.email_verification_tokens WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 9. cleanup_old_audit_logs(p_days INT) — Retention policy
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_days INT DEFAULT 365)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.audit_logs WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 10. get_tenant_stats(p_tenant_id UUID)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_stats(p_tenant_id UUID)
RETURNS TABLE (
  total_users BIGINT,
  active_users BIGINT,
  total_customers BIGINT,
  total_distributors BIGINT,
  total_products BIGINT,
  total_orders BIGINT,
  total_revenue DECIMAL(12, 2),
  total_leads BIGINT,
  open_tickets BIGINT,
  total_conversations BIGINT,
  total_voice_calls BIGINT,
  total_whatsapp_messages BIGINT
) AS $$
BEGIN
  SELECT
    (SELECT COUNT(*) FROM public.users WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM public.users WHERE tenant_id = p_tenant_id AND status = 'ACTIVE' AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM public.customers WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM public.distributors WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM public.products WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM public.orders WHERE tenant_id = p_tenant_id),
    COALESCE((SELECT SUM(total) FROM public.orders WHERE tenant_id = p_tenant_id AND status = 'DELIVERED'), 0),
    (SELECT COUNT(*) FROM public.leads WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM public.support_tickets WHERE tenant_id = p_tenant_id AND status IN ('OPEN', 'IN_PROGRESS')),
    (SELECT COUNT(*) FROM public.conversations WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM public.voice_sessions WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM public.whatsapp_messages WHERE tenant_id = p_tenant_id)
  INTO
    total_users, active_users, total_customers, total_distributors,
    total_products, total_orders, total_revenue, total_leads,
    open_tickets, total_conversations, total_voice_calls, total_whatsapp_messages;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------
-- 11. calculate_lead_score(p_lead_id UUID)
--    Simple lead scoring: 0-100 based on data completeness + engagement
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_lead_score(p_lead_id UUID)
RETURNS INT AS $$
DECLARE
  v_score INT := 0;
  v_lead RECORD;
  v_interactions INT;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Email provided: +20
  IF v_lead.email IS NOT NULL THEN v_score := v_score + 20; END IF;
  -- Phone provided: +20
  IF v_lead.phone IS NOT NULL THEN v_score := v_score + 20; END IF;
  -- Company provided: +15
  IF v_lead.company IS NOT NULL THEN v_score := v_score + 15; END IF;
  -- Budget specified: +15
  IF v_lead.budget IS NOT NULL AND v_lead.budget > 0 THEN v_score := v_score + 15; END IF;
  -- Expected close date: +10
  IF v_lead.expected_close_date IS NOT NULL THEN v_score := v_score + 10; END IF;
  -- Engagement (interactions): up to +20
  SELECT COUNT(*) INTO v_interactions FROM public.interactions WHERE lead_id = p_lead_id;
  v_score := v_score + LEAST(v_interactions * 5, 20);

  -- Update the lead
  UPDATE public.leads SET score = v_score WHERE id = p_lead_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 12. archive_old_conversations(p_days INT)
--    Archives conversations older than N days (status ACTIVE → ARCHIVED)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_old_conversations(p_days INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.conversations
  SET status = 'ARCHIVED',
      ended_at = COALESCE(ended_at, NOW())
  WHERE status = 'ACTIVE'
    AND started_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
