# Database, Memory & Knowledge Base — Deep Audit

> **Audit type:** Research-only (no files were modified)
> **Scope:** `database/prisma/schema.prisma` + 18 active migrations + `backend/ai/memory.service.*` + `backend/knowledge/*` + `rag/ingestion/*` + `rag/memory/*` + `rag/security/*` + `packages/knowledge-base/`
> **Auditor role:** Principal Database Architect & AI Memory Systems Engineer
> **Date:** 2025-08-09

---

## Executive Summary

| Subsystem | Score | Verdict |
|---|---|---|
| **Database schema** | **5.5 / 10** | Two parallel schemas (Prisma vs SQL) drifting apart. Production SQL is solid; Prisma schema used by the NestJS backend is missing ~30 columns, soft-deletes, RLS, and several critical indexes. |
| **AI memory system** | **4.0 / 10** | Bare CRUD + importance-descending retrieval. No episodic/procedural split, no Redis hot tier, no PII detection, no consolidation, no right-to-be-forgotten, no embedding-based recall. |
| **Knowledge base** | **6.5 / 10** | The `rag/` package is genuinely well-engineered (token-aware chunking, 6 loaders, HNSW indexes, per-doc ACL, batch ingest). The `backend/knowledge/knowledge.service.ts` is a *separate, simpler* reimplementation with character-based chunking that diverges from the `rag/` pipeline. No versioning, no OCR, no PPTX/XLSX. |
| **Combined critical gaps** | **14** | (see §"Combined recommendations" for the prioritized list) |

**Headline finding:** the codebase contains **two competing implementations** of nearly every subsystem:

- **Database:** raw SQL migrations (`database/migrations/*.sql`) vs Prisma schema (`database/prisma/schema.prisma`). Migrations 017 and 018 are themselves bug-fixes for known Prisma↔SQL drift on `users.role` and `orders.currency`.
- **Memory:** `backend/ai/memory.service.ts` (CRUD + 5-record context) vs `rag/memory/conversation-memory.service.ts` (short-term + long-term + LLM extraction + summarization). The richer implementation in `rag/` is **not wired into the conversation flow** — `ConversationsService.sendMessage` calls the dumber `MemoryService.getContextForConversation`.
- **Knowledge:** `backend/knowledge/knowledge.service.ts` (1000-char chunks, raw SQL writes, `processed`/`archived`/`DELETED` statuses) vs `rag/ingestion/ingestion-service.ts` (token-aware chunks via `gpt-tokenizer`, `PROCESSING`/`READY`/`FAILED` statuses, batch ingest). The two services use **incompatible status vocabularies** for the same `RagDocument.status` column.

---

## Part 1: Database Schema

### 1.1 Findings (with table:column references)

#### 1.1.1 Model completeness — 70 models defined, not 63

`grep "^model " schema.prisma` returns **70 models** (lines 192–1876), not the 63 claimed in the audit brief:

```
Tenant, User, UserSession, Role, Permission, RolePermission, UserRole,
Customer, Distributor, ProductCategory, Product, Inventory,
InventoryTransaction, Order, OrderItem, Shipment, Lead, Interaction,
FollowUp, AiAgent, Conversation, Message, AiMemory, RagSource,
RagDocument, RagChunk, Embedding, VoiceSession, VoiceRecording,
WhatsappContact, WhatsappSession, WhatsappMessage, WebSession, WebEvent,
NotificationTemplate, Notification, NotificationLog, NotificationPreference,
Workflow, WorkflowStep, WorkflowTrigger, WorkflowExecution, ExecutionLog,
Metric, MetricValue, AnalyticsEvent, Report, ReportSchedule, Dashboard,
DashboardWidget, AuditLog, DataChange, AccessLog, ComplianceRecord,
RetentionPolicy, VoiceTranscript, VoiceAnalytics, RagEmbedding, RagQuery,
SupportTicket, Appointment, ProductReview, DistributorCommission,
KnowledgeArticle, LeadSource, Integration, WebhookEvent, TenantConfig,
Employee, PasswordResetToken, EmailVerificationToken
```

The schema's own footer (line 1881) understates this as "60+ models" — out of date.

#### 1.1.2 Massive Prisma ↔ SQL migration drift

This is the most serious finding. The Prisma schema and the SQL migrations describe **two different databases**:

| Issue | Prisma (`schema.prisma`) | SQL migrations | Impact |
|---|---|---|---|
| **Soft-delete column** | Missing on **all 70 models** (no `deletedAt`) | Present on every tenant-scoped table (`002_auth.sql:26,58`, `003_products.sql:29,68`, `010_analytics.sql:153,212`) | Prisma queries cannot honour the partial indexes `WHERE deleted_at IS NULL`. App-level "soft delete" via `status='archived'` (knowledge.service.ts:191) is inconsistent with DB-level soft delete. |
| **`users.email` uniqueness** | `@unique` (line 276) → global uniqueness across tenants | `uq_users_tenant_email ON users(tenant_id, email) WHERE deleted_at IS NULL` (`002_auth.sql:61`) | **Production-blocker**: two tenants cannot share an email. The SQL is correct (tenant-scoped); the Prisma schema is wrong. |
| **`users.passwordHash`** | `String?` nullable (line 277) | `password_hash VARCHAR(255) NOT NULL` (`002_auth.sql:44`) | Prisma allows nulls the DB rejects. Migration 018 had to be cut just to fix `users.role` default drift; this is the next ticking bomb. |
| **`users.email_verified_at`, `failed_login_count`, `locked_until`, `phone_verified_at`, `metadata`** | All missing | All present (`002_auth.sql:51–55`) | The security-hardening columns (failed-login lockout, metadata for MFA) cannot be used from the NestJS layer. |
| **`conversations.message_count`, `tokens_used`** | Missing (lines 744–762) | Present (`006_ai.sql:58–59`), maintained by trigger `trg_messages_update_count` (`013_constraints.sql:331`) | The trigger updates columns Prisma doesn't know about — Prisma `findUnique` will not return them. |
| **`products.search_vector` (TSVECTOR) + GIN index** | Missing | Present with auto-update trigger (`003_products.sql:64,80,87–90`) | Full-text product search exists in DB but is unreachable via Prisma typed API. |
| **`inventory.available`** (generated column) | Missing | `GENERATED ALWAYS AS (quantity - reserved) STORED` (`003_products.sql:106`) | Trigger `reserve_inventory_on_order_item` (`013_constraints.sql:245–279`) reads `available` — Prisma cannot express this. |
| **`customers.lifetime_value`, `total_orders`** | Missing | Present (`013_constraints.sql:108,294–296` trigger updates them) | LTV-based segmentation impossible from Prisma. Migration 012 (`012_indexes.sql:33`) adds an index on `lifetime_value` that Prisma doesn't see. |
| **`ai_memory` CHECK on importance** | None | `CHECK (importance >= 1 AND importance <= 10)` (`006_ai.sql:117`) | `dto/memory.dto.ts:39` uses `@Min(0)` — DTO would allow `importance=0` that the DB rejects (error surfaces as a 500 not a 400). |
| **`ai_memory.type` allowed values** | enum `{FACT,PREFERENCE,HISTORY,CONTEXT}` (line 162) | SQL comment says `PREFERENCE, FACT, CONTEXT, SUMMARY` (`006_ai.sql:114`) — `SUMMARY` not in Prisma enum | `ConversationMemoryService.summarizeConversation` (`rag/memory/conversation-memory.service.ts:206`) writes `type: 'CONTEXT'` with a `// SUMMARY isn't in the Prisma enum yet` comment — explicit acknowledgement of drift. |
| **Audit logs partitioning** | Plain table (`schema.prisma:1372`) | `PARTITION BY RANGE (created_at)` with 13 monthly partitions (`002_auth.sql:217–236`) | Prisma cannot query partitioned tables without raw SQL; the audit table will silently break Prisma reads. |
| **`Embedding` model** (`schema.prisma:872`) | `embedding Bytes` (binary blob) | No matching table — SQL uses native `vector(1536)` on `rag_chunks.embedding` and `rag_embeddings.embedding` (`006_ai.sql` / `_archived/004_rag_chunks_pgvector.sql`) | The `Embedding` Prisma model is a **dead model** that doesn't exist in the DB. Any Prisma query against it will fail. |
| **`VoiceSession.outcome`** | Missing | Referenced in `012_indexes.sql:94` (`idx_voice_sessions_tenant_outcome`) | Index on a column Prisma doesn't expose. |
| **`analytics_events.event_name`, `occurred_at`** | Missing (`schema.prisma:1278–1293` uses `eventType`/`timestamp`) | `idx_analytics_events_tenant_name_occurred` (`012_indexes.sql:130`) | Index references nonexistent columns; will fail at CREATE INDEX time. |
| **`metric_values.recorded_at`** | Uses `timestamp` (line 1272) | `idx_metric_values_metric_recorded` references `recorded_at` (`012_indexes.sql:136`) | Same issue. |
| **`webhook_events.received_at`** | Uses `createdAt` (line 1792) | `idx_webhook_events_unprocessed_received` references `received_at` (`012_indexes.sql:142`) | Same issue. |
| **`notifications.recipient` NOT NULL** | Missing entirely (line 1057–1097) | `recipient VARCHAR(255) NOT NULL` (`008_notifications.sql:55`) | Prisma `create` won't supply the column → SQL INSERT fails. |
| **`notifications.status` enum values** | `NotificationStatus` enum = `PENDING/SENDING/SENT/FAILED/CANCELLED` (line 134) | SQL default = `'QUEUED'`, CHECK includes `QUEUED, SENT, DELIVERED, READ, FAILED` (`008_notifications.sql:56`) | DB rows created by SQL default (`QUEUED`) won't match Prisma enum — read failure. |
| **`order_items.productSku`, `productName` denormalized columns** | Present in Prisma (line 603–604) | **Missing from SQL** (`005_orders.sql`) — Prisma writes will fail. | Inverse drift. |
| **`Order.paymentStatus` String** | `String @default("PENDING")` (line 572) — `PaymentStatus` enum (line 61) is **defined but unused** | SQL uses VARCHAR | Dead enum. |
| **`Conversation.status` String `"active"`** | lower-case string (line 756) | SQL CHECK/trigger expects `'ENDED'` (upper-case, `013_constraints.sql:204`) | `conversations.service.ts:272` writes `status: 'ended'` — **trigger will fire but the case mismatch means `NEW.status = 'ENDED'` comparison fails** → `ended_at` never stamped. |
| **`VoiceSession.status`** | default `'active'` (line 895) | trigger expects `'ENDED'|'FAILED'|'CANCELLED'` (`013_constraints.sql:223`) | Same case bug. |
| **`Shipment.status`** | `'CREATED'` (line 629) | — | Inconsistent with other tables using lowercase. |
| **`AiAgent.status`** | `'active'` lowercase (line 733) | SQL default `'ACTIVE'` (`006_ai.sql:28`) | Same drift pattern as `users.role` (which migration 018 had to fix). |
| **`RagDocument.status`** | default `'processed'` (line 842) | `knowledge.service.ts:279` writes `'processed'`; `ingestion-service.ts:96` writes `'PROCESSING'`; `ingestion-service.ts:138` writes `'READY'`; `ingestion-service.ts:276` writes `'DELETED'` | **Four inconsistent status vocabularies** on the same column. |
| **`Tenant.metadata`** | Missing | `metadata JSONB DEFAULT '{}'::JSONB` on tenants (`002_auth.sql:23`) | Cannot store tenant-level config in DB. |
| **`Order.metadata`, `Customer.metadata`** | Missing | Present in SQL | Same. |
| **`User.role` default** | `@default("user")` lowercase (line 282) | `DEFAULT 'USER'` (`002_auth.sql:48`); migration 018 changed SQL to `'USER'` and backfilled lowercase values | **Prisma side never updated** — new Prisma inserts will recreate the lowercase drift migration 018 was written to fix. |

#### 1.1.3 Indexing strategy — good in SQL, missing in Prisma

The SQL side has the right idea:

- **Composite indexes** on tenant + status + createdAt for every hot table (`012_indexes.sql:18,27,39,51,66,75,90,108,118,124,130`).
- **Partial indexes** `WHERE deleted_at IS NULL` on every soft-delete table (`003_products.sql:33–36,72–81`).
- **GIN indexes** on `products.tags`, `products.search_vector`, `products.name gin_trgm_ops` (`003_products.sql:79–81`).
- **HNSW + GIN vector indexes** (`scripts/vector-store-indexes.sql:13–16,26,31,35` and `_archived/004_rag_chunks_pgvector.sql`).

But:

- The HNSW index file lives in `database/scripts/vector-store-indexes.sql` — **not in any numbered migration**, and **references `ai.rag_chunks` schema** while the rest of the codebase uses `public.rag_chunks`. Either it targets a different schema (`ai`) or it's broken.
- `chunking-schema.sql:23–24` has the HNSW index **commented out** ("Enable HNSW after creating pgvector extension").
- The Prisma schema declares **no indexes at all** on: `messages(tenantId, createdAt)`, `ai_memory(tenantId, createdAt)`, `ai_memory(userId, createdAt)`, `ai_memory(customerId, createdAt)`, `ai_memory(agentId, createdAt)`, `ai_memory(expiresAt)` — these exist in SQL (`006_ai.sql:124–128`) but Prisma doesn't express them, so Prisma-generated migrations would never create them. App code doing `prisma.aiMemory.findMany({where:{userId}})` will table-scan.
- `RagChunk` has only `@@index([documentId])` and `@@index([tenantId])` (lines 867–868) — no composite `(tenantId, documentId)` and **no vector index** declared in Prisma.
- `Message` has only `@@index([conversationId, createdAt])` (line 789) — no `(tenantId, createdAt)` composite for tenant-wide scans.
- `AuditLog`, `DataChange`, `AccessLog`, `WebhookEvent`, `AnalyticsEvent`, `MetricValue` — **zero `@@index` declarations** in Prisma despite high write volume.
- `User.email` is `@unique` globally (line 276) but no index on `(tenantId, email)` to support the actual tenant-scoped uniqueness in SQL.
- No `@@index` on `Customer.email`, `Customer.phone`, `Distributor.email`, `Lead.email` despite these being common lookup paths.

#### 1.1.4 Enum consistency

- **22 enums defined in Prisma** (lines 19–188, 1467–1620).
- **30 enums defined in SQL** (no native enum types — SQL uses `VARCHAR + CHECK` constraints, e.g. `006_ai.sql:117` `CHECK (importance >= 1 AND importance <= 10)`).
- Drift:
  - `MemoryType` enum (Prisma line 162): `FACT, PREFERENCE, HISTORY, CONTEXT` — missing `SUMMARY` (referenced in `006_ai.sql:114` comment and in `conversation-memory.service.ts:15,206`).
  - `NotificationStatus` enum: includes `PENDING, SENDING, SENT, FAILED, CANCELLED` — DB uses `QUEUED, SENT, DELIVERED, READ, FAILED`.
  - `PaymentStatus` enum: defined (line 61) but the only column that should use it (`Order.paymentStatus`, line 572) is `String`.
  - `Customer.status` is `String @default("active")` (line 407), not a `CustomerStatus` enum.
  - `Distributor.status` *does* use `DistributorStatus` enum (line 441) — inconsistent with `Customer`.
  - Several `String` status columns (`Shipment.status`, `FollowUp.status`, `SupportTicket.priority/status`, `Appointment.status`, `WebEvent.*`, `WorkflowTrigger.status`, `Metric.status`, `Report.status`, `Dashboard.status`, `ComplianceRecord.status`, `RetentionPolicy.status`, `LeadSource.status`, `Integration.status`, `WebhookEvent.*`, `TenantConfig.*`, `Employee.status`, `KnowledgeArticle.status`) should be enums for type safety.
  - `AuditAction` enum is `INSERT/UPDATE/DELETE` (line 184), but `DataChange.operation` uses it (line 1398) while `AuditLog.action` also uses it (line 1378) — `AccessLog.action` is plain `String` (line 1416). Inconsistent.

#### 1.1.5 Relations — onDelete actions mostly missing

Only **10 of ~110 relations** declare `onDelete`:

| Model | Relation | onDelete |
|---|---|---|
| `AiMemory.agent` (line 797) | `SetNull` | ✓ |
| `VoiceTranscript.session` (line 1498) | `Cascade` | ✓ |
| `VoiceAnalytics.session` (line 1513) | `Cascade` | ✓ |
| `RagEmbedding.chunk` (line 1544) | `Cascade` | ✓ |
| `ProductReview.product` (line 1684) | `Cascade` | ✓ |
| `TenantConfig.tenant` (line 1807) | `Cascade` | ✓ |
| `Employee.tenant` (line 1823) | `Cascade` | ✓ |
| `Employee.user` (line 1825) | `SetNull` | ✓ |
| `PasswordResetToken.tenant/user` (lines 1848, 1850) | `Cascade` | ✓ |
| `EmailVerificationToken.tenant/user` (lines 1864, 1866) | `Cascade` | ✓ |

**Every other relation defaults to `Restrict`** (Prisma's default). Consequence: deleting a `Tenant` will fail because every dependent row (`User`, `Customer`, `Order`, etc.) blocks it. SQL migrations use `ON DELETE CASCADE` for tenant FKs (`002_auth.sql:42`, `003_products.sql:18,48`, `006_ai.sql:18,49,84,111,112,113`) — Prisma schema does not match.

`onUpdate` actions are not declarable in Prisma (Postgres defaults to `NO ACTION`), so this isn't an issue per se.

#### 1.1.6 Multi-tenancy — strong in SQL, weak in Prisma

- **SQL side**: Every tenant-scoped table has `tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`. Migration `014_final.sql:18–61` enables RLS + creates `tenant_isolation_<table>` policies using `current_tenant_id()` GUC. This is best-in-class.
- **Prisma side**:
  - Every model has `tenantId` — good.
  - But Prisma has **no awareness of RLS**. Prisma queries bypass RLS because the application must `SET app.current_tenant = '<uuid>'` per connection, and Prisma's connection pool doesn't do this by default. The actual isolation is therefore in **app-level filters** (`memory.service.ts:37` `where: { tenantId: user.tenantId }`, `knowledge.service.ts:88` etc.).
  - Several tables that **should** be tenant-scoped are not:
    - `Permission` (line 353) — global, intentional.
    - `WebhookEvent.tenantId` is `String?` nullable (line 1784) — tenant is optional, which means cross-tenant webhook events are possible.
    - `AuditLog.tenantId` is `String?` (line 1375) — but SQL `audit_logs.tenant_id` is also nullable for system events (`014_final.sql:73`). Consistent.
  - No `@@index([tenantId])` on `AuditLog`, `AccessLog`, `DataChange`, `WebhookEvent`, `AnalyticsEvent`, `MetricValue`, `DashboardWidget`, `NotificationLog`, `ExecutionLog`, `WebEvent`, `WhatsappMessage`, `WebSession`, `OrderItem`, `InventoryTransaction`, `FollowUp` despite these being tenant-scoped.

#### 1.1.7 Soft deletes — inconsistent

- **SQL migrations** define `deleted_at TIMESTAMPTZ` on every tenant-scoped business table (`tenants`, `users`, `customers`, `products`, `product_categories`, `dashboards`, `reports`, `ai_agents`, etc.) and partial indexes `WHERE deleted_at IS NULL`.
- **Prisma schema** has **zero** `deletedAt` columns. Soft delete is implemented ad-hoc:
  - `Conversation.status = 'deleted'` (`conversations.service.ts:315`).
  - `RagSource.status = 'archived'` (`knowledge.service.ts:191`).
  - `RagDocument.status = 'archived'` (`knowledge.service.ts:195`) — but `ingestion-service.ts:276` uses `'DELETED'`.
  - `Message`, `AiMemory`, `User`, `Customer` — **hard deleted** (`memory.service.ts:114` `prisma.aiMemory.delete`).
- The `soft_delete_row()` function in `001_initial.sql:51–58` sets `deleted_at = NOW()` and `status = 'DELETED'` — but no trigger uses it. Dead code.

#### 1.1.8 Audit columns — incomplete

| Column | Prisma coverage |
|---|---|
| `createdAt` | Every model except `RolePermission`, `UserRole` (use join-id), `Message` (has it), `NotificationLog` (has it). Mostly OK. |
| `updatedAt` | Every updatable model. OK. |
| `createdBy` (FK to User) | Only on `InventoryTransaction` (line 545), `Workflow` (line 1151), `WorkflowExecution` (line 1209). **Missing on `Order`, `Customer`, `Product`, `RagDocument`, `KnowledgeArticle.author` (uses `authorId`), `AiMemory`, `Notification`, `Appointment`, `SupportTicket`, `Lead`, `WebhookEvent`, `AuditLog`**. |
| `updatedBy` | **Zero models.** Nowhere in the Prisma schema. SQL migrations also don't have it. Means no audit trail of who changed what. |
| `deletedAt` | Zero (see §1.1.7). |
| `deletedBy` | Zero. |
| `version` (optimistic locking) | Only `Workflow.version` (line 1149). Missing on `Product`, `Customer`, `Order`, `RagDocument`, `KnowledgeArticle` — all of which need versioning for concurrent edits. |

#### 1.1.9 Data integrity — CHECK constraints

SQL migrations define CHECK constraints:

- `chk_users_phone_format` (`013_constraints.sql:23`): `phone ~ '^\+?[1-9][0-9]{6,14}$'`
- `chk_customers_phone_format`, `chk_distributors_phone_format` (lines 33, 45)
- `chk_products_currency`, `chk_orders_currency` (lines 63, 75): `currency ~ '^[A-Z]{3}$'`
- `chk_product_reviews_rating_range` (line 91): `rating >= 1 AND rating <= 5`
- `chk_customers_ltv_nonneg` (line 105): `lifetime_value >= 0`
- `chk_leads_score_range` (line 121): `score >= 0 AND score <= 100`
- `chk_notifications_priority` (line 137): `priority IN ('LOW','NORMAL','HIGH','URGENT')`
- `chk_users_email_format` (`002_auth.sql:68`)
- `chk_products_price_nonneg`, `chk_inventory_quantity_nonneg`, `chk_inventory_reserved_nonneg` (`003_products.sql:84,123,124`)
- `chk_ai_memory_importance` (`006_ai.sql:117`)

These are good. But:

- Prisma schema declares **none of these**. Prisma-generated migrations would not enforce them.
- Missing CHECKs:
  - `Order.total >= 0`, `Order.subtotal >= 0`, `Order.tax >= 0`
  - `OrderItem.quantity > 0`, `OrderItem.unitPrice >= 0`
  - `Product.taxRate >= 0 AND taxRate <= 1` (or 0–100)
  - `AiAgent.temperature >= 0 AND temperature <= 2` (no `temperature` field in Prisma — drift)
  - `RagChunk.chunkIndex >= 0`
  - `MetricValue.value` range checks
  - `Notification.retryCount <= maxRetries`
  - `Appointment.durationMinutes > 0`
  - `Lead.score` already done; `Order.discount >= 0 AND discount <= subtotal`
  - Status transition CHECK on `Order.status` is implemented as a trigger (`013_constraints.sql:155–195`) — good, but no Prisma equivalent.

#### 1.1.10 Performance — hot spots, locking, N+1 risks

**Hot spots:**

1. **`trg_messages_update_count`** (`013_constraints.sql:331`) fires `AFTER INSERT OR DELETE` on every message — for high-volume chat tenants this serializes all message inserts to one conversation row. Should be a periodic counter refresh, not a per-row trigger.
2. **`reserve_inventory_on_order_item`** (`013_constraints.sql:281`) takes a `FOR UPDATE` row lock on `inventory` for the product — correct for oversell prevention but creates contention on hot SKUs.
3. **`update_customer_stats_on_delivery`** (`013_constraints.sql:303`) updates the customer row on every order delivery — contention on customers with many concurrent orders.
4. **Audit log partitioning** (`002_auth.sql:217`) — 13 monthly partitions created up-front but no `pg_partman` or scheduled job to create future partitions. After 13 months, inserts will fail with "no partition for row".
5. **`Order.orderNumber @unique`** (line 562) globally — but `generate_order_number()` (`001_initial.sql:142`) uses a single global sequence. Multi-tenant inserts serialize on `order_number_seq`.

**N+1 query risks in service code:**

- `memory.service.ts:124` `getByUser` returns all memories without pagination — fine for low cardinality.
- `knowledge.service.ts:104` `findAllSources` uses `_count: { select: { documents: true } }` — Prisma translates to a single GROUP BY, OK.
- `knowledge.service.ts:223` `findAllDocuments` uses `_count: { select: { chunks: true } }` — same.
- `conversation-memory.service.ts:261–274` loops `for (const item of extracted)` and awaits `prisma.aiMemory.create` per item — **classic N+1 insert**. Should be `createMany`.
- `embedChunks` (`knowledge.service.ts:602–619`) loops `for (const emb of response.data)` and awaits `$executeRaw` per chunk — **N+1 raw SQL**. Should be a single `UPDATE ... FROM (VALUES ...) ...` or `unnest` array.
- `document-permissions.service.ts:276–283` `Promise.all(chunkIds.map(...))` — fans out N parallel `canAccessDocumentRow` calls, each hitting `prisma.user.findUnique`. Should batch the user lookup once.

#### 1.1.11 pgvector configuration

- `schema.prisma:9` declares `extensions = [vector]` and line 14 enables `previewFeatures = ["postgresqlExtensions"]` — correct.
- `RagChunk.embedding` is `Unsupported("vector(1536)")?` (line 861) — correct Prisma escape hatch.
- `RagEmbedding.embedding` is `Unsupported("vector(1536)")?` (line 1548) — correct.
- `RagQuery.queryEmbedding` is `Unsupported("vector(1536)")?` (line 1567) — correct.
- **HNSW index is NOT declared in any active migration.** It exists in:
  - `database/scripts/vector-store-indexes.sql:13` (references `ai.rag_chunks` schema, not `public.rag_chunks`)
  - `rag/vector-store/vector-store-indexes.sql` (duplicate file, same content)
  - `rag/ingestion/chunking-schema.sql:23` — **commented out** with note "Enable HNSW after creating pgvector extension"
  - `_archived/004_rag_chunks_pgvector.sql` — archived, not run
- **Consequence**: production vector search runs without an HNSW index → O(n) sequential scan over all chunks per query. At 310 chunks (per `packages/knowledge-base/INDEX.md:74`) this is fine; at 100k chunks it's a 2-second query.
- No IVFFlat fallback. No `ef_search` tuning at query time (the script sets `hnsw.ef_search = 40` once, but the runtime queries in `knowledge.service.ts:639–653` don't `SET LOCAL`).
- No GIN index on `rag_chunks.metadata` in active migrations (only in `scripts/vector-store-indexes.sql:35`), despite `document-permissions.service.ts` filtering on `metadata.restrictions`.

### 1.2 Critical gaps (Part 1)

1. **Two-source-of-truth schema drift** — Prisma schema and SQL migrations disagree on ~30 columns, 4 status vocabularies, enum memberships, and uniqueness scopes. Migration 017 (`orders.currency`) and 018 (`users.role`) document this drift exists; nothing prevents the next occurrence.
2. **No soft-delete column in Prisma** — partial indexes `WHERE deleted_at IS NULL` (in SQL) cannot be honored by Prisma queries.
3. **No HNSW index in active migrations** — vector search will table-scan at scale.
4. **`User.email` globally unique in Prisma but tenant-scoped in SQL** — blocks multi-tenant shared emails.
5. **`Embedding` Prisma model has no underlying SQL table** — dead model.
6. **Status case mismatches** — `Conversation.status='ended'` vs trigger expecting `'ENDED'` → `ended_at` never stamped by trigger.
7. **Audit log partitioning** with no automation — partitions run out after 13 months.
8. **No `createdBy`/`updatedBy`/`deletedBy` audit columns** on most tables — cannot answer "who changed this row?".
9. **Zero CHECK constraints in Prisma** — drift if Prisma migrations ever replace SQL.
10. **No `@@index` on `AuditLog`, `AccessLog`, `DataChange`, `WebhookEvent`, `AnalyticsEvent`, `MetricValue`** — these are high-write tables.
11. **No composite `(tenantId, documentId)` index on `RagChunk`** — vector searches filter by tenant, then by document; the missing composite forces two index lookups.
12. **`PaymentStatus` enum defined but unused** — `Order.paymentStatus` is `String`.

### 1.3 Recommendations (Part 1)

1. **Pick one source of truth.** Either (a) generate Prisma schema from SQL via `prisma db pull` and hand-curate, or (b) generate SQL from Prisma via `prisma migrate diff`. Don't maintain both by hand. The current state has migrations 017/018 as evidence of manual drift-fixing — that's a process smell.
2. **Add `deletedAt DateTime? @map("deleted_at")` to every tenant-scoped model.** Then update all Prisma queries to include `deletedAt: null` (or use a Prisma extension/middleware to inject it automatically).
3. **Add `@@index([tenantId, createdAt])` to every tenant-scoped model.** Add `@@index([tenantId, status])` where status is queried.
4. **Add HNSW index migration** (active, not script): `CREATE INDEX CONCURRENTLY idx_rag_chunks_embedding_hnsw ON rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);` — and run it on `public.rag_chunks`, not `ai.rag_chunks`.
5. **Fix case mismatches**: standardize on uppercase status values (`ACTIVE`, `ENDED`, `FAILED`) everywhere, or lowercase everywhere — pick one and add a CHECK constraint to enforce it.
6. **Add `MemoryType.SUMMARY` to the Prisma enum** so `ConversationMemoryService.summarizeConversation` can persist summaries correctly.
7. **Add `createdBy`, `updatedBy`, `deletedBy`, `version` columns** to business tables (or at least `Order`, `Customer`, `Product`, `RagDocument`, `AiMemory`).
8. **Replace `Embedding` Prisma model** (Bytes-based) with proper `Unsupported("vector(1536)")` columns on `RagChunk` and `RagEmbedding` — already done, but the dead `Embedding` model should be deleted.
9. **Add `pg_partman` or a cron job** to create future audit-log partitions monthly.
10. **Add a CI check** that runs `prisma validate` + `prisma migrate diff --from-schema-datamodel --to-schema-datasource schema.prisma` and fails if the Prisma schema doesn't match the applied SQL.

**Part 1 Score: 5.5/10** — the SQL side is 7.5/10 (good RLS, good partial indexes, good triggers, missing HNSW + partitioning automation); the Prisma side is 3.5/10 (heavy drift, no soft-delete awareness, no audit columns, missing indexes, dead models). Weighted average 5.5.

---

## Part 2: AI Memory System

### 2.1 What exists

#### 2.1.1 Schema (`schema.prisma:793–813`)

```
model AiMemory {
  id         String     @id @default(uuid())
  tenantId   String
  agentId    String?    (onDelete: SetNull)
  userId     String?
  customerId String?
  type       MemoryType (FACT | PREFERENCE | HISTORY | CONTEXT)
  key        String
  value      String
  importance Int        @default(5)
  expiresAt  DateTime?
  metadata   Json?
  createdAt  DateTime
  updatedAt  DateTime
}
```

Indexes (in SQL `006_ai.sql:124–128`): `tenant_id+created_at`, `agent_id`, `user_id`, `customer_id`, `expires_at WHERE expires_at IS NOT NULL`. Prisma declares none of these.

CHECK constraint: `importance >= 1 AND importance <= 10` (`006_ai.sql:117`). Prisma DTO (`memory.dto.ts:39`) uses `@Min(0)` — wrong lower bound.

#### 2.1.2 Service (`backend/ai/memory.service.ts` — 187 lines)

- **CRUD**: `findAll`, `findOne`, `create`, `update`, `remove` (lines 32–116).
- **Scope shortcuts**: `getByUser`, `getByCustomer` (lines 123–136) — return **all** memories without pagination.
- **Context retrieval**: `getContextForConversation(conversationId, user)` (lines 154–186):
  - Loads conversation, builds OR of `(userId, customerId, agentId)` scopes.
  - Filters: `expiresAt IS NULL OR expiresAt > now()`.
  - Orders by `importance DESC, createdAt DESC`.
  - Limits to **5 memories** (constant `CONTEXT_MEMORY_LIMIT = 5`, line 26).
- **Tenant isolation**: every query filters `tenantId = user.tenantId` — good.
- **Auto-injection into conversations**: `ConversationsService.sendMessage` calls `getContextForConversation` (conversations.service.ts:197) and `augmentSystemPrompt` (line 329) appends a "What you know about this user/customer:" block to the system prompt. Failures are swallowed (line 199) — chat turn never blocked by memory.

#### 2.1.3 Companion service (`rag/memory/conversation-memory.service.ts` — 444 lines)

This is a **separate, richer implementation** that is **not wired into the conversation flow**:

- `getShortTermMemory(conversationId, turns=10)` (line 74) — fetches last N messages.
- `getLongTermMemory(userId, customerId, limit=5)` (line 104) — same importance-descending query as `MemoryService.getContextForConversation`, but **without tenant scoping** (no `tenantId` in WHERE clause — bug).
- `saveMemory(dto)` (line 146).
- `summarizeConversation(conversationId, tenantId)` (line 174) — calls OpenAI to summarize transcript, persists as `type='CONTEXT'` (with explicit `// SUMMARY isn't in the Prisma enum yet` comment, line 206), `importance=7`.
- `extractMemories(conversationId, tenantId)` (line 233) — LLM extracts preferences/facts/action items from transcript, persists each as a separate `AiMemory` row (with N+1 inserts, line 263).
- `callLlmForSummary`, `callLlmForMemoryExtraction` — private LLM helpers.

#### 2.1.4 Tests (`backend/ai/memory.service.spec.ts` — 220 lines)

Good coverage of CRUD + tenant scoping + expiration filter + context retrieval OR-of-scopes. **Does not test**: PII, retention, consolidation, Redis, cross-agent sharing, embedding-based search.

### 2.2 What's missing vs world-class

| Capability | World-class | Dayjoy | Gap |
|---|---|---|---|
| **Memory types** | Episodic + semantic + procedural + working | FACT, PREFERENCE, HISTORY, CONTEXT (semantic only) — no episodic (conversation transcripts live in `messages`, not memory), no procedural (no "how-to" memories), no working memory (no per-session scratchpad). | **Missing 3 of 4 types.** |
| **Hierarchical storage** | Hot (in-context) + warm (Redis) + cold (DB) | Cold only. ADR `0004-redis-for-state.md` exists but `grep -r "redis" backend/ai/` returns **zero matches**. No Redis client, no hot tier. | **No hot/warm tier.** |
| **Retrieval — relevance scoring** | Cosine similarity of query embedding vs memory embedding | None — pure SQL `ORDER BY importance DESC, createdAt DESC`. No similarity search. | **No semantic retrieval.** |
| **Retrieval — recency weighting** | Exponential decay: `score = importance * exp(-Δt/τ)` | None — `createdAt DESC` is a tiebreaker only, not a weighted factor. | **No recency decay.** |
| **Retrieval — importance decay** | Importance erodes over time unless re-confirmed | Static `importance` set at creation, never decays. | **No decay.** |
| **Memory consolidation** | Periodic job summarizes old memories into compact summaries, deduplicates conflicts | `summarizeConversation` exists in `rag/memory/` but is **not called anywhere** — no caller in the codebase. `extractMemories` exists but is **not called anywhere**. | **Dead code.** |
| **Per-user/per-session isolation** | Strict | `tenantId + (userId OR customerId OR agentId)` — good tenant isolation, but the OR-of-scopes means a user's memories leak into any conversation the user is part of, even if the agent shouldn't see them. `agentId` in the OR means agent-scoped memories (e.g. "SalesAgent knows X about user") get pulled into SupportAgent conversations. | **Per-agent isolation weak.** |
| **PII detection** | Detect SSN/phone/email/Aadhaar in memory values; redact or block persistence | None. `memory.service.ts:67–90` `create()` persists `dto.value` verbatim. `augmentSystemPrompt` (conversations.service.ts:332–335) writes `key = value` directly into the LLM prompt — if a user says "my SSN is 123-45-6789", it lands in `ai_memory.value` and is replayed into every future system prompt. | **No PII handling.** |
| **Retention policy** | TTL per memory type; auto-expire + archive | `expiresAt` column exists but is **never set by application code** (`create` accepts it but no caller passes it). No background reaper. `RetentionPolicy` table exists (`schema.prisma:1444`) but is unused by the memory service. | **No retention enforcement.** |
| **Right-to-be-forgotten** | `DELETE FROM ai_memory WHERE userId = X` + cascade | `getByUser` exists but no `deleteByUser`. GDPR/DPDP "forget me" requires manual SQL. | **No RTBF API.** |
| **Memory lifecycle** | Create → consolidate → decay → expire → delete | Create → manual update → manual delete. No automation. | **No lifecycle automation.** |
| **Auto-injection** | Every conversation turn | ✓ `ConversationsService.sendMessage` calls `getContextForConversation` (line 197). | **Present** — but only the dumber `MemoryService`, not the richer `ConversationMemoryService`. |
| **Memory search API** | Semantic search across memories | `findAll` with `agentId/userId/customerId/type` filters — no text search, no embedding search. | **No search.** |
| **Cross-agent sharing** | Configurable per-memory | `agentId` nullable; `getContextForConversation` ORs `agentId` into the scope, so memories created by Agent A are visible to Agent B if the user/customer matches. No "share with all agents" flag, no "private to this agent" flag. | **Ad-hoc, not configurable.** |
| **Memory importance learning** | LLM rates importance 0–10 at extraction time | `extractMemories` asks LLM for `importance: 0–10` (line 361) — good — but the function is never called. | **Dead code.** |
| **Conflict resolution** | When new memory contradicts old, update or invalidate the old | None. If user says "I prefer email" then later "I prefer SMS", both persist; `ORDER BY importance DESC, createdAt DESC` returns the newer one first only if importance ties. | **No conflict resolution.** |
| **Memory versioning** | Track edits to memories | `updatedAt` only; no history table. | **No version history.** |
| **Embedding of memory values** | Store embedding of `value` for semantic recall | None. `AiMemory` has no `embedding` column. | **No embedding.** |
| **Memory limits per user** | Cap memories per user to bound context size | None — `getByUser` returns all. | **No cap.** |
| **Memory source attribution** | Track which conversation/message extracted the memory | `metadata` JSON column exists but `extractMemories` doesn't set `sourceConversationId` in metadata. | **No source tracking.** |
| **Memory confidence** | LLM confidence in extracted facts | None. | **No confidence.** |

### 2.3 Critical gaps (Part 2)

1. **Two memory services, neither complete.** `backend/ai/memory.service.ts` is wired into conversations but is dumb (CRUD + 5-record importance sort). `rag/memory/conversation-memory.service.ts` has the smart features (summarization, extraction, short-term memory) but is **never called by the conversation flow** — `grep` shows zero callers outside its own module.
2. **No PII detection.** Memory values flow verbatim from user input → `ai_memory.value` → next conversation's system prompt. GDPR/DPDP violation risk.
3. **No Redis hot tier** despite ADR 0004 mandating Redis. Every memory retrieval hits PostgreSQL.
4. **No semantic retrieval.** Memories are retrieved by importance + recency, not by similarity to the current query. A user asking "what's my preferred contact method?" won't surface the `PREFERENCE: preferred_contact = email` memory unless it ranks in the top 5 by importance.
5. **`expiresAt` is dead.** Column exists, filter exists, but no caller sets it. No background reaper.
6. **No right-to-be-forgotten API.** Cannot delete a user's memories without manual SQL.
7. **No memory consolidation.** `summarizeConversation` and `extractMemories` are dead code.
8. **Agent-scope leakage.** OR-of-`(userId, customerId, agentId)` means agent-scoped memories leak across agents.
9. **No conflict resolution.** Contradictory memories coexist.
10. **N+1 inserts in `extractMemories`** (line 263) — would be a perf cliff if the function were ever called.

### 2.4 Recommendations (Part 2)

1. **Consolidate into one `MemoryService`** that exposes: `getShortTermMemory`, `getLongTermMemory`, `getContextForConversation`, `saveMemory`, `extractMemories`, `summarizeConversation`, `searchMemories` (semantic), `deleteByUser` (RTBF), `decayMemories` (cron). Delete the duplicate.
2. **Add `embedding vector(1536)` column to `ai_memory`** and generate embeddings on `create`/`update`. Add HNSW index.
3. **Add Redis hot tier**: cache the top-50 memories per user with TTL=1h. Invalidate on `create`/`update`/`delete`.
4. **Add PII detection**: run a regex/Presidio pass on `value` before persisting; reject or redact.
5. **Add memory consolidation cron**: nightly, find conversations ended >24h ago without extraction, run `extractMemories`; find conversations >50 messages, run `summarizeConversation`; find memories with `importance < 3 AND createdAt < now() - 90d`, delete.
6. **Add recency decay**: `score = importance * exp(-daysSinceLastAccess / 30)`. Track `lastAccessedAt`.
7. **Add conflict resolution**: before persisting a new `FACT`/`PREFERENCE` with the same `key` + `userId`, mark the old one `supersededById = new.id` (new column) or delete it.
8. **Add RTBF endpoint**: `DELETE /api/ai/memory/user/:userId` → cascades to `ai_memory`, `messages`, `conversations` for that user.
9. **Wire `extractMemories` into `endConversation`**: when a conversation ends, fire-and-forget the extraction.
10. **Fix `getLongTermMemory` tenant bug** (missing `tenantId` in WHERE).

**Part 2 Score: 4.0/10** — basic CRUD + auto-injection works, but every world-class feature (semantic retrieval, consolidation, PII, RTBF, Redis, decay) is either missing or implemented-but-not-wired.

---

## Part 3: Knowledge Base

### 3.1 What exists

#### 3.1.1 Two parallel implementations (again)

**A. `backend/knowledge/knowledge.service.ts` (722 lines)** — the one wired into the HTTP API (`knowledge.controller.ts`):

- `findAllSources`, `findOneSource`, `createSource`, `updateSource`, `removeSource` (lines 83–199).
- `findAllDocuments`, `findOneDocument` (lines 205–249).
- `ingest(dto, user)` (lines 259–329):
  - Creates `RagDocument` with `status='processed'` (line 279).
  - Splits content into **1000-character chunks with 200-character overlap** (constants at lines 27–28).
  - `prisma.ragChunk.createMany` (line 309).
  - Best-effort `embedChunks` via OpenAI batch + per-chunk raw SQL `UPDATE` (lines 574–620).
- `deleteDocument` (line 336) — **hard delete** of chunks + document.
- `reingest(sourceId)` (line 355) — re-split + re-embed.
- `query(dto, user)` (lines 433–493):
  - Generate query embedding via OpenAI.
  - pgvector cosine similarity search via raw SQL `<=>` operator (lines 639–653).
  - Fallback to case-insensitive `contains` text search (lines 451–461).
  - Synthesize answer via OpenAI Chat Completions (lines 679–721).
  - Persist `RagQuery` row with `retrievedChunkIds`, `latencyMs`, `confidence`.
- `getStats(user)` (lines 499–534).

**B. `rag/ingestion/ingestion-service.ts` (401 lines)** — the richer pipeline, **not exposed via HTTP** (no controller in `rag/` is mounted in the main app module):

- `ingestDocument(dto, user)` (line 69):
  - Creates `RagDocument` with `status='PROCESSING'` (line 96).
  - **Format-aware loader dispatch** via `DocumentLoaderFactory` (line 110–112) — supports PDF, DOCX, MD, TXT, CSV, HTML.
  - **Token-aware chunking** via `ChunkingService` + `gpt-tokenizer` (line 115) — 1000-token chunks, 200-token overlap, paragraph/sentence boundaries, per-document-type config (`chunking-config.ts`).
  - Batch embedding via `EmbeddingsService` (line 127).
  - Persist via `VectorStoreService.insertChunks` (line 132).
  - Flip status to `'READY'` (line 138) or `'FAILED'` (line 163) with error message in metadata.
- `ingestBatch(dtos, user)` (line 176) — parallel batch with max 5 concurrent, isolated failures.
- `reingestSource(sourceId, user)` (line 221).
- `deleteDocument` (line 264) — **soft delete** (`status='DELETED'`).
- `purgeDocument` (line 287) — hard delete after soft delete.
- Metadata extraction: `originalFilename`, `mimeType`, `category`, `tags`, `uploadedBy` (lines 98–104).

#### 3.1.2 Loaders (`rag/loaders/`)

| Loader | File | Format support |
|---|---|---|
| `PdfLoader` | `pdf.loader.ts` | PDF via `pdf-parse`. Extracts title, author, page count, creation date. Heading detection by heuristic (line 101). **No OCR** for scanned PDFs. |
| `DocxLoader` | `docx.loader.ts` | DOCX (not read in detail). |
| `MarkdownLoader` | `markdown.loader.ts` | MD. |
| `TextLoader` | `text.loader.ts` | TXT. |
| `CsvLoader` | `csv.loader.ts` | CSV — one row per section. |
| `HtmlLoader` | `html.loader.ts` | HTML/XHTML. |

`DocumentLoaderFactory` (`loader.factory.ts:17–27`) maps MIME types and extensions. **Missing**: PPTX, XLSX, XLS, RTF, ODT, EPUB, images (PNG/JPG for OCR), audio (MP3 for transcription).

#### 3.1.3 Chunking (`rag/ingestion/chunking-service.ts` + `chunking-config.ts`)

- **Token-aware** via `gpt-tokenizer` (cl100k_base, matches GPT-4/`text-embedding-3-*`).
- Default: 1000 tokens, 200 overlap, min 100, max 2000.
- Per-document-type overrides (HTML smaller, CSV row-atomic).
- Three strategies: hierarchical (sections), paragraph-based (default), sentence-based (fallback).
- Post-processing: merge under-sized, split over-sized.
- Per-chunk metadata: `documentId`, `tenantId`, `source`, `category`, `tags`, `pageNumber`, `heading`, `section`, `tokenCount`, `language`, `hasCode`, `hasTable`, `hasList` (chunking-config.ts:149–186).

This is genuinely good — better than most production RAG systems.

#### 3.1.4 Vector store (`rag/vector-store/`)

- `VectorStoreService` (`vector-store-service.ts`) — pgvector native.
- HNSW + GIN indexes defined in `vector-store-indexes.sql` (but not in active migrations — see Part 1 §1.1.11).
- Hybrid retrieval config in `rag/retriever/retrieval-config.ts` (not read in detail).

#### 3.1.5 Document permissions (`rag/security/document-permissions.service.ts` — 323 lines)

- Per-document ACL via `metadata.restrictions` JSON block (no separate `rag_document_permissions` table).
- Rules: super-admin bypass → tenant isolation → no-restrictions → role restriction → user restriction.
- `canAccessDocument`, `canAccessSource`, `filterAccessibleChunks`, `filterAccessibleDocuments`.
- Used by retrieval pipeline to drop inaccessible chunks before LLM sees them (line 252 — prevents context leakage).
- **Bug**: `canAccessDocumentRow` loads `user` via `prisma.user.findUnique` for every check — N+1 in the batch helpers (`filterAccessibleChunks` calls it per chunk, line 280).

#### 3.1.6 Knowledge base content (`packages/knowledge-base/`)

- **29 markdown documents** across 10 categories (INDEX.md:12,44–74).
- ~86,000 words total, ~310 chunks estimated.
- Tags: audience (`customer-facing`, `distributor-only`, `internal-only`, `compliance`) + topic (`company`, `product`, `policy`, etc.).
- Maintenance cadence, review process, stale-content detection documented (INDEX.md:356–387).
- Quality metrics tracked (INDEX.md:391–401): retrieval accuracy >80%, groundedness >90%, CSAT >4.5/5.

#### 3.1.7 Tests

- `knowledge.service.spec.ts` (388 lines) — covers CRUD, ingest, query (text-search fallback), delete, reingest, stats.
- `ingestion-service.spec.ts` — RAG pipeline.
- `chunking-service.spec.ts` — chunker.
- `loaders.spec.ts` — loaders.
- `document-permissions.spec.ts` — ACL.
- `rag/tests/integration/` — integration tests.

### 3.2 What's missing vs world-class

| Capability | World-class | Dayjoy | Gap |
|---|---|---|---|
| **Multi-format ingestion** | PDF, DOCX, HTML, MD, TXT, CSV, PPTX, XLSX, RTF, ODT, images (OCR), audio (ASR) | PDF, DOCX, HTML, MD, TXT, CSV (6 of 12) | **Missing PPTX, XLSX, RTF, ODT, images, audio.** |
| **OCR** | Tesseract/PaddleOCR for scanned PDFs and images | None — `PdfLoader` uses `pdf-parse` which extracts only embedded text. Scanned PDFs return empty. | **No OCR.** |
| **Layout-aware extraction** | pdfjs-dist with text-layer coordinates; table detection (camelot/tabula); image captions | `PdfLoader.detectHeadingLevel` (line 101) is a regex heuristic. Page numbers estimated as `Math.floor(i / 3) + 1` (line 85) — "coarse approximation" per the code comment. | **Heuristic only.** |
| **Table extraction** | Preserve table structure as markdown/HTML | None. | **Missing.** |
| **Image captions** | Vision model generates captions for embedded images | None. | **Missing.** |
| **Chunking strategy** | Semantic/hierarchical + token-aware + per-type config | ✓ `ChunkingService` + `chunking-config.ts` does this well. | **Present** in `rag/`, but `backend/knowledge/knowledge.service.ts` uses **character-based** chunking (1000 chars) instead. Drift. |
| **Embedding — multi-model** | OpenAI, Cohere, BGE, Voyage; switchable per source | OpenAI `text-embedding-3-small` only (`knowledge.service.ts:30`, hardcoded). `rag/embeddings/embeddings-service.ts` may support more (not read). | **Single provider.** |
| **Embedding — batch** | Yes | ✓ `embedChunks` uses `input: chunks.map(c => c.content)` (line 589) — single batched call. | **Present.** |
| **Embedding — caching** | Cache embeddings by `hash(content)` to avoid re-embedding on reingest | None. `reingest` (line 355) re-embeds everything. | **No cache.** |
| **Vector storage — HNSW** | HNSW index with `ef_search` tuning | Defined in `scripts/vector-store-indexes.sql` but **not in active migrations**. | **See Part 1.** |
| **Vector storage — filtered** | Filter by tenant/category/tags at query time | `vectorSearch` (line 639) filters by `tenant_id` only. No category/tag filter despite `ChunkMetadata` carrying them. | **No metadata filter.** |
| **Document lifecycle** | upload → processing → ready → archived → deleted | `backend/knowledge`: `processed`/`archived`/hard-deleted. `rag/ingestion`: `PROCESSING`/`READY`/`FAILED`/`DELETED`. **Two incompatible vocabularies** on the same column. | **Drift.** |
| **Reprocessing** | Re-embed when models change; track embedding model version per chunk | `reingest` exists in both services. `RagEmbedding.model` column tracks model (line 1549) but `RagChunk.embedding` (the one actually used by `vectorSearch`) does not. | **Partial.** |
| **Versioning** | Document versions with diff tracking | None. `RagDocument` has no `version` column, no `parentDocumentId`. Re-ingest overwrites in place. | **No versioning.** |
| **Access control** | Per-document permissions, RBAC | ✓ `DocumentPermissionsService` (323 lines) — good. But lives in `rag/security/` and is **not used by `backend/knowledge/knowledge.service.ts`** — the HTTP API doesn't enforce per-doc ACL. | **Implemented but not wired into the HTTP API.** |
| **Monitoring — processing metrics** | Throughput, failure rate, latency per format | `getStats` (line 499) returns counts + avg latency. No per-format, no failure rate. | **Partial.** |
| **Monitoring — retrieval quality** | Precision@K, recall, MRR, human feedback | `RagQuery.feedback` column exists (line 1572) but **no endpoint to set it**. No evaluation pipeline wired (despite `rag/evaluation/` existing). | **Dead schema.** |
| **Monitoring — cost tracking** | Tokens used, $ per query, $ per document | `RagQuery.latencyMs` only. No `costUsd`, no `tokensUsed`. `VoiceAnalytics.costUsd` exists (line 1525) but RAG doesn't. | **No cost tracking.** |
| **Document preview/viewer** | Inline HTML/PDF preview | None. `findOneDocument` returns metadata + content but no viewer endpoint. | **Missing.** |
| **Batch upload** | Yes, with progress tracking | ✓ `ingestBatch` (line 176) — 5 concurrent, isolated failures. But **not exposed via HTTP** (no controller). | **Implemented but not wired.** |
| **Deduplication** | Hash content, skip re-ingest if unchanged | None. `reingest` re-embeds everything. | **No dedup.** |
| **Metadata extraction** | Title, author, language, page count, creation date | ✓ `PdfLoader` extracts title/author/pageCount/creationDate (line 49–56). Other loaders not audited in detail. | **Partial** — PDF only. |
| **Hybrid search** | Vector + BM25 + cross-encoder re-ranker | `INDEX.md:347–352` documents "Hybrid weight 0.7 vector + 0.3 keyword" and "Re-ranker enabled" — but `knowledge.service.ts:451–461` fallback is plain `contains` (not BM25), and no re-ranker in code. | **Documented but not implemented.** |
| **Citations** | Chunk-level citations with page numbers | ✓ `Citation` interface (line 33) includes `chunkId`, `documentId`, `documentTitle`, `content`, `score`. Missing `pageNumber`, `heading`, `section` despite `ChunkMetadata` having them. | **Partial.** |
| **Streaming responses** | SSE for long answers | None. `query` returns the full answer synchronously. | **Missing.** |
| **Multi-tenant isolation at vector layer** | HNSW index partitioned by tenant, or filter pushdown | `vectorSearch` filters `tenant_id = $1` — pushdown, not partition. Fine for <1M chunks per tenant. | **OK for now.** |

### 3.3 Critical gaps (Part 3)

1. **Two implementations, incompatible status vocabularies.** `backend/knowledge` uses `processed`/`archived`; `rag/ingestion` uses `PROCESSING`/`READY`/`FAILED`/`DELETED`. The HTTP API exposes the dumber one.
2. **Character-based chunking in the HTTP API** (`knowledge.service.ts:27`) vs token-based in `rag/` — the same document ingested via the API vs the `rag/` pipeline produces different chunk counts and different embeddings.
3. **No HNSW index in active migrations** — see Part 1.
4. **No OCR** — scanned PDFs (common in Indian business docs) return empty text.
5. **No PPTX/XLSX** — two of the most common business document formats.
6. **No document versioning** — re-ingest overwrites; no diff history.
7. **`DocumentPermissionsService` not wired into HTTP API** — `knowledge.controller.ts` uses `PermissionsGuard` (role-based) but never calls `canAccessDocument` per document. Any user with `knowledge:read` sees every document in the tenant.
8. **No deduplication** — re-ingest re-embeds identical content.
9. **No embedding cache** — re-ingest re-calls OpenAI for unchanged chunks.
10. **`vectorSearch` filters by tenant only** — category/tag filters in `ChunkMetadata` are unused at query time.
11. **`RagQuery.feedback` column is dead** — no endpoint sets it.
12. **N+1 in `embedChunks`** (line 602) — per-chunk `UPDATE` instead of batch.
13. **`reingest` in `knowledge.service.ts` doesn't re-fetch the document content** — it reads `doc.content` which is set on ingest, but if the document was ingested via file upload (not inline content), `content` is empty (`ingestion-service.ts:94` sets `content: dto.content ?? ''`).
14. **No cost tracking** — can't answer "how much are we spending on embeddings per tenant?".

### 3.4 Recommendations (Part 3)

1. **Delete `backend/knowledge/knowledge.service.ts`'s `ingest`/`query`/`reingest`/`embedChunks`/`vectorSearch`/`synthesizeAnswer` methods** and delegate to `rag/ingestion/ingestion-service.ts` + `rag/retriever/retrieval-service.ts` + `rag/response-pipeline/response-pipeline.service.ts`. Keep only the HTTP-facing CRUD.
2. **Standardize on one status vocabulary** — recommend `PROCESSING`/`READY`/`FAILED`/`ARCHIVED`/`DELETED`.
3. **Add HNSW index migration** (Part 1 §1.3 rec 4).
4. **Add PPTX/XLSX loaders** via `officeparser` or `exceljs`.
5. **Add OCR** via `tesseract.js` for scanned PDFs (detect via `pdf-parse` returning empty text + non-zero page count).
6. **Add document versioning**: `RagDocument.version Int @default(1)`, `RagDocument.parentDocumentId String?`, `RagDocument.diff Json?`.
7. **Wire `DocumentPermissionsService` into the HTTP API** — call `filterAccessibleDocuments` in `findAllDocuments`, `canAccessDocument` in `findOneDocument`/`deleteDocument`/`ingest`.
8. **Add embedding cache**: `RagChunk.contentHash String @unique` + skip re-embed if hash matches.
9. **Add category/tag filter to `vectorSearch`**: `WHERE c.tenant_id = $1 AND c.metadata->>'category' = $2 AND c.metadata->'tags' ?| $3::text[]`.
10. **Add `POST /api/knowledge/queries/:id/feedback`** endpoint to set `RagQuery.feedback`.
11. **Add `costUsd` + `tokensUsed` to `RagQuery`** and populate from OpenAI response.
12. **Add streaming SSE endpoint** for `query` (ChatGPT-style).
13. **Batch the `embedChunks` UPDATE**: `UPDATE rag_chunks SET embedding = v.vec FROM (VALUES ($1::uuid, $2::vector), ...) AS v(id, vec) WHERE rag_chunks.id = v.id`.
14. **Add BM25/hybrid search** via `tsvector` column on `rag_chunks.content` + GIN index, then blend scores.

**Part 3 Score: 6.5/10** — the `rag/` package is genuinely well-engineered (8/10 in isolation: token-aware chunking, good loaders, per-doc ACL, batch ingest, evaluation suite). The `backend/knowledge` HTTP API is a 4/10 reimplementation that drags the average down. Wiring the HTTP API to the `rag/` pipeline would jump the score to 8/10.

---

## Combined recommendations (prioritized)

Ordered by impact × effort (high impact + low effort first):

### P0 — Production blockers (do this week)

1. **Fix `User.email` uniqueness**: change `schema.prisma:276` from `@unique` to `@@unique([tenantId, email])` to match SQL. Without this, two tenants cannot share an email (e.g., a contractor working for two companies).
2. **Fix status case mismatches**: standardize on uppercase everywhere (`'ACTIVE'`, `'ENDED'`, `'FAILED'`, `'ARCHIVED'`, `'DELETED'`) to match SQL triggers. Update `conversations.service.ts:272,315`, `knowledge.service.ts:154,191,195,279`, and all other lowercase status writes.
3. **Add HNSW index migration**: create `019_rag_hnsw_index.sql` with `CREATE INDEX CONCURRENTLY idx_rag_chunks_embedding_hnsw ON public.rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`. Without this, vector search table-scans.
4. **Add `MemoryType.SUMMARY` to the Prisma enum** (`schema.prisma:162`) so `ConversationMemoryService.summarizeConversation` can persist summaries correctly (it currently hacks around the missing enum value by using `CONTEXT`).
5. **Fix `MemoryService` importance validation**: `memory.dto.ts:39` uses `@Min(0)` but DB CHECK is `importance >= 1 AND importance <= 10`. Change to `@Min(1) @Max(10)`.

### P1 — Security & compliance (do this sprint)

6. **Add PII detection to `MemoryService.create`**: regex-pass `dto.value` for SSN/Aadhaar/PAN/phone/email; reject or redact before persisting. Same for `RagDocument.content` on ingest.
7. **Wire `DocumentPermissionsService` into the HTTP API**: `knowledge.controller.ts` should call `filterAccessibleDocuments` in `findAllDocuments` and `canAccessDocument` in `findOneDocument`/`deleteDocument`. Today, any user with `knowledge:read` sees every document in the tenant.
8. **Add right-to-be-forgotten endpoint**: `DELETE /api/ai/memory/user/:userId` cascading to `ai_memory`, `messages`, `conversations`. Required for GDPR/DPDP.
9. **Add `expiresAt` default + reaper**: memories default to 90-day TTL unless `importance >= 8`; nightly cron deletes expired rows.
10. **Add `createdBy`/`updatedBy` to `Order`, `Customer`, `Product`, `RagDocument`, `AiMemory`, `Notification`, `Appointment`, `SupportTicket`** — without these, audit logs can't answer "who changed this?".

### P2 — Architectural unification (do this quarter)

11. **Consolidate the two memory services**: delete `rag/memory/conversation-memory.service.ts`'s duplicates and fold its unique features (summarization, extraction, short-term memory) into `backend/ai/memory.service.ts`. Wire `extractMemories` into `endConversation`.
12. **Consolidate the two knowledge services**: `backend/knowledge/knowledge.service.ts` should delegate to `rag/ingestion/ingestion-service.ts` + `rag/retriever/retrieval-service.ts`. Delete the character-based chunker, the raw-SQL `vectorSearch`, and the per-chunk `embedChunks` loop.
13. **Single source of truth for schema**: run `prisma db pull` against a migration-applied DB, diff against `schema.prisma`, reconcile. Add a CI check that fails on drift.
14. **Add `deletedAt` to every Prisma model** + a Prisma extension that auto-injects `deletedAt: null` into every `findMany`/`findUnique`/`updateMany`/`deleteMany` WHERE clause.
15. **Add Redis hot tier for memory**: cache top-50 memories per user, TTL=1h, invalidate on write. (ADR 0004 already mandates Redis.)

### P3 — Feature completeness (do this year)

16. **Add embedding column to `ai_memory`** + HNSW index for semantic memory retrieval.
17. **Add memory consolidation cron**: nightly extract + summarize + decay.
18. **Add OCR** via `tesseract.js` for scanned PDFs.
19. **Add PPTX/XLSX loaders**.
20. **Add document versioning** (`version`, `parentDocumentId`, `diff`).
21. **Add embedding cache** (`contentHash` on `RagChunk`).
22. **Add `RagQuery.feedback` endpoint** + retrieval evaluation pipeline (the `rag/evaluation/` package exists but isn't wired).
23. **Add cost tracking** (`costUsd`, `tokensUsed` on `RagQuery`).
24. **Add streaming SSE** for `query` endpoint.
25. **Add hybrid BM25 + vector search** with cross-encoder re-ranker (documented in `INDEX.md:347` but not implemented).
26. **Add audit-log partition automation** (`pg_partman` or cron) — partitions run out after 13 months.
27. **Add `@@index([tenantId, createdAt])`** to every tenant-scoped Prisma model missing it (AuditLog, AccessLog, DataChange, WebhookEvent, AnalyticsEvent, MetricValue, etc.).
28. **Replace N+1 inserts**: `conversation-memory.service.ts:263` (per-memory `create` → `createMany`), `knowledge.service.ts:602` (per-chunk UPDATE → batch UPDATE).

### P4 — Polish

29. **Add CHECK constraints in Prisma** (or at least document that SQL is the source of truth and Prisma is read-only).
30. **Delete the dead `Embedding` Prisma model** (line 872) — it has no underlying SQL table.
31. **Add `PaymentStatus` enum usage** to `Order.paymentStatus` (the enum exists but the column is `String`).
32. **Add per-format ingestion metrics** to `getStats`.
33. **Add category/tag filter to `vectorSearch`** — `ChunkMetadata` carries them but the query ignores them.

---

**End of audit.** No files were modified. All findings cite specific file paths and line numbers in the evidence above.
