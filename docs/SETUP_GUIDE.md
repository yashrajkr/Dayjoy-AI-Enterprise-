# Dayjoy AI Enterprise — Complete Setup Guide

> This guide walks you through setting up the entire Dayjoy AI Enterprise Platform
> from scratch, from prerequisites to production deployment. Every command below
> is copy-pasteable. If anything is unclear, jump to the
> [Troubleshooting](#troubleshooting) section at the bottom.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Docker)](#quick-start-docker)
3. [Manual Setup](#manual-setup)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Backend Setup](#backend-setup)
7. [Frontend Setup](#frontend-setup)
8. [AI Channels Setup](#ai-channels-setup)
9. [n8n Automation Setup](#n8n-automation-setup)
10. [Monitoring Setup](#monitoring-setup)
11. [Production Deployment](#production-deployment)
12. [Troubleshooting](#troubleshooting)
13. [Next Steps After Setup](#next-steps-after-setup)

---

## Prerequisites

### Required Software

| Software       | Version | Purpose                              |
| -------------- | ------- | ------------------------------------ |
| Node.js        | 18+     | Backend (NestJS) + Frontend runtime  |
| pnpm           | 8+      | Package manager (monorepo workspaces)|
| PostgreSQL     | 15+     | Primary database                     |
| pgvector       | 0.5+    | Vector similarity search (RAG)       |
| Redis          | 7+      | Cache + sessions + rate-limit state  |
| Docker         | 24+     | Container runtime (recommended)      |
| Docker Compose | v2+     | Multi-service orchestration          |
| Git            | 2.40+   | Version control                      |
| `openssl`      | any     | Generate secrets (JWT, webhooks)     |
| `psql`         | 15+     | PostgreSQL CLI (for manual setup)    |

### API Keys Required

| Service             | Purpose                  | Where to Get                                         | Required?              |
| ------------------- | ------------------------ | ---------------------------------------------------- | ---------------------- |
| OpenAI              | LLM + Embeddings         | <https://platform.openai.com/api-keys>               | **YES** (AI core)      |
| Vapi                | Voice AI                 | <https://dashboard.vapi.ai>                          | Voice channel only     |
| Meta WhatsApp       | WhatsApp AI              | <https://developers.facebook.com/apps>               | WhatsApp channel only  |
| Twilio              | SMS + Telephony fallback | <https://twilio.com/console>                         | Telephony channel only |
| SendGrid / AWS SES  | Transactional email      | <https://sendgrid.com> or AWS Console                | Email channel only     |
| Stripe / Razorpay   | Payments                 | <https://dashboard.stripe.com> / Razorpay dashboard  | Payments only          |
| AWS                 | S3 / EKS / Secrets Mgr   | <https://console.aws.amazon.com>                     | Production hosting     |

### Infrastructure (Production)

| Resource       | Purpose                                  |
| -------------- | ---------------------------------------- |
| AWS Account    | Hosting (EKS, RDS, ElastiCache, S3)      |
| Domain Name    | DNS (`dayjoy.ai`, `api.dayjoy.ai`, etc.) |
| SSL Certificate| HTTPS termination (ACM / cert-manager)   |
| Slack webhook  | Alertmanager notifications (optional)    |

---

## Quick Start (Docker)

The fastest way to get everything running locally.

```bash
# 1. Clone the repository
git clone <repo-url>
cd dayjoy-ai-enterprise

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your values
# REQUIRED at minimum:
#   DATABASE_URL=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai
#   REDIS_URL=redis://localhost:6379
#   JWT_SECRET=$(openssl rand -hex 32)
#   SESSION_SECRET=$(openssl rand -hex 32)
#   OPENAI_API_KEY=<your-key>
nano .env

# 4. Start infrastructure (PostgreSQL + pgvector + Redis)
docker compose up -d postgres redis

# 5. Wait for them to be healthy
docker compose ps   # Both should show "(healthy)"

# 6. Run database migrations (all 14, in order)
cd database
for f in migrations/0*.sql; do
  echo "Applying $f..."
  psql "$DATABASE_URL" -f "$f"
done
cd ..

# 7. Generate Prisma client (used by NestJS backend)
npx prisma generate --schema database/prisma/schema.prisma

# 8. Seed database (creates default tenant + admin/manager/agent users)
npx tsx database/seed/seed.ts

# 9. Install backend dependencies + start in dev mode
cd backend
pnpm install
pnpm start:dev
# Backend runs at http://localhost:3000
# API docs (Swagger) at http://localhost:3000/docs
# Health:        http://localhost:3000/health
# Readiness:     http://localhost:3000/health/ready

# 10. In a NEW terminal, install + start the admin dashboard
cd apps/admin-dashboard
pnpm install
pnpm dev --port 3003
# Admin dashboard at http://localhost:3003
```

Log in with seeded credentials (see [Database Setup → Seed Database](#seed-database)).

---

## Manual Setup

Skip this section if you used [Quick Start (Docker)](#quick-start-docker).
Use this if you prefer to install PostgreSQL, Redis, and Node natively.

### Step 1: Install PostgreSQL with pgvector

```bash
# Ubuntu/Debian
sudo apt install postgresql-15 postgresql-15-pgvector

# macOS
brew install postgresql@15 pgvector

# Or use Docker (recommended — no host install needed)
docker run -d --name dayjoy-postgres \
  -e POSTGRES_USER=dayjoy \
  -e POSTGRES_PASSWORD=dayjoy \
  -e POSTGRES_DB=dayjoy_ai \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg15
```

### Step 2: Install Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server

# macOS
brew install redis

# Or use Docker
docker run -d --name dayjoy-redis \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Step 3: Install Node.js + pnpm

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18
nvm use 18

# Install pnpm globally
npm install -g pnpm@8

# Verify
node --version    # v18.x or higher
pnpm --version    # 8.x
```

### Step 4: Clone + Install

```bash
git clone <repo-url>
cd dayjoy-ai-enterprise
pnpm install   # installs all workspaces (backend, apps/*, packages/*)
```

---

## Environment Configuration

### Required Variables

Create `.env` in the repository root:

```bash
# === REQUIRED (App will NOT start without these) ===
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
APP_VERSION=1.0.0
DATABASE_URL=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai
REDIS_URL=redis://localhost:6379
JWT_SECRET=            # Generate:  openssl rand -hex 32   (min 32 chars)
SESSION_SECRET=        # Generate:  openssl rand -hex 32   (min 32 chars)
OPENAI_API_KEY=        # From OpenAI platform
CORS_ORIGIN=http://localhost:3003
CORS_ORIGINS=          # Comma-separated list (takes precedence over CORS_ORIGIN)
UPLOAD_MAX_SIZE=10485760   # 10 MB
DEFAULT_TENANT_ID=     # Seeded tenant UUID (multi-tenant routing)
LOG_LEVEL=info

# === AI Channels (only configure the channels you intend to use) ===
# Voice AI (Vapi)
VAPI_API_KEY=
VAPI_WEBHOOK_SECRET=        # Generate: openssl rand -hex 32
VAPI_WEBHOOK_URL=https://api.dayjoy.ai/api/voice/webhook
VAPI_ASSISTANT_ID=
VAPI_VOICE_ID=rachel
VAPI_PHONE_NUMBER_ID=

# WhatsApp AI (Meta Cloud API)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_APP_SECRET=                # From Meta App dashboard (HMAC signature verification)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=  # Generate: openssl rand -hex 16
WHATSAPP_WEBHOOK_SECRET=        # Generate: openssl rand -hex 32

# === Telephony (optional fallback) ===
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WEBHOOK_URL=

# === Email (optional — log provider used if SMTP_PASSWORD is empty) ===
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=
SMTP_FROM=no-reply@dayjoy.ai

# === Payments (optional) ===
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# === File storage (optional in dev; required in prod) ===
S3_BUCKET=dayjoy-ai-uploads
S3_REGION=ap-south-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# === Vector DB (optional — pgvector is used by default) ===
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# === Monitoring (optional) ===
APM_ENABLED=false
SENTRY_DSN=
DATADOG_API_KEY=

# === Feature flags (all default to false unless explicitly set) ===
FEATURE_VOICE_RECORDING=true
FEATURE_TRANSCRIPTION=true
FEATURE_SENTIMENT_ANALYSIS=true
FEATURE_HUMAN_TRANSFER=true
FEATURE_AI_EVALUATION=false
FEATURE_WHATSAPP_BOT=false

# === Rate limiting ===
RATE_LIMIT_AUTH_WINDOW_MS=900000      # 15 min
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_API_WINDOW_MS=60000        # 1 min
RATE_LIMIT_API_MAX=100

# === Frontend (each portal has its own .env.local, see Frontend Setup) ===
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_VOICE_WIDGET_URL=
NEXT_PUBLIC_WHATSAPP_NUMBER=

# === AWS / production secrets ===
AWS_REGION=ap-south-1
AWS_SECRET_MANAGER_SECRET_ID=dayjoy/prod

# === Backups ===
BACKUP_S3_BUCKET=dayjoy-ai-backups
BACKUP_SCHEDULE=0 2 * * *

# === Field-level encryption (PII, API keys at rest) ===
ENCRYPTION_KEY=          # Generate:  openssl rand -hex 32   (must be 32 bytes hex)
```

### Variable Classification

| Variable                       | Required?             | Dev | Prod | Purpose                                           |
| ------------------------------ | --------------------- | --- | ---- | ------------------------------------------------- |
| `DATABASE_URL`                 | **YES**               | ✅  | ✅   | PostgreSQL connection string                      |
| `REDIS_URL`                    | **YES**               | ✅  | ✅   | Cache + sessions + rate-limit state               |
| `JWT_SECRET`                   | **YES** (≥32 chars)   | ✅  | ✅   | JWT signing secret                                |
| `SESSION_SECRET`               | **YES** (≥32 chars)   | ✅  | ✅   | Session cookie signing                            |
| `OPENAI_API_KEY`               | **YES** (for AI)      | ✅  | ✅   | LLM + embeddings (RAG, chat, voice)               |
| `ENCRYPTION_KEY`               | **YES** (prod)        | ⚠️  | ✅   | Field-level encryption (PII, API keys at rest)    |
| `VAPI_API_KEY`                 | Voice channel only    | ✅  | ✅   | Vapi Voice AI                                     |
| `WHATSAPP_TOKEN`               | WhatsApp channel only | ✅  | ✅   | Meta WhatsApp Cloud API                           |
| `TWILIO_AUTH_TOKEN`            | Telephony only        | ✅  | ✅   | Twilio SMS + voice fallback                       |
| `SMTP_PASSWORD`                | Email channel only    | ✅  | ✅   | Transactional email (SendGrid/SES)                |
| `STRIPE_SECRET_KEY`            | Payments only         | —   | ✅   | Stripe                                            |
| `RAZORPAY_KEY_SECRET`          | India payments only   | —   | ✅   | Razorpay                                          |
| `S3_ACCESS_KEY_ID`             | File uploads only     | —   | ✅   | S3 file storage                                   |
| `SENTRY_DSN`                   | Optional              | —   | ✅   | Error tracking                                    |
| `AWS_SECRET_MANAGER_SECRET_ID` | Prod only             | —   | ✅   | External Secrets Operator sync                    |

> **Tip:** A complete, commented template is in [`.env.example`](../.env.example) at the repo root.

---

## Database Setup

### Create Database + Extensions

```bash
# Connect to PostgreSQL as a superuser
psql -U dayjoy -d postgres

# Create database (skip if it already exists from docker-compose)
CREATE DATABASE dayjoy_ai;

# Connect to it + enable required extensions
\c dayjoy_ai
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- trigram search (fuzzy matching)
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector (RAG embeddings)
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive text (emails)

# Exit
\q
```

### Run Migrations

```bash
cd database

# Apply all 14 migrations in order (001_initial.sql → 014_final.sql)
for f in migrations/0*.sql; do
  echo "Applying $f..."
  psql "$DATABASE_URL" -f "$f"
done

# Optional: business triggers + utility functions + views
psql "$DATABASE_URL" -f triggers/business_triggers.sql
psql "$DATABASE_URL" -f functions/utility_functions.sql
psql "$DATABASE_URL" -f views/common_views.sql
```

The 14 migrations build the schema in this order:

| # | File                       | Creates                                                                  |
| - | -------------------------- | ------------------------------------------------------------------------ |
| 1 | `001_initial.sql`          | `tenants`, `users`, `roles`, `permissions`, audit log                    |
| 2 | `002_auth.sql`             | `refresh_tokens`, `password_resets`, `email_verifications`, `sessions`   |
| 3 | `003_products.sql`         | `products`, `categories`, `inventory`, `inventory_transactions`          |
| 4 | `004_customers.sql`        | `customers`, `addresses`, `customer_preferences`                         |
| 5 | `005_orders.sql`           | `orders`, `order_items`, `payments`, `shipments`, `returns`              |
| 6 | `006_ai.sql`               | `ai_agents`, `conversations`, `messages`, `memory`, `tool_calls`         |
| 7 | `007_channels.sql`         | `voice_sessions`, `whatsapp_messages`, `website_chats`                   |
| 8 | `008_notifications.sql`    | `notifications`, `notification_templates`, `notification_preferences`    |
| 9 | `009_automation.sql`       | `workflows`, `workflow_executions`, `workflow_steps`                     |
| 10| `010_analytics.sql`        | `analytics_events`, `kpis`, `ai_metrics`, `channel_metrics`              |
| 11| `011_audit.sql`            | `audit_logs` (partitioned), `change_events`                              |
| 12| `012_indexes.sql`          | Composite + GIN + vector indexes for performance                         |
| 13| `013_constraints.sql`      | Check constraints + foreign keys deferred                                 |
| 14| `014_final.sql`            | Seed metadata, default configs, finalise schema                          |

### Verify Database

```bash
# Run the built-in validator — checks tables, functions, views, triggers
bash database/scripts/validate.sh
```

You should see a series of `✓` lines and `All checks passed` at the end.

### Seed Database

```bash
# Generate Prisma client (backend uses Prisma)
npx prisma generate --schema database/prisma/schema.prisma

# Run the seed script (idempotent — safe to re-run)
npx tsx database/seed/seed.ts
```

**Default credentials after seed:**

| Role    | Email                  | Password       |
| ------- | ---------------------- | -------------- |
| Admin   | `admin@dayjoy.com`    | `Admin@123456` |
| Manager | `manager@dayjoy.com`  | `Demo@123456`  |
| Agent   | `agent@dayjoy.com`    | `Demo@123456`  |

> **Security:** Change these passwords immediately on first login in any
> non-local environment.

---

## Backend Setup

```bash
cd backend
pnpm install

# Development (hot reload via nest start --watch)
pnpm start:dev
# → http://localhost:3000
# → Swagger docs:  http://localhost:3000/docs
# → Health:        http://localhost:3000/health
# → Readiness:     http://localhost:3000/health/ready

# Production
pnpm build
pnpm start:prod

# Verify
curl http://localhost:3000/health/ready
# Expected: {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}}
```

### Useful Backend Scripts

```bash
pnpm test               # run unit tests (vitest)
pnpm test:watch         # watch mode
pnpm test:coverage      # with coverage report
pnpm test:e2e           # end-to-end tests
pnpm lint               # eslint
pnpm db:generate        # regenerate Prisma client after schema change
pnpm db:migrate:dev     # create + apply a new migration (dev only)
pnpm db:migrate:deploy  # apply pending migrations (prod)
pnpm db:seed            # seed database
```

---

## Frontend Setup

The platform ships with **five** Next.js applications. Each lives under
`apps/<name>/` and has its own `package.json`. Each portal needs its own
`.env.local` pointing at the backend.

### Admin Dashboard (port 3003)

```bash
cd apps/admin-dashboard
pnpm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
pnpm dev --port 3003
# → http://localhost:3003
```

### Customer Portal (port 3005)

```bash
cd apps/customer-portal
pnpm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
pnpm dev      # already pinned to port 3005 in package.json
# → http://localhost:3005
```

### Distributor Portal (port 3006)

```bash
cd apps/distributor-portal
pnpm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
pnpm dev --port 3006
# → http://localhost:3006
```

### Employee Portal (port 3007)

```bash
cd apps/employee-portal
pnpm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
pnpm dev      # already pinned to port 3007 in package.json
# → http://localhost:3007
```

### Website Chat Widget (port 3004)

```bash
cd apps/website-chat
pnpm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
pnpm dev --port 3004
# → http://localhost:3004
```

### Run All Frontends Concurrently

From the repo root:

```bash
pnpm dev    # uses concurrently to start backend + voice + whatsapp + admin
```

For all five portals, open separate terminals and run each `pnpm dev` from the
portal directory, or use a process manager like
[`concurrently`](https://www.npmjs.com/package/concurrently) /
[`pm2`](https://pm2.keymetrics.io/).

---

## AI Channels Setup

### Voice AI (Vapi)

1. **Create a Vapi account** — <https://dashboard.vapi.ai>
2. **Copy your API key** from the dashboard → set `VAPI_API_KEY` in `.env`.
3. **Create an assistant** using the config under `vapi/config/vapi-assistant-config.ts`:

   ```bash
   # Export the assistant config to JSON (run from repo root)
   npx tsx -e "import { VAPI_ASSISTANT_CONFIG } from './vapi/config/vapi-assistant-config'; \
     console.log(JSON.stringify(VAPI_ASSISTANT_CONFIG, null, 2))" \
     > /tmp/vapi-assistant.json

   # Create the assistant via Vapi API
   curl -X POST https://api.vapi.ai/assistant \
     -H "Authorization: Bearer $VAPI_API_KEY" \
     -H "Content-Type: application/json" \
     -d @/tmp/vapi-assistant.json

   # Copy the returned `id` and set it as VAPI_ASSISTANT_ID in .env
   ```

4. **Buy a phone number** in the Vapi dashboard.
5. **Configure the webhook** in Vapi:
   - URL: `https://api.dayjoy.ai/api/voice/webhook` (production)
     or `https://<tunnel>/api/voice/webhook` (dev — use `ngrok http 3000`)
   - Secret: set `VAPI_WEBHOOK_SECRET` in `.env` and use the same value in Vapi.
6. **Test:** Call the purchased phone number. Watch the backend logs — you
   should see `vapi-webhook-controller` receiving `call-started` events.

> Reference: `vapi/docs/vapi-quick-start.md`, `vapi/deployment/vapi-production-checklist.md`

### WhatsApp AI (Meta Cloud API)

1. **Create a Meta App** — <https://developers.facebook.com/apps> → type: Business.
2. **Add the WhatsApp product** → copy `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, and generate a permanent
   `WHATSAPP_TOKEN` (System User access token).
3. **Configure the webhook** in the Meta App Dashboard:
   - Callback URL: `https://api.dayjoy.ai/api/whatsapp/webhook`
   - Verify Token: must match `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `.env`
   - Subscribe to fields: `messages`, `message_statuses`
4. **Create message templates** (e.g. `order_confirmation`, `appointment_reminder`)
   and submit for Meta approval.
5. **Test:** Send any WhatsApp message to your business phone number — the
   backend will receive the webhook and route to the AI agent.

### Website AI (chat widget)

The website chat widget is already built (`apps/website-chat`). Two ways to use it:

**Option A — Standalone:**

```bash
cd apps/website-chat
pnpm dev --port 3004
# Visit http://localhost:3004
```

**Option B — Embed on your marketing site (production):**

```html
<!-- Add this snippet to your website HTML -->
<script src="https://chat.dayjoy.ai/widget.js" async></script>
<!-- A floating chat bubble will appear in the bottom-right corner -->
```

### RAG Knowledge Base

The RAG (Retrieval-Augmented Generation) pipeline is at `rag/` and exposed via
the backend's `/api/knowledge` endpoints.

**Ingest a document:**

```bash
# 1. Get a JWT (admin or manager)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dayjoy.com","password":"Admin@123456"}' \
  | jq -r .accessToken)

# 2. Ingest a document
curl -X POST http://localhost:3000/api/knowledge/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceName": "Product Catalog",
    "sourceType": "UPLOAD",
    "title": "Dayjoy Product Catalog",
    "content": "...markdown content here...",
    "mimeType": "text/markdown"
  }'
```

**Bulk ingest** from `packages/knowledge-base/` (the built-in knowledge corpus —
categories: `company`, `products`, `policies`, `faqs`, `support`, `marketing`,
`compliance`, `training`):

```bash
# Loop over markdown files in the knowledge base
for f in packages/knowledge-base/**/*.md; do
  curl -X POST http://localhost:3000/api/knowledge/ingest \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg title "$(basename "$f" .md)" --arg content "$(cat "$f")" \
      '{sourceName: $title, sourceType: "UPLOAD", title: $title, content: $content, mimeType: "text/markdown"}')"
done
```

**Query the knowledge base:**

```bash
curl -X POST http://localhost:3000/api/knowledge/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the return policy?","topK":5}'
```

---

## n8n Automation Setup

The platform ships **45 pre-built n8n workflows** covering CRM, sales, leads,
support, orders, email, calendar, notifications, AI, monitoring, and
error-handling.

### Deploy n8n

```bash
cd automation/n8n
cp .env.example .env   # if it doesn't exist, create one with the values below
# Edit .env:
#   N8N_HOST=0.0.0.0
#   N8N_PORT=5678
#   N8N_BASIC_AUTH_ACTIVE=true
#   N8N_BASIC_AUTH_USER=admin
#   N8N_BASIC_AUTH_PASSWORD=<your-password>
#   DAYJOY_API_URL=http://localhost:3000
#   DAYJOY_API_TOKEN=<jwt-or-api-key>
#   SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=...
docker-compose up -d
# n8n UI at http://localhost:5678
```

### Import Workflows

1. Open n8n UI → <http://localhost:5678>
2. Login with the credentials you set above.
3. For each of the 45 JSON files under `automation/n8n/workflows/**`:
   - Click **Workflows** → **Import from File**
   - Select the JSON file
   - Click **Save**
4. Configure the shared credentials once (used by all workflows):
   - `dayjoyApi` — HTTP Header Auth with the Dayjoy API token
   - `SMTP` — SMTP credentials for transactional email
   - `googleCalendar` — OAuth2 for calendar workflows
   - `slack` — Webhook URL for monitoring alerts
5. Activate the workflows you want to run (toggle in the top-right).

The 45 workflows are organised into:

| Category        | Files                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| `crm/`          | customer-creation, customer-enrichment, crm-sync, distributor-updates, employee-notifications |
| `sales/`        | sales-dashboard-sync, sales-forecast, revenue-recognition               |
| `leads/`        | lead-capture, lead-scoring, lead-assignment, follow-up-scheduling        |
| `support/`      | ticket-creation, ticket-assignment, ticket-escalation, ticket-auto-close |
| `orders/`       | order-created, payment-success, shipping-update, delivery-confirmation   |
| `email/`        | welcome-email, order-confirmation, appointment-confirmation, password-reset, reminder-email, follow-up-email |
| `calendar/`     | appointment-booking, appointment-reschedule, appointment-cancellation, appointment-reminders, calendar-sync |
| `notifications/`| multi-channel-dispatch, daily-digest, escalation, broadcast             |
| `ai/`           | knowledge-update-trigger, embedding-regeneration, memory-cleanup, conversation-summarization |
| `monitoring/`   | health-check, alert-rules, workflow-dashboard                            |
| `error-handling/`| retry-strategy, dead-letter-processor, global-error-handler            |

---

## Monitoring Setup

The repo includes a complete Prometheus + Grafana + Loki stack wired to the
backend's `/metrics` endpoint.

### Start the Monitoring Stack

```bash
# Option A: via the root docker-compose.yml
docker compose up -d prometheus grafana loki

# Option B: via the prod compose (includes alertmanager + node-exporter)
docker compose -f deployment/docker/docker-compose.prod.yml up -d \
  prometheus grafana loki
```

Service ports:

| Service     | URL                          | Default login |
| ----------- | ---------------------------- | ------------- |
| Prometheus  | <http://localhost:9090>      | none          |
| Grafana     | <http://localhost:3030>      | `admin/admin` |
| Loki        | <http://localhost:3100>      | none (API)    |

### Import Grafana Dashboards

5 pre-built dashboards are auto-provisioned via `monitoring/grafana/provisioning/`:

1. **API Overview** — request rate, latency p50/p95/p99, error rate, status codes
2. **Database** — connection pool, query latency, slow queries, table sizes
3. **Voice AI** — call volume, duration, sentiment, transfer rate, cost
4. **RAG** — retrieval latency, recall@k, citation rate, embedding throughput
5. **Business KPIs** — orders, revenue, customers, distributors, conversion

To verify they're loaded: open Grafana → **Dashboards** → you should see all 5.

### Configure Alerts

Alertmanager is pre-configured to send alerts to Slack. Edit
`monitoring/prometheus/alertmanager.yml`:

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#dayjoy-alerts'
        send_resolved: true
```

Alert rules are in `monitoring/prometheus/alert-rules.yaml` — covers high error
rate, high latency, DB connection exhaustion, Redis down, disk space, and AI
cost overrun.

---

## Production Deployment

### Option 1: Docker Compose (Small Scale / Staging)

```bash
# Build all images
docker compose -f docker-compose.yml build

# Start everything
docker compose -f docker-compose.yml up -d

# Verify
docker compose ps
curl http://localhost:3000/health/ready
```

For a hardened prod deployment, use the dedicated compose file:

```bash
docker compose -f deployment/docker/docker-compose.prod.yml up -d
```

### Option 2: Kubernetes (Production)

```bash
# 1. Provision cloud infrastructure with Terraform
cd deployment/terraform/environments/production
terraform init
terraform plan
terraform apply

# 2. Configure kubectl
aws eks update-kubeconfig --name dayjoy-prod --region ap-south-1

# 3. Create namespace
kubectl create namespace dayjoy

# 4. Apply manifests in order
kubectl apply -f deployment/kubernetes/01-base-manifests.yaml
kubectl apply -f deployment/kubernetes/02-voice-ai-manifests.yaml
kubectl apply -f deployment/kubernetes/03-external-secrets.yaml
kubectl apply -f deployment/kubernetes/04-cert-manager.yaml

# 5. Verify
kubectl get pods -n dayjoy
kubectl get ingress -n dayjoy
kubectl get hpa -n dayjoy
```

### Option 3: CI/CD Pipeline (Recommended)

The repo's GitHub Actions workflow (`.github/workflows/ci-cd.yml`) automatically:

1. Lint + typecheck (backend + frontend)
2. Run unit + integration tests
3. Run security scans — gitleaks, Semgrep, Snyk, pip-audit, npm audit, Trivy, checkov
4. Build + push Docker images to ECR
5. Deploy to **staging** on push to `develop`
6. Run DAST (OWASP ZAP) against staging
7. **Manually approve** production deployment (environment gate)
8. Deploy to **production** on push to `main` (after manual approval)
9. Run smoke tests + health checks
10. **Auto-rollback** on failure (kubectl rollout undo)

See [DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md) for the full
service topology + network flow.

### Required GitHub Secrets (for CI/CD)

| Secret                          | Purpose                                |
| ------------------------------- | -------------------------------------- |
| `AWS_ACCESS_KEY_ID`             | ECR + EKS access                       |
| `AWS_SECRET_ACCESS_KEY`         | ECR + EKS access                       |
| `SNYK_TOKEN`                    | Snyk dependency scan                   |
| `GITHUB_TOKEN` (auto)           | gitleaks + SARIF upload                |

### Required GitHub Variables (Settings → Secrets and variables → Actions → Variables)

| Variable         | Purpose                          | Example                          |
| ---------------- | -------------------------------- | -------------------------------- |
| `AWS_REGION`     | AWS region                       | `ap-south-1`                     |
| `ECR_REGISTRY`   | ECR registry URI                 | `123456789012.dkr.ecr.ap-south-1.amazonaws.com` |

---

## Troubleshooting

### Database Connection Failed

```bash
# 1. Check PostgreSQL is running
pg_isready -h localhost -p 5432
# Or via Docker:
docker compose ps postgres

# 2. Check credentials
psql "$DATABASE_URL" -c "SELECT 1;"

# 3. Check pgvector extension is enabled
psql "$DATABASE_URL" -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
# Expected: vector

# 4. If running in Docker, make sure the container is healthy
docker compose logs postgres | tail -30
```

### Backend Won't Start

```bash
# 1. Check env vars are loaded
cd backend
node -e "require('dotenv').config(); console.log({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET ? '(set)' : '(MISSING)',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '(set)' : '(MISSING)',
})"

# 2. Check Redis is reachable
redis-cli ping
# Expected: PONG

# 3. Check Prisma client is generated
ls node_modules/.prisma/client/index.d.ts
# If missing, run: pnpm db:generate

# 4. Tail the logs
pnpm start:dev 2>&1 | head -50
```

### AI Not Responding

```bash
# 1. Check OpenAI API key is valid
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | jq '.data | length'

# 2. Check RAG has documents ingested
psql "$DATABASE_URL" -c \
  "SELECT count(*) FROM rag_documents WHERE status = 'READY';"
# Should be > 0 if you've ingested knowledge

# 3. Check embeddings exist
psql "$DATABASE_URL" -c "SELECT count(*) FROM rag_embeddings;"
# Should match the number of chunks

# 4. Test the knowledge query endpoint directly
curl -X POST http://localhost:3000/api/knowledge/query \
  -H "Content-Type: application/json" \
  -d '{"query":"hello","topK":3}'
```

### Voice AI Not Working

```bash
# 1. Check the webhook endpoint is reachable
curl -X POST https://api.dayjoy.ai/api/voice/webhook \
  -H "x-vapi-signature: test" -d '{}' -i
# Should return 401 (signature invalid) — not 404 or 502

# 2. For local dev, expose the backend via tunnel
ngrok http 3000
# Then set VAPI_WEBHOOK_URL=https://<ngrok-id>.ngrok.io/api/voice/webhook
# Update the same in the Vapi dashboard

# 3. Verify env vars
echo "VAPI_API_KEY: ${VAPI_API_KEY:-(MISSING)}"
echo "VAPI_ASSISTANT_ID: ${VAPI_ASSISTANT_ID:-(MISSING)}"
echo "VAPI_WEBHOOK_SECRET: ${VAPI_WEBHOOK_SECRET:-(MISSING)}"

# 4. Check Vapi dashboard for call logs + recordings
```

### WhatsApp Not Working

```bash
# 1. Verify Meta webhook verification (GET request returns challenge)
curl "https://api.dayjoy.ai/api/whatsapp/webhook?\
hub.mode=subscribe&\
hub.verify_token=$WHATSAPP_WEBHOOK_VERIFY_TOKEN&\
hub.challenge=test"
# Expected: test

# 2. Check WhatsApp API access
curl "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN"
# Should return the phone number details

# 3. Common issues:
#    - Webhook not verified in Meta dashboard
#    - Template not approved (for outbound proactive messages)
#    - Recipient not in 24h window (for free-form messages)
```

### Frontend Can't Reach Backend

```bash
# 1. Verify backend is up
curl http://localhost:3000/health

# 2. Check the portal's .env.local
cat apps/admin-dashboard/.env.local
# Should contain NEXT_PUBLIC_API_URL=http://localhost:3000

# 3. Check CORS — backend must allow the portal origin
# In .env: CORS_ORIGIN=http://localhost:3003
# Or use CORS_ORIGINS=http://localhost:3003,http://localhost:3005,...

# 4. Restart the dev server (Next.js doesn't hot-reload .env.local)
cd apps/admin-dashboard && pnpm dev --port 3003
```

### n8n Workflows Not Firing

```bash
# 1. Check n8n is running
docker compose -f automation/n8n/docker-compose.yml ps

# 2. Check workflow is "Active" in n8n UI
# 3. Check credentials are valid (n8n UI → Credentials → test each)
# 4. Check execution history (n8n UI → Executions)
# 5. Check the Dayjoy API token isn't expired
curl -H "Authorization: Bearer $DAYJOY_API_TOKEN" \
  http://localhost:3000/api/auth/me
```

### Docker Compose Issues

```bash
# Reset everything (WARNING: deletes all data)
docker compose down -v
docker compose up -d

# View logs for a specific service
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f redis

# Rebuild a single service
docker compose build backend
docker compose up -d backend
```

---

## Next Steps After Setup

1. **Test all channels** — make a voice call, send a WhatsApp message, use
   the website chat widget. Verify each one reaches the backend and gets an
   AI response.
2. **Ingest knowledge base** — upload product docs, FAQs, policies, and
   training material to RAG. See [RAG Knowledge Base](#rag-knowledge-base).
3. **Create AI agents** — configure one AI agent per channel (voice, WhatsApp,
   website, employee-assistant) via the admin dashboard → **AI Console**.
4. **Set up automation** — import the 45 n8n workflows and configure
   credentials. See [n8n Automation Setup](#n8n-automation-setup).
5. **Configure monitoring** — verify dashboards load, set up Slack alerts.
   See [Monitoring Setup](#monitoring-setup).
6. **Run the test suite** — `pnpm test` at the repo root runs all unit +
   integration tests. See `testing/README.md` for security, performance,
   and AI-eval suites.
7. **Set up backups** — `bash deployment/scripts/backup-postgres.sh` (manual)
   or schedule via cron / `BACKUP_SCHEDULE`.
8. **Deploy to production** — use the CI/CD pipeline (Option 3 above) or
   manual Kubernetes deployment (Option 2).
9. **Harden secrets** — move all secrets to AWS Secrets Manager and sync via
   External Secrets Operator (already configured in
   `deployment/kubernetes/03-external-secrets.yaml`).
10. **Configure SSL** — cert-manager is wired up in
    `deployment/kubernetes/04-cert-manager.yaml`. Point your DNS at the EKS
    ingress and a certificate will be auto-issued via Let's Encrypt.

---

**Need more detail?**
- Architecture: [`docs/architecture/`](./architecture/)
- API reference: [`docs/api/`](./api/)
- Security: [`docs/security/`](./security/)
- Operations runbook: [`docs/operations/OPS_RUNBOOK.md`](./operations/OPS_RUNBOOK.md)
- Deployment topology: [`docs/DEPLOYMENT_ARCHITECTURE.md`](./DEPLOYMENT_ARCHITECTURE.md)
