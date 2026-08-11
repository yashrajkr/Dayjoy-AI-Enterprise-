# Dayjoy AI Enterprise — Database Layer

> Production-ready PostgreSQL + Prisma database for the Dayjoy AI Enterprise Platform.

## Quick Start

```bash
# 1. Set up environment
cd database
cp .env.example .env
# Edit .env with your DATABASE_URL

# 2. Run complete setup (migrations + functions + views + triggers + seed)
bash scripts/setup.sh

# 3. Validate
bash scripts/validate.sh

# 4. Open Prisma Studio (GUI)
npx prisma studio --schema prisma/schema.prisma
```

## Folder Structure

```
database/
├── prisma/
│   ├── schema.prisma              # Unified Prisma schema (67 models, 28 enums, 1723 lines)
│   └── _reference-schemas/        # Archive of source schemas (for reference only)
├── migrations/                    # 14 SQL migrations (run in order 001→014)
│   ├── 001_initial.sql            # Extensions + utility functions
│   ├── 002_auth.sql               # Multi-tenant + RBAC + auth
│   ├── 003_products.sql           # Products + categories + inventory + reviews
│   ├── 004_customers.sql          # Customers + leads + interactions + tickets + appointments
│   ├── 005_orders.sql             # Distributors + orders + items + commissions + shipments
│   ├── 006_ai.sql                 # AI agents + conversations + messages + memory + tools
│   ├── 007_channels.sql           # Voice + WhatsApp + website chat + telephony
│   ├── 008_notifications.sql      # Templates + notifications + logs + preferences
│   ├── 009_automation.sql         # Workflows + executions + triggers + scheduled jobs
│   ├── 010_analytics.sql          # Events + metrics + dashboards + reports
│   ├── 011_audit.sql              # Activity logs + webhook events + integrations + tenant config
│   ├── 012_indexes.sql            # Composite + covering indexes (performance)
│   ├── 013_constraints.sql        # CHECK constraints + status transitions + business triggers
│   ├── 014_final.sql              # RLS policies + permissions + audit triggers
│   └── _archived/                 # Pre-consolidation migrations (for reference)
├── functions/
│   └── utility_functions.sql      # 12 reusable PL/pgSQL functions
├── views/
│   └── common_views.sql           # 10 materialized views for reporting
├── triggers/
│   └── business_triggers.sql      # 9 additional business logic triggers
├── seed/
│   └── seed.ts                    # TypeScript seed script (roles, permissions, admin user)
├── scripts/
│   ├── setup.sh                   # One-command setup
│   ├── validate.sh                # Verify everything is in place
│   ├── reset.sh                   # Drop + recreate (dev only)
│   ├── backup.sh                  # Create timestamped backup
│   ├── restore.sh                 # Restore from backup
│   └── vector-store-indexes.sql   # HNSW indexes for pgvector
├── backups/                       # Backup files land here (.dump.gz)
├── docs/                          # Database documentation
│   └── IMPLEMENTATION_02_DATABASE_SQL_GENERATOR.md
├── documentation/                 # Detailed guides
│   ├── SETUP_GUIDE.md
│   ├── MIGRATION_GUIDE.md
│   ├── SEED_GUIDE.md
│   ├── BACKUP_GUIDE.md
│   ├── RECOVERY_GUIDE.md
│   └── TROUBLESHOOTING_GUIDE.md
├── .env.example                   # All env vars documented
└── README.md                      # This file
```

## Schema Overview

**67 Prisma models** organized into 10 domains:

| Domain | Models | Tables |
|---|---|---|
| **Core / Auth** | Tenant, User, Session, PasswordResetToken, EmailVerificationToken, Role, Permission, RolePermission, UserRole | 9 |
| **Compliance** | ComplianceRecord, RetentionPolicy | 2 |
| **Business** | Customer, CustomerAddress, Lead, LeadSource, Interaction, FollowUp, SupportTicket, Appointment | 8 |
| **Distributors** | Distributor, DistributorCommission | 2 |
| **Products** | ProductCategory, Product, Inventory, InventoryTransaction, ProductReview | 5 |
| **Orders** | Order, OrderItem, Shipment | 3 |
| **AI** | AiAgent, Conversation, Message, AiMemory, ToolExecution | 5 |
| **Channels** | VoiceSession, VoiceTranscript, VoiceAnalytics, WhatsAppSession, WhatsAppMessage, WhatsAppContact, WebsiteChat, TelephonyCall | 8 |
| **Notifications** | NotificationTemplate, Notification, NotificationLog, NotificationPreference | 4 |
| **Automation** | Workflow, WorkflowVersion, WorkflowTrigger, WorkflowStep, WorkflowExecution, ExecutionLog, ScheduledJob | 7 |
| **Analytics** | AnalyticsEvent, Metric, MetricValue, Dashboard, DashboardWidget, Report, ReportSchedule, WebSession | 8 |
| **Audit** | AuditLog, AccessLog, ActivityLog, WebhookEvent, Integration, TenantConfig, KnowledgeArticle | 7 |
| **RAG** | RagSource, RagDocument, RagChunk, Embedding, RagEmbedding, RagQuery | 6 |

## Key Features

### Multi-Tenancy via Row-Level Security (RLS)

Every tenant-scoped table has RLS enabled. The application sets the tenant context per request:

```sql
SET app.current_tenant = '<tenant-uuid>';
```

All subsequent queries automatically filter to only that tenant's rows. The policy is enforced via `current_tenant_id()` function.

### Audit Trail

Critical tables (customers, orders, products, users, distributors, leads) have audit triggers that log every INSERT/UPDATE/DELETE to `audit_logs` (partitioned monthly for performance).

### Auto-Updating Timestamps

Every table with `updated_at` has a trigger that auto-updates the timestamp on row update — no need to set it manually in application code.

### Order Status State Machine

Orders have a status transition validation trigger (`validate_order_status_transition`). Only valid transitions are allowed:

```
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → RETURNED → REFUNDED
   ↓          ↓            ↓
CANCELLED  CANCELLED    CANCELLED
```

### Inventory Management

- `order_items` insert triggers automatically reserve inventory
- Order cancellation releases reserved stock
- Order delivery deducts from `quantity`
- Prevents overselling via CHECK at INSERT time

### Customer LTV Auto-Update

When an order is marked as DELIVERED, the customer's `lifetime_value` and `total_orders` are auto-incremented.

### Distributor Commission Auto-Create

When an order is assigned to a distributor, a `distributor_commission` row is auto-created with `amount = order.total * distributor.commission_rate / 100`.

### Soft Deletes

Customer-facing entities (customers, distributors, products, users, leads) support soft delete via `deleted_at` column. All queries use `WHERE deleted_at IS NULL` (enforced via partial indexes).

### pgvector for RAG

The `vector` extension is enabled. The `rag_chunks` table uses `vector(1536)` for OpenAI `text-embedding-3-small` embeddings. HNSW indexes provide fast similarity search.

## Common Commands

```bash
# Setup (first time)
bash scripts/setup.sh

# Validate
bash scripts/validate.sh

# Reset (DROP + recreate, dev only)
bash scripts/reset.sh

# Backup
bash scripts/backup.sh

# Restore
bash scripts/restore.sh backups/dayjoy_ai_20260101_120000.dump.gz

# Generate Prisma client (after schema changes)
npx prisma generate --schema prisma/schema.prisma

# Open Prisma Studio
npx prisma studio --schema prisma/schema.prisma

# Run a single migration manually
psql $DATABASE_URL -f migrations/003_products.sql

# Connect to DB
psql $DATABASE_URL

# Show tables
psql $DATABASE_URL -c "\dt public.*"

# Show table schema
psql $DATABASE_URL -c "\d public.users"

# Check RLS policies
psql $DATABASE_URL -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';"
```

## Environment Variables

See `.env.example` for the complete list. Key variables:

```bash
# Required
DATABASE_URL=postgresql://dayjoy:password@localhost:5432/dayjoy_ai

# Connection pool
DATABASE_POOL_SIZE=20
DATABASE_CONNECTION_TIMEOUT=30000

# Optional
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
```

## Production Checklist

Before deploying to production:

- [ ] `DATABASE_URL` uses SSL (`?sslmode=require`)
- [ ] Database user has only the privileges needed (not superuser)
- [ ] RDS security group restricts ingress to application SG only
- [ ] Automated daily backups configured (RDS automated backups or cron + `backup.sh`)
- [ ] Point-in-time recovery enabled (RDS)
- [ ] Multi-AZ enabled (RDS)
- [ ] Connection pooling configured (PgBouncer or RDS Proxy)
- [ ] `pg_stat_statements` enabled for query monitoring
- [ ] Slow query log enabled (`log_min_duration_statement = 1000`)
- [ ] Vacuum schedule configured (autovacuum tuned)
- [ ] Monitoring: connection count, replication lag, disk usage, slow queries
- [ ] Retention policies enforced (`cleanup_old_audit_logs`, `archive_old_conversations`)
- [ ] All passwords rotated in the last 90 days
- [ ] SSL/TLS enforced for all connections

## Documentation

- [Setup Guide](documentation/SETUP_GUIDE.md) — Step-by-step installation
- [Migration Guide](documentation/MIGRATION_GUIDE.md) — How to add new migrations
- [Seed Guide](documentation/SEED_GUIDE.md) — How to seed data
- [Backup Guide](documentation/BACKUP_GUIDE.md) — Backup strategy
- [Recovery Guide](documentation/RECOVERY_GUIDE.md) — Disaster recovery
- [Troubleshooting Guide](documentation/TROUBLESHOOTING_GUIDE.md) — Common issues

## Tech Stack

| Component | Technology |
|---|---|
| Database | PostgreSQL 15+ |
| ORM | Prisma 6 |
| Vector Search | pgvector |
| Full-text Search | PostgreSQL tsvector + GIN indexes |
| Fuzzy Search | pg_trgm |
| Multi-tenancy | Row-Level Security (RLS) |
| Audit | PL/pgSQL triggers |
| Partitioning | Range partitioning on time columns |
| Connection Pooling | PgBouncer (production) |

## License

Proprietary. See `LICENSE` at the repository root.
