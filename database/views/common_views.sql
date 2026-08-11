-- =====================================================================
-- Database Views — Common Query Patterns
-- =====================================================================
-- These views simplify common reporting queries and dashboards.
-- They are read-only (do not insert/update).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. v_active_customers — Customers with at least one order in last 90 days
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_active_customers AS
SELECT
  c.id, c.tenant_id, c.first_name, c.last_name, c.email, c.phone,
  c.customer_type, c.company_name, c.lifetime_value, c.total_orders,
  c.status, c.created_at,
  MAX(o.created_at) AS last_order_date,
  COUNT(o.id) AS recent_order_count
FROM public.customers c
LEFT JOIN public.orders o ON o.customer_id = c.id
  AND o.created_at >= NOW() - '90 days'::INTERVAL
  AND o.status NOT IN ('CANCELLED')
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.tenant_id, c.first_name, c.last_name, c.email, c.phone,
         c.customer_type, c.company_name, c.lifetime_value, c.total_orders,
         c.status, c.created_at;

-- ---------------------------------------------------------------------
-- 2. v_distributor_performance — Sales summary per distributor
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_distributor_performance AS
SELECT
  d.id AS distributor_id,
  d.tenant_id,
  d.distributor_code,
  d.company_name,
  d.contact_person,
  d.email,
  d.phone,
  d.tier,
  d.commission_rate,
  d.status,
  COUNT(DISTINCT o.id) AS total_orders,
  COALESCE(SUM(o.total), 0) AS total_revenue,
  COALESCE(SUM(dc.amount), 0) AS total_commission_earned,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.status = 'PAID'), 0) AS commission_paid,
  COALESCE(SUM(dc.amount) FILTER (WHERE dc.status = 'PENDING'), 0) AS commission_pending,
  COUNT(DISTINCT o.customer_id) AS unique_customers,
  AVG(o.total) AS avg_order_value,
  MAX(o.created_at) AS last_order_date
FROM public.distributors d
LEFT JOIN public.orders o ON o.distributor_id = d.id AND o.status != 'CANCELLED'
LEFT JOIN public.distributor_commissions dc ON dc.distributor_id = d.id
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.tenant_id, d.distributor_code, d.company_name, d.contact_person,
         d.email, d.phone, d.tier, d.commission_rate, d.status;

-- ---------------------------------------------------------------------
-- 3. v_order_summary — Orders with customer + distributor + item count
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_order_summary AS
SELECT
  o.id AS order_id,
  o.tenant_id,
  o.order_number,
  o.status,
  o.payment_status,
  o.total,
  o.currency,
  o.created_at,
  o.confirmed_at,
  o.shipped_at,
  o.delivered_at,
  c.id AS customer_id,
  c.first_name AS customer_first_name,
  c.last_name AS customer_last_name,
  c.email AS customer_email,
  c.phone AS customer_phone,
  d.id AS distributor_id,
  d.distributor_code,
  d.company_name AS distributor_company,
  COUNT(oi.id) AS item_count,
  SUM(oi.quantity) AS total_quantity
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id
LEFT JOIN public.distributors d ON d.id = o.distributor_id
LEFT JOIN public.order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.tenant_id, o.order_number, o.status, o.payment_status,
         o.total, o.currency, o.created_at, o.confirmed_at, o.shipped_at, o.delivered_at,
         c.id, c.first_name, c.last_name, c.email, c.phone,
         d.id, d.distributor_code, d.company_name;

-- ---------------------------------------------------------------------
-- 4. v_lead_pipeline — Leads grouped by status (sales funnel)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_lead_pipeline AS
SELECT
  l.tenant_id,
  l.status,
  COUNT(*) AS lead_count,
  AVG(l.score) AS avg_score,
  COUNT(*) FILTER (WHERE l.assigned_to IS NOT NULL) AS assigned_count,
  COUNT(*) FILTER (WHERE l.assigned_to IS NULL) AS unassigned_count,
  COUNT(DISTINCT l.source_id) AS source_count,
  MIN(l.created_at) AS oldest_lead,
  MAX(l.created_at) AS newest_lead
FROM public.leads l
GROUP BY l.tenant_id, l.status
ORDER BY l.tenant_id,
  CASE l.status
    WHEN 'NEW' THEN 1
    WHEN 'CONTACTED' THEN 2
    WHEN 'QUALIFIED' THEN 3
    WHEN 'CONVERTED' THEN 4
    WHEN 'LOST' THEN 5
  END;

-- ---------------------------------------------------------------------
-- 5. v_voice_call_summary — Voice call analytics per tenant
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_voice_call_summary AS
SELECT
  vs.tenant_id,
  DATE(vs.started_at) AS call_date,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE vs.outcome = 'COMPLETED') AS completed_calls,
  COUNT(*) FILTER (WHERE vs.outcome = 'TRANSFERRED') AS transferred_calls,
  COUNT(*) FILTER (WHERE vs.outcome = 'ABANDONED') AS abandoned_calls,
  COUNT(*) FILTER (WHERE vs.outcome = 'FAILED') AS failed_calls,
  AVG(vs.duration_seconds) AS avg_duration_seconds,
  SUM(vs.duration_seconds) AS total_duration_seconds,
  COALESCE(SUM(vs.cost_usd), 0) AS total_cost_usd,
  COUNT(DISTINCT vs.customer_id) AS unique_customers_called
FROM public.voice_sessions vs
GROUP BY vs.tenant_id, DATE(vs.started_at);

-- ---------------------------------------------------------------------
-- 6. v_conversation_summary — AI conversation metrics per tenant
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_conversation_summary AS
SELECT
  conv.tenant_id,
  conv.channel,
  conv.status,
  COUNT(*) AS conversation_count,
  AVG(conv.message_count) AS avg_messages_per_conversation,
  SUM(conv.tokens_used) AS total_tokens_used,
  AVG(EXTRACT(EPOCH FROM (COALESCE(conv.ended_at, NOW()) - conv.started_at))) AS avg_duration_seconds,
  COUNT(DISTINCT conv.customer_id) AS unique_customers,
  COUNT(DISTINCT conv.user_id) AS unique_users
FROM public.conversations conv
GROUP BY conv.tenant_id, conv.channel, conv.status;

-- ---------------------------------------------------------------------
-- 7. v_low_stock_products — Products at or below reorder threshold
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_low_stock_products AS
SELECT
  p.id AS product_id,
  p.tenant_id,
  p.sku,
  p.name,
  p.price,
  p.currency,
  p.status,
  i.quantity,
  i.reserved,
  i.available,
  i.low_stock_threshold,
  CASE
    WHEN i.available = 0 THEN 'OUT_OF_STOCK'
    WHEN i.available <= i.low_stock_threshold THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END AS stock_status
FROM public.products p
JOIN public.inventory i ON i.product_id = p.id
WHERE p.deleted_at IS NULL
  AND i.available <= i.low_stock_threshold;

-- ---------------------------------------------------------------------
-- 8. v_user_activity — Recent user activity (last 30 days)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_user_activity AS
SELECT
  u.id AS user_id,
  u.tenant_id,
  u.email,
  u.first_name,
  u.last_name,
  u.role,
  u.status,
  u.last_login_at,
  u.created_at,
  COUNT(DISTINCT al.id) AS activity_count_30d,
  MAX(al.created_at) AS last_activity_at,
  COUNT(DISTINCT al.id) FILTER (WHERE al.activity_type = 'LOGIN') AS login_count_30d
FROM public.users u
LEFT JOIN public.activity_logs al
  ON al.user_id = u.id
  AND al.created_at >= NOW() - '30 days'::INTERVAL
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.tenant_id, u.email, u.first_name, u.last_name,
         u.role, u.status, u.last_login_at, u.created_at;

-- ---------------------------------------------------------------------
-- 9. v_daily_revenue — Revenue by day per tenant
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_daily_revenue AS
SELECT
  o.tenant_id,
  DATE(o.created_at) AS revenue_date,
  COUNT(*) AS order_count,
  SUM(o.subtotal) AS total_subtotal,
  SUM(o.tax) AS total_tax,
  SUM(o.shipping) AS total_shipping,
  SUM(o.discount) AS total_discount,
  SUM(o.total) AS total_revenue,
  AVG(o.total) AS avg_order_value,
  COUNT(DISTINCT o.customer_id) AS unique_customers
FROM public.orders o
WHERE o.status NOT IN ('CANCELLED')
GROUP BY o.tenant_id, DATE(o.created_at);

-- ---------------------------------------------------------------------
-- 10. v_unread_notifications — Unread notifications per user
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_unread_notifications AS
SELECT
  n.tenant_id,
  n.user_id,
  COUNT(*) AS unread_count,
  MAX(n.created_at) AS latest_unread_at,
  COUNT(*) FILTER (WHERE n.priority = 'URGENT') AS urgent_count,
  COUNT(*) FILTER (WHERE n.priority = 'HIGH') AS high_count,
  COUNT(*) FILTER (WHERE n.priority = 'NORMAL') AS normal_count,
  COUNT(*) FILTER (WHERE n.priority = 'LOW') AS low_count
FROM public.notifications n
WHERE n.status IN ('QUEUED', 'SENT', 'DELIVERED')
  AND n.read_at IS NULL
GROUP BY n.tenant_id, n.user_id;
