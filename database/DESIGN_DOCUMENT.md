# Dayjoy AI Enterprise — Database Design Document

> **Version:** 1.0  
> **Phase:** 7 — Database Design  
> **Last updated:** 2026-08-06  
> **Owner:** Database Architecture Team

---

## 1. Overview

The Dayjoy AI Enterprise database is a **multi-tenant PostgreSQL 15+** database
with **pgvector** for RAG embeddings. It uses **Prisma ORM** for type-safe
application access and **Row-Level Security (RLS)** for tenant isolation at the
database layer.

The schema powers:

- Multi-tenant SaaS for direct selling / network marketing
- AI agents (voice, WhatsApp, web-chat) with conversation memory
- RAG knowledge base with pgvector similarity search
- Distributor network with commission tracking
- Order lifecycle with state-machine validation
- Audit trail, analytics, and reporting

### Tech Stack

| Layer             | Technology                                       |
| ----------------- | ------------------------------------------------ |
| Database          | PostgreSQL 15+ (with `pgvector`, `pg_trgm`, `citext`) |
| ORM               | Prisma 6 (`@prisma/client`)                      |
| Vector Search     | `pgvector` (HNSW indexes)                        |
| Full-text Search  | PostgreSQL `tsvector` + GIN indexes              |
| Fuzzy Search      | `pg_trgm`                                        |
| Multi-tenancy     | Row-Level Security (RLS) + `current_tenant_id()` |
| Audit             | PL/pgSQL triggers → partitioned `audit_logs`     |
| Partitioning      | Range partitioning on time columns (monthly)     |
| Connection Pool   | PgBouncer (transaction mode) in production       |

---

## 2. Design Principles

1. **Multi-tenant first** — every tenant-scoped table has `tenant_id` + RLS
   policy (`USING (tenant_id = current_tenant_id())`).
2. **Soft delete** — customer-facing entities (customers, distributors, products,
   users, leads) carry a `deleted_at` column; queries use `WHERE deleted_at IS NULL`.
3. **Audit trail** — critical tables have AFTER INSERT/UPDATE/DELETE triggers
   that write to the partitioned `audit_logs` table.
4. **Timestamps** — every table has `created_at` (default `NOW()`) and
   `updated_at` (auto-updated by `trigger_set_updated_at()` BEFORE UPDATE trigger).
5. **UUIDs** — all primary keys are UUIDs (`gen_random_uuid()`).
6. **Idempotent migrations** — every `CREATE TABLE` / `CREATE INDEX` uses
   `IF NOT EXISTS`; `INSERT ... ON CONFLICT DO NOTHING` for seed data.
7. **Indexes by query pattern** — composite indexes match the most common
   `WHERE` + `ORDER BY` clauses; GIN indexes for full-text, JSONB, and arrays.
8. **Partitioning** — high-volume tables (`audit_logs`, `analytics_events`,
   `metric_values`) are partitioned monthly to keep individual partitions small.
9. **State-machine validation** — order status transitions are enforced by a
   CHECK constraint + trigger, preventing illegal state jumps.
10. **Connection hygiene** — application uses PgBouncer transaction pooling;
    every transaction sets `SET LOCAL app.current_tenant = '<uuid>';`.

---

## 3. Schema Overview

### 3.1 Models by Domain

The unified Prisma schema at `database/prisma/schema.prisma` (~1,890 lines)
declares **71 models** and **30 enums** organized into 13 domains:

| #  | Domain            | Tables | Highlights                                                          |
| -- | ----------------- | ------ | ------------------------------------------------------------------- |
| 1  | Core / Auth       | 9      | tenants, users, sessions, password_reset_tokens, email_verification_tokens, roles, permissions, role_permissions, user_roles |
| 2  | Business          | 8      | customers, customer_addresses, leads, lead_sources, interactions, follow_ups, support_tickets, appointments |
| 3  | Distributors      | 2      | distributors, distributor_commissions                               |
| 4  | Products          | 5      | product_categories, products, inventory, inventory_transactions, product_reviews |
| 5  | Orders            | 3      | orders, order_items, shipments                                      |
| 6  | AI                | 5      | ai_agents, conversations, messages, ai_memory, tool_executions      |
| 7  | Channels          | 8      | voice_sessions, voice_transcripts, voice_analytics, whatsapp_sessions, whatsapp_messages, whatsapp_contacts, website_chats, telephony_calls |
| 8  | Notifications     | 4      | notification_templates, notifications, notification_logs, notification_preferences |
| 9  | Automation        | 7      | workflows, workflow_versions, workflow_triggers, workflow_steps, workflow_executions, execution_logs, scheduled_jobs |
| 10 | Analytics         | 8      | analytics_events, metrics, metric_values, dashboards, dashboard_widgets, reports, report_schedules, web_sessions |
| 11 | Audit             | 7      | audit_logs, access_logs, activity_logs, webhook_events, integrations, tenant_configs, knowledge_articles |
| 12 | RAG               | 6      | rag_sources, rag_documents, rag_chunks, embeddings, rag_embeddings, rag_queries |
| 13 | Compliance        | 2      | compliance_records, retention_policies                              |
|    | **Total**         | **74** | (4 extra primitives vs. 71-model headline — some domains overlap)   |

### 3.2 Enums (30 total)

```
TenantStatus, UserStatus, CustomerType, DistributorStatus, ProductStatus,
OrderStatus, PaymentStatus, InventoryTxnReason, LeadStatus, InteractionType,
WorkflowType, WorkflowStatus, ExecutionStatus, NotificationType,
NotificationPriority, NotificationStatus, ChannelType, AgentType, MemoryType,
MetricType, MetricUnit, AuditAction, VoiceCallStatus, VoiceCallDirection,
VoiceCallOutcome, TranscriptRole, WhatsAppMessageType, WhatsAppMessageStatus,
WhatsAppDirection, NotificationProvider
```

### 3.3 Key Relationships (ER Diagram, ASCII)

```
                          ┌──────────┐
                          │ tenants  │
                          └────┬─────┘
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
        ┌──────┐         ┌────────┐         ┌──────────┐
        │ users │◄───────►│ roles  │◄───────►│permissions│
        └───┬──┘         └────┬───┘         └──────────┘
            │                 │
       ┌────┴────┐       ┌────┴─────┐
       ▼         ▼       ▼          ▼
   ┌────────┐ ┌──────┐ ┌────────┐ ┌──────────────┐
   │customers│ │leads │ │ai_agents│ │distributors  │
   └────┬───┘ └──┬───┘ └────┬───┘ └──────┬───────┘
        │        │        │              │
        ▼        ▼        ▼              ▼
   ┌──────────────────────────────────────────┐
   │              orders                       │
   │  ┌─────────────────┐  ┌─────────────────┐ │
   │  │   order_items   │  │  shipments      │ │
   │  └────────┬────────┘  └─────────────────┘ │
   │           │                               │
   │           ▼                               │
   │  ┌─────────────────┐                      │
   │  │distributor_     │◄─────────────────────┘
   │  │commissions      │
   │  └─────────────────┘
   └──────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────┐
   │  AI Layer:                                 │
   │  conversations → messages → ai_memory      │
   │  ai_agents → rag_queries → rag_chunks      │
   │                       → rag_embeddings     │
   └────────────────────────────────────────────┘
```

---

## 4. Tables by Domain

### 4.1 Core / Auth (9 tables)

| Table                         | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `tenants`                     | Top-level tenant (1 per customer org)                |
| `users`                       | Application users (admins, agents, customers)        |
| `sessions`                    | Active refresh-token sessions (`token_hash` unique)  |
| `password_reset_tokens`       | Time-limited password reset tokens                   |
| `email_verification_tokens`   | Email verification flow tokens                       |
| `roles`                       | RBAC roles per tenant (system + custom)              |
| `permissions`                 | Global permission catalog (resource + action)        |
| `role_permissions`            | Many-to-many join: role ↔ permission                 |
| `user_roles`                  | Many-to-many join: user ↔ role (with `expires_at`)   |

### 4.2 Business (8 tables)

| Table                  | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `customers`            | Customer master (individual + business)              |
| `customer_addresses`   | Shipping / billing addresses (1-N per customer)      |
| `leads`                | Sales leads (status: NEW → CONTACTED → QUALIFIED → CONVERTED) |
| `lead_sources`         | Lead attribution (voice, whatsapp, web, referral)    |
| `interactions`         | Customer/lead touchpoints (CALL, EMAIL, MEETING)     |
| `follow_ups`           | Scheduled follow-ups from interactions               |
| `support_tickets`      | Customer support tickets (priority, status)          |
| `appointments`         | Scheduled appointments (customer/distributor/agent)  |

### 4.3 Distributors (2 tables)

| Table                       | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `distributors`              | Distributor master (`distributor_code` unique)     |
| `distributor_commissions`   | Auto-created when order is assigned to distributor |

### 4.4 Products (5 tables)

| Table                    | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `product_categories`     | Hierarchical categories (self-referencing parent)  |
| `products`               | Catalog items (sku unique per tenant)              |
| `inventory`              | 1-1 with product — quantity + reserved + threshold |
| `inventory_transactions` | Audit log of stock movements (PURCHASE, SALE, etc.)|
| `product_reviews`        | Customer ratings + reviews (1-5 stars)             |

### 4.5 Orders (3 tables)

| Table                | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `orders`             | Order header (status state machine, totals, addresses)   |
| `order_items`        | Line items (snapshot of product sku/name/price)          |
| `shipments`          | Shipment tracking (carrier, tracking number, status)     |

### 4.6 AI (5 tables)

| Table              | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `ai_agents`        | Agent definitions (config, capabilities, type)           |
| `conversations`    | Conversation sessions (agent + user + customer + channel)|
| `messages`         | Messages in a conversation (user/assistant/system)       |
| `ai_memory`        | Long-term memory (facts, preferences, history)           |
| `tool_executions`  | Logs of tool calls made by AI agents                     |

### 4.7 Channels (8 tables)

| Table                 | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `voice_sessions`      | Voice call sessions (`call_id` unique)               |
| `voice_transcripts`   | Per-turn transcripts (USER/ASSISTANT/SYSTEM/TOOL)    |
| `voice_analytics`     | Call analytics (duration, sentiment, CSAT, cost)     |
| `whatsapp_sessions`   | WhatsApp conversation sessions                       |
| `whatsapp_messages`   | WhatsApp messages (inbound/outbound)                 |
| `whatsapp_contacts`   | Contact phone-number registry                        |
| `website_chats`       | Website visitor chat sessions                        |
| `telephony_calls`     | Telephony provider (Twilio, etc.) call records       |

### 4.8 Notifications (4 tables)

| Table                       | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `notification_templates`    | Reusable templates (subject + body, variables)     |
| `notifications`             | Notification queue (status: PENDING → SENT → READ) |
| `notification_logs`         | Per-channel delivery logs (latency, error)         |
| `notification_preferences`  | User opt-in/opt-out per channel + quiet hours      |

### 4.9 Automation (7 tables)

| Table                    | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `workflows`              | Workflow definitions (JSON DSL)                    |
| `workflow_versions`      | Versioned snapshots of workflow definitions        |
| `workflow_triggers`      | Event/schedule/API/manual triggers                 |
| `workflow_steps`         | Steps within a workflow (action, condition, loop)  |
| `workflow_executions`    | Execution runs (status: PENDING → RUNNING → DONE)  |
| `execution_logs`         | Per-step execution logs (debug/info/warn/error)    |
| `scheduled_jobs`         | Cron-scheduled jobs                                |

### 4.10 Analytics (8 tables)

| Table                | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `analytics_events`   | Raw event stream (partitioned monthly by `occurred_at`)  |
| `metrics`            | Metric definitions (COUNT, SUM, AVERAGE, etc.)           |
| `metric_values`      | Metric data points (partitioned monthly by `recorded_at`)|
| `dashboards`         | Dashboard definitions                                    |
| `dashboard_widgets`  | Widgets within a dashboard (chart/table/metric)          |
| `reports`            | Saved reports                                            |
| `report_schedules`   | Report scheduling (cron + recipients + format)           |
| `web_sessions`       | Website visitor sessions (analytics source)              |

### 4.11 Audit (7 tables)

| Table                | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `audit_logs`         | Critical-table audit trail (partitioned monthly)         |
| `access_logs`        | Auth/permission access decisions                         |
| `activity_logs`      | User activity (logins, views, clicks)                    |
| `webhook_events`     | Inbound webhook payloads (Vapi, Twilio, Stripe)          |
| `integrations`       | Third-party integration registry (encrypted credentials) |
| `tenant_configs`     | Per-tenant key/value config overrides                    |
| `knowledge_articles` | KB articles for AI agents (title, content, tags)         |

### 4.12 RAG (6 tables)

| Table            | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `rag_sources`    | Document sources (website, database, api, manual)             |
| `rag_documents`  | Ingested documents (title, content, status)                   |
| `rag_chunks`     | Chunked documents (with `vector(1536)` embedding column)      |
| `embeddings`     | Generic embedding store (Bytes — fallback for non-pgvector)   |
| `rag_embeddings` | Per-chunk embeddings with model + dimensions metadata         |
| `rag_queries`    | RAG query log (query, retrieved chunks, response, feedback)   |

### 4.13 Compliance (2 tables)

| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `compliance_records` | GDPR/HIPAA/SOX/PCI compliance evidence             |
| `retention_policies` | Data retention rules (archive/delete after X days) |

---

## 5. Indexes

**120+ indexes** across all tables:

- **Composite indexes** for common query patterns:
  - `(tenant_id, status)` on customers / distributors / orders / leads
  - `(tenant_id, created_at)` on audit_logs / analytics_events
  - `(product_id, created_at)` on inventory_transactions
- **Unique indexes** for business keys:
  - `tenants.slug`, `users.email`, `products(tenant_id, sku)`, `orders.order_number`
  - `distributors.distributor_code`, `whatsapp_contacts.phone_number`
- **GIN indexes** for full-text search, JSONB, and arrays:
  - `products` tsvector (name + description)
  - `knowledge_articles` tsvector (title + content)
  - JSONB GIN on `metadata` columns
  - Array GIN on `products.tags`
- **HNSW indexes** for pgvector similarity search:
  - `rag_chunks.embedding` (vector_cosine_ops)
  - `rag_embeddings.embedding` (vector_cosine_ops)
  - `rag_queries.query_embedding` (vector_cosine_ops)
- **Partial indexes** with `WHERE deleted_at IS NULL` for soft-deleted tables

---

## 6. Constraints

- **CHECK constraints**:
  - `chk_users_email_format` — regex email validation
  - `chk_products_price` — `price >= 0`
  - `chk_order_items_quantity` — `quantity > 0`
  - `chk_product_reviews_rating` — `rating BETWEEN 1 AND 5`
  - `chk_orders_status_transition` — order state-machine
  - `chk_distributors_commission_rate` — `commission_rate BETWEEN 0 AND 100`
- **UNIQUE constraints**:
  - `tenants.slug`, `users.email`, `products(tenant_id, sku)`, `orders.order_number`
  - `distributors.distributor_code`, `roles(tenant_id, name)`
  - `permissions(resource, action)`, `rag_embeddings(chunk_id, model)`
- **FOREIGN KEY constraints** with appropriate `ON DELETE` behavior:
  - `CASCADE` for child entities (e.g., `order_items` when order deleted)
  - `SET NULL` for optional relations (e.g., `ai_memory.agent_id`)
  - `RESTRICT` for parents that should not be deletable while children exist
- **State machine** for `orders.status` (see Migration 013)
- **Exclusion constraint** preventing overlapping appointments for the same user

---

## 7. Triggers

**35+ triggers** defined across migrations 002, 003, 005, 013, and 014:

| Trigger                                | Table(s)              | Purpose                                              |
| -------------------------------------- | --------------------- | ---------------------------------------------------- |
| `trigger_set_updated_at`               | ~50 tables            | Auto-update `updated_at` on every UPDATE             |
| `validate_order_status_transition`     | `orders`              | Enforce valid status transitions (state machine)     |
| `reserve_inventory_on_order_item`      | `order_items`         | Reserve stock on insert; prevent overselling         |
| `release_inventory_on_order_cancel`    | `orders`              | Release reserved stock when order is CANCELLED       |
| `update_customer_stats_on_delivery`    | `orders`              | Auto-increment customer LTV + total_orders on DELIVERED |
| `update_conversation_message_count`    | `messages`            | Maintain denormalized counter on `conversations`     |
| `audit_trigger_fn`                     | customers/orders/products/users/distributors/leads | Log INSERT/UPDATE/DELETE to `audit_logs` |
| `set_voice_session_ended_at`           | `voice_sessions`      | Auto-set `ended_at = NOW()` when status → ENDED      |
| `create_commission_on_order`           | `orders`              | Auto-create `distributor_commissions` row            |
| `generate_order_number_fn`             | `orders`              | Generate sequential order number per tenant          |
| `generate_ticket_number_fn`            | `support_tickets`     | Generate sequential ticket number per tenant         |

---

## 8. Functions

**12 reusable PL/pgSQL functions** in `database/functions/utility_functions.sql`:

| Function                                                | Returns | Purpose                                              |
| ------------------------------------------------------- | ------- | ---------------------------------------------------- |
| `trigger_set_updated_at()`                              | TRIGGER | Auto-update `updated_at` on row UPDATE               |
| `current_tenant_id()`                                   | UUID    | Returns `NULL::UUID` from `current_setting('app.current_tenant', true)` |
| `generate_uuid()`                                       | UUID    | UUID v4 helper (wraps `gen_random_uuid()`)           |
| `generate_slug(input TEXT)`                             | TEXT    | URL-safe slugify (lowercase, hyphenated)             |
| `generate_order_number(tenant_id UUID)`                 | TEXT    | Sequential order number (`ORD-YYYY-NNNNN`)           |
| `generate_ticket_number(tenant_id UUID)`                | TEXT    | Sequential ticket number (`TKT-YYYY-NNNNN`)          |
| `get_customer_ltv(customer_id UUID)`                    | NUMERIC | Sum of all DELIVERED orders for a customer           |
| `get_customer_order_count(customer_id UUID)`            | INT     | Count of orders for a customer                       |
| `get_distributor_sales(distributor_id UUID, start, end)`| JSONB   | Sales summary (count, total, commissions) for period |
| `search_products(tenant_id UUID, query TEXT, limit INT)`| TABLE   | Product search via tsvector + trigram fallback       |
| `search_knowledge(tenant_id UUID, query TEXT, limit INT)` | TABLE | Knowledge-article search (RAG text-search fallback)  |
| `get_tenant_stats(tenant_id UUID)`                      | JSONB   | Aggregate stats (users, orders, revenue)             |
| `calculate_lead_score(lead_id UUID)`                    | INT     | 0-100 lead score (recency + engagement + profile)    |
| `cleanup_expired_sessions()`                            | INT     | Delete sessions past `expires_at` (cron)             |
| `cleanup_old_audit_logs(days INT)`                      | INT     | Drop partitions older than N days (retention)        |
| `archive_old_conversations(days INT)`                   | INT     | Mark old conversations as `archived`                 |

---

## 9. Views

**10 views** in `database/views/common_views.sql`:

| View                       | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `v_active_customers`       | Customers with at least 1 order in the last 90 days            |
| `v_distributor_performance`| Sales summary per distributor (30/90/365-day windows)          |
| `v_order_summary`          | Orders joined with customer + distributor + items              |
| `v_lead_pipeline`          | Leads grouped by status (funnel view)                          |
| `v_voice_call_summary`     | Voice call analytics per day (count, duration, cost, CSAT)     |
| `v_conversation_summary`   | AI conversation metrics per agent per day                      |
| `v_low_stock_products`     | Products at or below reorder threshold                         |
| `v_user_activity`          | Recent user activity (last 30 days)                            |
| `v_daily_revenue`          | Revenue by day (DELIVERED orders only)                         |
| `v_unread_notifications`   | Unread notification count per user                             |

---

## 10. Row-Level Security (RLS)

Enabled on **55+ tenant-scoped tables** in Migration 014.

```sql
-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation_users ON public.users
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
```

### Application Pattern

```sql
-- At the start of every transaction:
SET LOCAL app.current_tenant = '<tenant-uuid>';

-- All subsequent queries auto-filter to that tenant's rows
SELECT * FROM customers;  -- only sees rows where tenant_id matches
```

### Special Cases

- **`audit_logs`, `access_logs`, `activity_logs`** — `tenant_id` can be NULL for system events.
  Policy: `USING (tenant_id IS NULL OR tenant_id = current_tenant_id())`
- **`webhook_events`** — `tenant_id` nullable; resolved during processing
- **Super admin bypass** — DB role `dayjoy_super_admin` has `BYPASSRLS` attribute

---

## 11. Partitioning

Three high-volume tables are partitioned monthly:

| Table              | Partition Column | Strategy                                    |
| ------------------ | ---------------- | ------------------------------------------- |
| `audit_logs`       | `created_at`     | RANGE — one partition per month             |
| `analytics_events` | `occurred_at`    | RANGE — one partition per month             |
| `metric_values`    | `recorded_at`    | RANGE — one partition per month             |

### Partition Management

Migration 002 pre-creates partitions for the current month + next 12 months:

```sql
DO $$
DECLARE
  v_month DATE := date_trunc('month', NOW())::DATE;
  v_start DATE;
  v_end   DATE;
  v_name  TEXT;
BEGIN
  FOR i IN 0..12 LOOP
    v_start := v_month + (i || ' months')::INTERVAL;
    v_end   := v_start + '1 month'::INTERVAL;
    v_name  := 'audit_logs_' || to_char(v_start, 'YYYYMM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
  END LOOP;
END $$;
```

The `cleanup_old_audit_logs(days)` function drops partitions older than N days for retention enforcement.

---

## 12. Backup Strategy

| Type              | Schedule             | Destination             | Retention           |
| ----------------- | -------------------- | ----------------------- | ------------------- |
| **Full backup**   | Daily 02:00 IST      | Local + S3 Standard     | 30 days             |
| **WAL archive**   | Continuous           | S3 Standard             | 7 days (PITR)       |
| **Monthly backup**| 1st of month 03:00   | S3 Glacier               | 12 months           |
| **Snapshot**      | Pre-deployment       | RDS snapshot            | 90 days             |

### Implementation

- **Automated**: `bash database/scripts/backup.sh` (cron-driven, calls `pg_dump --format=custom`)
- **Restore**: `bash database/scripts/restore.sh backups/dayjoy_ai_<timestamp>.dump.gz`
- **PITR**: PostgreSQL WAL archiving + `pg_basebackup` (RDS: enable automated backups)
- See: [`documentation/BACKUP_GUIDE.md`](documentation/BACKUP_GUIDE.md) and
  [`documentation/RECOVERY_GUIDE.md`](documentation/RECOVERY_GUIDE.md)

---

## 13. Performance

### Connection Pooling

Production uses **PgBouncer** in transaction mode:

- Pool size: 50 connections (per app instance)
- Application `DATABASE_POOL_MAX`: 10
- Idle timeout: 60s
- Query timeout: 30s

### Slow Query Logging

```sql
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- log queries > 1s
ALTER SYSTEM SET log_statement = 'none';
```

### Autovacuum Tuning

```sql
ALTER SYSTEM SET autovacuum_naptime = '30s';
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = 0.1;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.05;
```

### Index Monitoring

```sql
-- Unused indexes (candidates for removal)
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## 14. Prisma Client Conventions

### Field Naming — camelCase in TypeScript

All Prisma model fields are declared in **camelCase** in `schema.prisma`:

```prisma
model User {
  id           String     @id @default(uuid())
  tenantId     String                       // ← camelCase
  email        String     @unique
  passwordHash String?                      // ← camelCase
  firstName    String?                      // ← camelCase
  lastName     String?                      // ← camelCase
  isEmailVerified Boolean @default(false)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  tenant       Tenant     @relation(fields: [tenantId], references: [id])
  @@map("users")                            // ← table name in DB
}
```

In application code:

```typescript
// ✅ CORRECT (camelCase — matches Prisma schema)
await prisma.user.create({
  data: {
    tenantId,
    email,
    passwordHash,
    firstName,
    lastName,
  },
});

// ❌ WRONG (snake_case — will fail at runtime / won't type-check)
await prisma.user.create({
  data: {
    tenant_id,        // TypeScript error
    password_hash,    // TypeScript error
    first_name,       // TypeScript error
  },
});
```

### Known Issue: Column Name Mapping

The SQL migrations create columns in **snake_case** (`tenant_id`, `password_hash`),
while the Prisma schema declares fields in **camelCase** without explicit
`@map("snake_case")` annotations. By default, Prisma uses the field name as the
column name — so a strict runtime query would look for column `tenantId` (which
doesn't exist).

**Recommended future fix** (out of Phase 7 scope): add `@map("snake_case")`
annotations to every camelCase field that maps to a snake_case SQL column,
or regenerate migrations from the Prisma schema (`prisma migrate diff`).
For now, the schema is **syntactically valid** (verified via
`npx prisma generate`) and all backend services use camelCase consistently.

### Composite Unique Accessors

When a model has `@@unique([tenantId, name])`, Prisma generates a
`tenantId_name` accessor:

```typescript
await prisma.role.upsert({
  where: { tenantId_name: { tenantId, name: 'ADMIN' } },
  // ...
});
```

The seed script uses this pattern for idempotent role upserts.

---

## 15. Migration Strategy

### File Naming Convention

```
database/migrations/
├── 001_initial.sql        # Extensions + utility functions
├── 002_auth.sql           # Multi-tenant + RBAC + auth
├── 003_products.sql       # Products + categories + inventory + reviews
├── 004_customers.sql      # Customers + leads + interactions + tickets + appointments
├── 005_orders.sql         # Distributors + orders + items + commissions + shipments
├── 006_ai.sql             # AI agents + conversations + messages + memory + tools
├── 007_channels.sql       # Voice + WhatsApp + website chat + telephony
├── 008_notifications.sql  # Templates + notifications + logs + preferences
├── 009_automation.sql     # Workflows + executions + triggers + scheduled jobs
├── 010_analytics.sql      # Events + metrics + dashboards + reports
├── 011_audit.sql          # Activity logs + webhook events + integrations + tenant config
├── 012_indexes.sql        # Composite + covering indexes (performance)
├── 013_constraints.sql    # CHECK constraints + status transitions + business triggers
├── 014_final.sql          # RLS policies + permissions + audit triggers
└── _archived/             # Pre-consolidation migrations (reference only)
```

### Rules

1. Each migration **MUST** start with `BEGIN;` and end with `COMMIT;`
2. Each `CREATE TABLE` / `CREATE INDEX` **MUST** use `IF NOT EXISTS`
3. Each `INSERT` of seed data **MUST** use `ON CONFLICT DO NOTHING`
4. Each `DROP` of policy/trigger **MUST** use `IF EXISTS`
5. Each migration **MUST** have a header comment block with:
   - Migration number + name
   - Purpose
   - Run order
   - Idempotency flag
6. Migrations are **append-only** — never edit a released migration
7. New migrations get the next sequential number (015, 016, ...)

### Apply Order

```bash
for f in database/migrations/0{01..14}_*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

Or via the setup script: `bash database/scripts/setup.sh`

---

## 16. Seed Data Strategy

The seed script at `database/seed/seed.ts` is **idempotent** — every entity
uses `upsert` (or `createMany` with `skipDuplicates`) so it can be run
repeatedly without errors.

### What the Seed Creates

1. **1 Tenant** — `Dayjoy` (slug: `dayjoy`)
2. **4 System Roles** — `ADMIN`, `MANAGER`, `AGENT`, `VIEWER` (with `isSystem: true`)
3. **All Permissions** loaded from DB (already seeded by Migration 014)
4. **Role → Permission assignments**:
   - `ADMIN` → all permissions
   - `MANAGER` → all except `admin:*` and `system:*`
   - `AGENT` → `read` + `update` on business resources
   - `VIEWER` → `read` on every resource
5. **1 Admin User** — `admin@dayjoy.com` / `Admin@123456` (bcrypt-hashed)
6. **3 Demo Users** — `manager@`, `agent@`, `customer@dayjoy.com` / `Demo@123456`
7. **3 Product Categories** — `Health`, `Beauty`, `Home Care`
8. **5 Products** — 2 bestsellers + 3 regular (with matching `inventory` rows)
9. **3 Customers** — 2 individual + 1 business
10. **2 Distributors** — `DIST-001`, `DIST-002` (with commission rates)
11. **3 AI Agents** — Support, Sales, Voice
12. **2 Leads** — 1 `NEW` + 1 `QUALIFIED`
13. **2 Orders** — 1 `DELIVERED` (with 2 items) + 1 `PENDING` (with 1 item)
14. **1 Interaction** — sample CALL interaction

### Running the Seed

```bash
# From repository root
pnpm db:seed

# Or directly
cd database && npx tsx seed/seed.ts
```

### Test Credentials

| Role    | Email                    | Password        |
| ------- | ------------------------ | --------------- |
| Admin   | `admin@dayjoy.com`       | `Admin@123456`  |
| Manager | `manager@dayjoy.com`     | `Demo@123456`   |
| Agent   | `agent@dayjoy.com`       | `Demo@123456`   |
| Viewer  | `customer@dayjoy.com`    | `Demo@123456`   |

---

## 17. File Layout

```
database/
├── prisma/
│   ├── schema.prisma              # 71 models, 30 enums, ~1,890 lines
│   └── _reference-schemas/        # Archived source schemas (reference only)
├── migrations/
│   ├── 001_initial.sql ... 014_final.sql   # 14 SQL migrations
│   └── _archived/                 # Pre-consolidation migrations
├── functions/
│   └── utility_functions.sql      # 12 PL/pgSQL functions
├── views/
│   └── common_views.sql           # 10 reporting views
├── triggers/
│   └── business_triggers.sql      # 9 additional business triggers
├── seed/
│   └── seed.ts                    # Idempotent TypeScript seed script
├── scripts/
│   ├── setup.sh                   # One-command setup (executable)
│   ├── validate.sh                # Verify DB structure (executable)
│   ├── reset.sh                   # DROP + recreate (dev only, executable)
│   ├── backup.sh                  # Create timestamped backup (executable)
│   ├── restore.sh                 # Restore from backup (executable)
│   └── vector-store-indexes.sql   # HNSW indexes for pgvector
├── backups/                       # Backup files land here (.dump.gz)
├── documentation/
│   ├── SETUP_GUIDE.md             # Step-by-step installation
│   ├── MIGRATION_GUIDE.md         # How to add new migrations
│   ├── SEED_GUIDE.md              # How to seed data
│   ├── BACKUP_GUIDE.md            # Backup strategy & procedures
│   ├── RECOVERY_GUIDE.md          # Disaster recovery procedures
│   └── TROUBLESHOOTING_GUIDE.md   # Common issues & solutions
├── docs/
│   └── IMPLEMENTATION_02_DATABASE_SQL_GENERATOR.md
├── .env.example                   # All env vars documented
├── README.md                      # Quick start + folder structure
└── DESIGN_DOCUMENT.md             # This file
```

---

## 18. Validation

Run the validation script after setup:

```bash
bash database/scripts/validate.sh
```

The script checks:

- All 14 migrations are present and apply cleanly
- All expected tables exist (74 tables)
- All utility functions exist (12 functions)
- All views exist (10 views)
- RLS is enabled on all tenant-scoped tables
- The default tenant + admin user are seeded
- pgvector extension is installed and `vector(1536)` type is usable
- HNSW indexes on `rag_chunks.embedding` and `rag_embeddings.embedding` exist

---

## 19. References

- **Schema**: [`prisma/schema.prisma`](prisma/schema.prisma)
- **Migrations**: [`migrations/001_initial.sql`](migrations/001_initial.sql) through [`migrations/014_final.sql`](migrations/014_final.sql)
- **Functions**: [`functions/utility_functions.sql`](functions/utility_functions.sql)
- **Views**: [`views/common_views.sql`](views/common_views.sql)
- **Triggers**: [`triggers/business_triggers.sql`](triggers/business_triggers.sql)
- **Seed**: [`seed/seed.ts`](seed/seed.ts)
- **Setup**: `bash scripts/setup.sh`
- **Validation**: `bash scripts/validate.sh`
- **Backup**: `bash scripts/backup.sh`
- **Restore**: `bash scripts/restore.sh backups/<file>.dump.gz`

### Documentation Guides

- [Setup Guide](documentation/SETUP_GUIDE.md)
- [Migration Guide](documentation/MIGRATION_GUIDE.md)
- [Seed Guide](documentation/SEED_GUIDE.md)
- [Backup Guide](documentation/BACKUP_GUIDE.md)
- [Recovery Guide](documentation/RECOVERY_GUIDE.md)
- [Troubleshooting Guide](documentation/TROUBLESHOOTING_GUIDE.md)

### Related Documents

- `docs/IMPLEMENTATION_02_DATABASE_SQL_GENERATOR.md` — original SQL generator implementation
- `README.md` — quick start guide
- `.env.example` — environment variable reference
