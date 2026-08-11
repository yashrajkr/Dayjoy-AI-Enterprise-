# Dayjoy AI Enterprise — Production Launch Checklist

**Document Date:** 2026-08-07
**Companion Documents:**
- `PRODUCTION_READINESS_AUDIT.md` (detailed 24-phase audit)
- `PRODUCTION_READINESS_REPORT.md` (executive summary + status table)

---

## How To Use This Checklist

This checklist is **ordered by dependency** — each section's items must be
completed before the next section begins. Items marked **[P0 BLOCKER]**
must be resolved before ANY staging deployment. Items marked **[P1]** must
be resolved before production go-live. Items marked **[P2]** are
recommended improvements.

The checklist is honest about the current state of the repository. Where
the codebase has known gaps (WhatsApp AI not implemented, Website Chat
backend not implemented, Prisma `@map` mismatch, CI/CD misconfigured),
the checklist says so explicitly and provides remediation steps.

**Current platform status: NOT READY — 7 P0 BLOCKERS must be resolved
before proceeding to Section 2.**

---

## Section 0: P0 Blocker Remediation (MUST COMPLETE FIRST)

> **STOP.** Do not proceed to Section 1 until all 7 items in this section
> are complete. These are the issues found by the production readiness
> audit that prevent the backend from compiling, the database from
> querying, and CI/CD from running.

### 0.1 [P0 BLOCKER] Fix broken backend imports

The backend does not compile because `backend/app.module.ts` imports two
modules that do not exist on disk.

- [ ] **Option A (recommended for staging): Comment out broken imports**
  - [ ] Open `backend/app.module.ts`
  - [ ] Comment out line 43: `import { WebsiteChatModule } from './website-chat/website-chat.module';`
  - [ ] Comment out line 112: `import { WhatsAppModule } from '../whatsapp-ai/whatsapp.module';`
  - [ ] Comment out line 181: `WebsiteChatModule,` in the `imports` array
  - [ ] Comment out line 216: `WhatsAppModule,` in the `imports` array
  - [ ] Verify: `cd backend && pnpm typecheck` passes
  - [ ] Verify: `cd backend && pnpm build` succeeds

- [ ] **Option B (full fix): Implement the missing modules**
  - [ ] Implement `backend/website-chat/` module (see Section 0.4)
  - [ ] Implement `whatsapp-ai/` module (see Section 0.3)
  - [ ] Verify: `cd backend && pnpm typecheck` passes
  - [ ] Verify: `cd backend && pnpm build` succeeds

### 0.2 [P0 BLOCKER] Add Prisma `@map` field annotations

The Prisma schema uses camelCase field names but the SQL migrations create
snake_case columns. **Zero of 1,119 fields have `@map` annotations.**
Every Prisma query will fail at runtime.

- [ ] Write a script (using `@prisma/sdk` or a custom AST walker) to
      generate `@map("snake_case")` annotations for every field in
      `database/prisma/schema.prisma` based on the SQL migrations in
      `database/migrations/`
- [ ] Apply the annotations to `database/prisma/schema.prisma`
- [ ] Verify: `grep -cE '^\s+\w+\s+\S+.*@map\("' database/prisma/schema.prisma`
      returns ~1,119 (one per field)
- [ ] Regenerate Prisma Client: `cd backend && pnpm db:generate`
- [ ] Run seed against a fresh test DB: `createdb dayjoy_test && psql -d dayjoy_test -f database/migrations/00*.sql && cd backend && pnpm db:seed`
- [ ] Verify seed succeeds (no "column does not exist" errors)
- [ ] Run a smoke test: `npx tsx -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.user.findFirst().then(u => console.log(u));"`
- [ ] Verify a user is returned without error

**Alternative fix (more disruptive):** Regenerate migrations from the
schema using `prisma migrate dev --name init`. This discards the existing
14 hand-written migrations. Only do this if the team prefers Prisma-managed
migrations over the current SQL-based approach.

### 0.3 [P0 BLOCKER] Implement WhatsApp AI subsystem

The `whatsapp-ai/` directory contains only `README.md`. The worklog
claims 42+ files were created but none exist on disk. If you choose
Option A in 0.1 (comment out the import), skip this section for now
and circle back before production go-live.

- [ ] Create `whatsapp-ai/package.json` (NestJS dependencies)
- [ ] Create `whatsapp-ai/tsconfig.json` (mirror `backend/tsconfig.json`)
- [ ] Create `whatsapp-ai/whatsapp.module.ts` (root module)
- [ ] Implement config subfolder:
  - [ ] `whatsapp-ai/config/whatsapp-config.module.ts`
  - [ ] `whatsapp-ai/config/whatsapp-config.service.ts` (env config + token management)
  - [ ] `whatsapp-ai/config/whatsapp-config.dto.ts`
- [ ] Implement client subfolder:
  - [ ] `whatsapp-ai/client/whatsapp-client.module.ts`
  - [ ] `whatsapp-ai/client/whatsapp-client.service.ts` (Meta Cloud API wrapper)
- [ ] Implement webhook subfolder:
  - [ ] `whatsapp-ai/webhook/whatsapp-webhook.module.ts`
  - [ ] `whatsapp-ai/webhook/whatsapp-webhook.controller.ts` (GET verify + POST receive)
  - [ ] `whatsapp-ai/webhook/whatsapp-webhook.service.ts` (HMAC-SHA256 signature verify + dispatch)
  - [ ] `whatsapp-ai/webhook/handlers/message.handler.ts`
  - [ ] `whatsapp-ai/webhook/handlers/status.handler.ts`
  - [ ] `whatsapp-ai/webhook/handlers/error.handler.ts`
- [ ] Implement services subfolder:
  - [ ] `whatsapp-ai/services/whatsapp-services.module.ts`
  - [ ] `whatsapp-ai/services/whatsapp-message-processor.service.ts` (AI pipeline reusing shared OPENAI_CLIENT + ToolsService)
  - [ ] `whatsapp-ai/services/whatsapp-session-memory.service.ts` (Redis-backed)
- [ ] Implement AI subfolder (per worklog `whatsapp-agent-w2-ai-rich`):
  - [ ] `whatsapp-ai/ai/whatsapp-ai.service.ts`
  - [ ] `whatsapp-ai/ai/whatsapp-ai.module.ts`
- [ ] Implement rich-messages subfolder:
  - [ ] `whatsapp-ai/rich-messages/interactive-messages.service.ts`
  - [ ] `whatsapp-ai/rich-messages/media-messages.service.ts`
  - [ ] `whatsapp-ai/rich-messages/template-messages.service.ts`
  - [ ] `whatsapp-ai/rich-messages/rich-messages.module.ts`
- [ ] Implement CRM + analytics subfolders (per worklog `whatsapp-agent-w3-crm-analytics-tests`)
- [ ] Implement tests subfolder (mirror `testing/whatsapp/` structure)
- [ ] Wire `WhatsAppModule` into `backend/app.module.ts`
- [ ] Verify: `cd backend && pnpm typecheck` passes
- [ ] Verify: `cd backend && pnpm build` succeeds

### 0.4 [P0 BLOCKER] Implement Website Chat backend module

The `backend/website-chat/` directory does not exist. The worklog claims
7 files were created but none exist on disk. If you choose Option A in
0.1 (comment out the import), skip this section for now and circle back
before production go-live.

- [ ] Create `backend/website-chat/website-chat.module.ts` (imports `AiModule` for `ConversationsService` + `MemoryService`)
- [ ] Create `backend/website-chat/website-chat.controller.ts` with 8 endpoints:
  - [ ] POST `/api/website-chat/init` (public)
  - [ ] POST `/api/website-chat/:sessionId/message` (public)
  - [ ] POST `/api/website-chat/:sessionId/message/stream` (SSE, public)
  - [ ] GET `/api/website-chat/:sessionId/history` (public)
  - [ ] POST `/api/website-chat/:sessionId/feedback` (public)
  - [ ] GET `/api/website-chat/sessions` (admin, JWT + RBAC)
  - [ ] GET `/api/website-chat/analytics` (admin)
  - [ ] GET/POST `/api/website-chat/config` (admin)
- [ ] Create `backend/website-chat/website-chat.service.ts` (creates WebSession + Conversation, delegates to `ConversationsService.sendMessage()`, implements OpenAI streaming, records analytics events, manages widget config in `TenantConfig`)
- [ ] Create DTOs:
  - [ ] `backend/website-chat/dto/init-session.dto.ts`
  - [ ] `backend/website-chat/dto/send-message.dto.ts`
  - [ ] `backend/website-chat/dto/submit-feedback.dto.ts`
  - [ ] `backend/website-chat/dto/query-sessions.dto.ts`
- [ ] Verify: `cd backend && pnpm typecheck` passes
- [ ] Verify: `cd backend && pnpm build` succeeds

### 0.5 [P0 BLOCKER] Remove plaintext K8s Secret

`deployment/kubernetes/02-voice-ai-manifests.yaml` lines 39–50 still
define a `kind: Secret` with plaintext placeholder values. The
ExternalSecret in `03-external-secrets.yaml` was added but the original
Secret was NOT removed.

- [ ] Open `deployment/kubernetes/02-voice-ai-manifests.yaml`
- [ ] Delete lines 35–51 (the entire `# Secret` section + `apiVersion: v1` + `kind: Secret` + metadata + `type: Opaque` + `stringData` block)
- [ ] Update the Deployment's `secretKeyRef` references (lines 90–97) to point at `dayjoy-secrets` (the ExternalSecret target name from `03-external-secrets.yaml`)
- [ ] Verify: `kubectl apply --dry-run=client -f deployment/kubernetes/02-voice-ai-manifests.yaml` succeeds
- [ ] Verify: `grep -n "kind: Secret" deployment/kubernetes/02-voice-ai-manifests.yaml` returns nothing
- [ ] Verify: `grep -n "your_vapi_api_key\|your_webhook_secret\|your_jwt_secret\|user:password" deployment/kubernetes/02-voice-ai-manifests.yaml` returns nothing

### 0.6 [P0 BLOCKER] Rewrite CI/CD for NestJS architecture

`.github/workflows/ci-cd.yml` runs `uv sync && uv run ruff check` against
`apps/backend` (Python/FastAPI) but the actual backend is NestJS at
`backend/`. Every CI job fails at the first step.

- [ ] Open `.github/workflows/ci-cd.yml`
- [ ] Replace the "Backend lint + format check" step:
  ```yaml
  - name: Backend lint + typecheck
    id: backend-quality
    working-directory: backend
    run: |
      pnpm install --frozen-lockfile
      pnpm lint
      pnpm typecheck
      echo "ok=true" >> $GITHUB_OUTPUT
  ```
- [ ] Remove the `Set up Python` and `Install uv` steps
- [ ] Replace the "Frontend lint + type check" step to loop over all 5 portal apps:
  ```yaml
  - name: Frontend lint + typecheck (all portals)
    id: frontend-quality
    run: |
      for app in admin-dashboard customer-portal distributor-portal employee-portal website-chat; do
        cd apps/$app
        pnpm install --frozen-lockfile
        pnpm lint
        pnpm typecheck
        cd ../..
      done
      echo "ok=true" >> $GITHUB_OUTPUT
  ```
- [ ] Replace the "Backend Tests" job to run `cd backend && pnpm test`
- [ ] Add a "Testing Workspace" job: `cd testing && pnpm test:unit && pnpm test:security && pnpm test:edge-cases && pnpm test:ai-eval`
- [ ] Update the "Build" job to build `backend/` + all 5 `apps/*`
- [ ] Update the "Push" job to push 6 images (1 backend + 5 frontends) to ECR
- [ ] Update the "Deploy" jobs to deploy 6 services to K8s
- [ ] Verify: commit a trivial change and watch CI run green on a PR

### 0.7 [P0 BLOCKER] Fix Docker Compose files

#### Root `docker-compose.yml`
- [ ] Line 23: Replace `POSTGRES_PASSWORD: dayjoy` with `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dayjoy}`
- [ ] Line 58: Replace `DATABASE_URL=postgresql://dayjoy:dayjoy@postgres:5432/dayjoy_ai` with `DATABASE_URL=postgresql://dayjoy:${POSTGRES_PASSWORD}@postgres:5432/dayjoy_ai`
- [ ] Line 81: Same replacement for voice-ai service
- [ ] Line 98: Same replacement for whatsapp-ai service
- [ ] Line 140: Replace `GF_SECURITY_ADMIN_PASSWORD=admin` with `GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}`
- [ ] Lines 89–104: Either remove the `whatsapp-ai` service (since the module is not implemented) OR comment it out with a TODO
- [ ] Add a `.env.example` reference at the top: `# Copy .env.example to .env and fill in real values before running docker compose up`

#### `deployment/docker/docker-compose.dev.yml`
- [ ] Line 24: Replace `POSTGRES_PASSWORD: dayjoy` with `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dayjoy}`
- [ ] Line 82: Replace `context: ./apps/backend` with `context: ./backend` (the actual NestJS backend)
- [ ] Line 79: Remove the comment `# ===== Backend (FastAPI) =====` and replace with `# ===== Backend (NestJS) =====`
- [ ] Line 91: Replace `DATABASE_URL=postgresql+asyncpg://dayjoy:dayjoy@postgres:5432/dayjoyai` with `DATABASE_URL=postgresql://dayjoy:${POSTGRES_PASSWORD}@postgres:5432/dayjoyai` (NestJS uses `postgresql://` not `postgresql+asyncpg://`)
- [ ] Line 93: Replace `SECRET_KEY=dev-secret-key-change-in-production-min-32-chars` with `SECRET_KEY=${SECRET_KEY:-dev-secret-key-change-in-production-min-32-chars}`
- [ ] Add a backend build section that uses the NestJS Dockerfile at `backend/Dockerfile` (create one if it doesn't exist)
- [ ] Update the backend command from `uvicorn` (implied FastAPI) to `pnpm start:dev` (NestJS)

#### `deployment/docker/docker-compose.voice-ai.yml`
- [ ] ✅ Already verified — all secrets use `${VAR}` interpolation. No changes needed.

#### `deployment/docker/docker-compose.prod.yml`
- [ ] Audit for hardcoded secrets (not yet verified by this audit)
- [ ] Replace any hardcoded credentials with `${VAR}` interpolation

### 0.8 P0 Remediation Sign-Off

- [ ] All 7 P0 items above are complete
- [ ] `cd backend && pnpm typecheck` passes with zero errors
- [ ] `cd backend && pnpm build` succeeds
- [ ] `cd backend && pnpm test:unit` passes (existing spec files)
- [ ] Seed runs successfully against a fresh test database
- [ ] `grep -rn "your_vapi_api_key\|your_jwt_secret\|user:password" deployment/` returns nothing
- [ ] `grep -rn "POSTGRES_PASSWORD: dayjoy" deployment/ docker-compose.yml` returns nothing (except in `${VAR:-default}` form)
- [ ] CI pipeline runs green on a trivial PR
- [ ] **Engineering lead sign-off:** ____________________ Date: __________

---

## Section 1: Pre-Launch Infrastructure (Must Complete Before Staging)

### 1.1 AWS Infrastructure (Terraform)

- [ ] Install Terraform >= 1.5
- [ ] Configure AWS credentials (`aws configure` or `AWS_PROFILE`)
- [ ] Review `deployment/terraform/environments/staging/main.tf`
- [ ] Review all 9 Terraform modules:
  - [ ] `modules/vpc/` — VPC, subnets (public + private), NAT gateway, IGW
  - [ ] `modules/eks/` — EKS cluster, node groups, IRSA
  - [ ] `modules/rds/` — RDS PostgreSQL 15+ with pgvector, multi-AZ, automated backups
  - [ ] `modules/elasticache/` — Redis 7 (for rate limit, JWT blocklist, session memory)
  - [ ] `modules/s3/` — S3 buckets for uploads + backups, lifecycle to Glacier
  - [ ] `modules/kms/` — KMS keys for EBS/S3/RDS encryption
  - [ ] `modules/waf/` — WAF rules (SQLi, XSS, rate limit, geo-block)
  - [ ] `modules/dns/` — Route53 hosted zone + records
- [ ] Create `terraform.tfvars` (NOT committed) with real values:
  ```
  aws_region     = "ap-south-1"
  environment    = "staging"
  domain_name    = "staging.dayjoy.ai"
  db_instance_class = "db.r6g.large"
  redis_node_type   = "cache.r6g.large"
  ```
- [ ] Run `terraform init` in `deployment/terraform/environments/staging/`
- [ ] Run `terraform plan` — review the plan
- [ ] Run `terraform apply` — provision staging infrastructure
- [ ] Verify: `kubectl get nodes` returns EKS nodes
- [ ] Verify: `aws rds describe-db-instances` shows the RDS instance
- [ ] Verify: `aws elasticache describe-cache-clusters` shows Redis
- [ ] Verify: `aws s3 ls` shows the uploads + backups buckets
- [ ] Configure Route53 DNS records:
  - [ ] `api.staging.dayjoy.ai` → ALB
  - [ ] `app.staging.dayjoy.ai` → ALB (admin dashboard)
  - [ ] `customer.staging.dayjoy.ai` → ALB
  - [ ] `distributor.staging.dayjoy.ai` → ALB
  - [ ] `employee.staging.dayjoy.ai` → ALB
  - [ ] `chat.staging.dayjoy.ai` → ALB (website chat widget)
- [ ] Configure ACM SSL certificates for all subdomains
- [ ] Configure AWS KMS keys (already provisioned by Terraform)
- [ ] Configure AWS Secrets Manager with all secrets (see Section 1.3)
- [ ] Configure WAF rules (already provisioned by Terraform — verify in AWS console)

### 1.2 API Keys & Credentials

- [ ] **Vapi** (Voice AI):
  - [ ] Create Vapi account at https://vapi.ai
  - [ ] Get API key from Vapi dashboard
  - [ ] Purchase/provision a phone number
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/voice` → `{ vapi_api_key, vapi_phone_number_id, vapi_webhook_secret }`
  - [ ] Generate webhook secret: `openssl rand -hex 32`
- [ ] **Meta WhatsApp Business API**:
  - [ ] Create Meta Business Account at https://business.facebook.com
  - [ ] Add WhatsApp Business phone number
  - [ ] Get access token + phone number ID + business account ID
  - [ ] Generate webhook verify token: `openssl rand -hex 16`
  - [ ] Generate webhook app secret: `openssl rand -hex 32`
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/whatsapp` → `{ token, phone_number_id, business_account_id, verify_token, app_secret }`
- [ ] **OpenAI**:
  - [ ] Create OpenAI account at https://platform.openai.com
  - [ ] Generate API key
  - [ ] Set up billing (usage-based)
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/ai` → `{ openai_api_key }`
- [ ] **Twilio** (if using SMS/telephony fallback):
  - [ ] Create Twilio account
  - [ ] Get Account SID + Auth Token + phone number
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/telephony` → `{ account_sid, auth_token, phone_number, webhook_secret }`
- [ ] **SMTP** (SendGrid or AWS SES):
  - [ ] Create SendGrid account (or verify SES domain)
  - [ ] Get API key (SendGrid) or SMTP credentials (SES)
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/email` → `{ api_key, from_email, from_name }`
- [ ] **Stripe / Razorpay** (if using payments):
  - [ ] Create Stripe account (or Razorpay for India)
  - [ ] Get publishable key + secret key
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/payments` → `{ publishable_key, secret_key, webhook_secret }`
- [ ] **Database**:
  - [ ] Generate strong password: `openssl rand -hex 24`
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/database` → `{ url, redis_url }`
  - [ ] Construct `DATABASE_URL=postgresql://dayjoy:${DB_PASSWORD}@<rds-endpoint>:5432/dayjoy_ai`
- [ ] **JWT**:
  - [ ] Generate JWT secret: `openssl rand -hex 32`
  - [ ] Generate session secret: `openssl rand -hex 32`
  - [ ] Store in AWS Secrets Manager: `dayjoy/staging/auth` → `{ jwt_secret, session_secret }`
- [ ] **Verify all secrets are in Secrets Manager** (NOT in `.env` files, NOT in git):
  - [ ] `aws secretsmanager list-secrets --query 'SecretList[?contains(Name, `dayjoy/staging`)]'`

### 1.3 Database Setup

- [ ] Connect to RDS PostgreSQL: `psql -h <rds-endpoint> -U dayjoy -d dayjoy_ai`
- [ ] Verify pgvector extension: `SELECT extname FROM pg_extension WHERE extname = 'vector';`
- [ ] Run all 14 migrations in order:
  ```bash
  for i in 001 002 003 004 005 006 007 008 009 010 011 012 013 014; do
    psql -h <rds-endpoint> -U dayjoy -d dayjoy_ai -f database/migrations/${i}_*.sql
  done
  ```
- [ ] Verify all tables created: `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';` (expect 70+)
- [ ] Verify all functions created: `SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;` (expect 16)
- [ ] Verify all views created: `SELECT count(*) FROM information_schema.views WHERE table_schema = 'public';` (expect 10)
- [ ] Verify all triggers created: `SELECT count(*) FROM pg_trigger WHERE tgisinternal = false;` (expect 35+)
- [ ] Run seed: `cd backend && pnpm db:seed`
- [ ] Verify seed: `psql -h <rds-endpoint> -U dayjoy -d dayjoy_ai -c "SELECT count(*) FROM tenants;"` (expect 1)
- [ ] Verify seed: `psql -h <rds-endpoint> -U dayjoy -d dayjoy_ai -c "SELECT count(*) FROM users;"` (expect 10+)
- [ ] Verify RLS policies: `SELECT * FROM pg_policy;`
- [ ] **P0 GATE:** Verify Prisma queries work (the @map fix from Section 0.2 must be done first):
  ```bash
  cd backend && npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const p = new PrismaClient();
    p.tenant.findFirst().then(t => { console.log('Tenant:', t); process.exit(0); });
  "
  ```
  If this fails with "column does not exist", return to Section 0.2.

### 1.4 Redis Setup

- [ ] Connect to ElastiCache Redis: `redis-cli -h <redis-endpoint> -p 6379`
- [ ] Verify: `PING` returns `PONG`
- [ ] Configure Redis as session store, rate limiter, JWT blocklist
- [ ] Verify the `REDIS_URL` env var points at the ElastiCache endpoint

---

## Section 2: Backend Deployment

### 2.1 Build & Deploy Backend

- [ ] Ensure all P0 blockers from Section 0 are resolved
- [ ] Set environment variables (from AWS Secrets Manager via ExternalSecret):
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=3000`
  - [ ] `APP_URL=https://api.staging.dayjoy.ai`
  - [ ] `DATABASE_URL` (from Secrets Manager)
  - [ ] `REDIS_URL` (from Secrets Manager)
  - [ ] `JWT_SECRET` (from Secrets Manager, min 32 chars)
  - [ ] `SESSION_SECRET` (from Secrets Manager, min 32 chars)
  - [ ] `OPENAI_API_KEY` (from Secrets Manager)
  - [ ] `OPENAI_MODEL=gpt-4-turbo-preview`
  - [ ] `VAPI_API_KEY` (from Secrets Manager)
  - [ ] `VAPI_WEBHOOK_SECRET` (from Secrets Manager)
  - [ ] `VAPI_PHONE_NUMBER_ID` (from Secrets Manager)
  - [ ] `WHATSAPP_ACCESS_TOKEN` (from Secrets Manager — if WhatsApp module implemented)
  - [ ] `WHATSAPP_PHONE_NUMBER_ID` (from Secrets Manager)
  - [ ] `WHATSAPP_VERIFY_TOKEN` (from Secrets Manager)
  - [ ] `META_APP_SECRET` (from Secrets Manager)
  - [ ] `CORS_ORIGIN=https://app.staging.dayjoy.ai,https://customer.staging.dayjoy.ai,https://distributor.staging.dayjoy.ai,https://employee.staging.dayjoy.ai`
- [ ] Build: `cd backend && pnpm build`
- [ ] Verify build output: `ls dist/backend/main.js`
- [ ] Build Docker image: `docker build -f deployment/docker/backend.Dockerfile -t dayjoyai/backend:staging ./backend`
- [ ] Push to ECR: `docker push <ecr-registry>/dayjoyai/backend:staging`
- [ ] Deploy to K8s: `kubectl apply -f deployment/kubernetes/01-base-manifests.yaml -f deployment/kubernetes/02-voice-ai-manifests.yaml -f deployment/kubernetes/03-external-secrets.yaml`
- [ ] Wait for rollout: `kubectl rollout status deployment/backend -n dayjoy`
- [ ] Verify pods running: `kubectl get pods -n dayjoy`

### 2.2 Verify Backend Health

- [ ] Health check: `curl https://api.staging.dayjoy.ai/health` returns 200
- [ ] Readiness check: `curl https://api.staging.dayjoy.ai/health/ready` returns 200
- [ ] Liveness check: `curl https://api.staging.dayjoy.ai/health/live` returns 200
- [ ] Metrics: `curl https://api.staging.dayjoy.ai/metrics` returns Prometheus format
- [ ] Swagger UI: `https://api.staging.dayjoy.ai/docs` loads
- [ ] Database connection: health check shows `database: up`
- [ ] Redis connection: health check shows `redis: up`

### 2.3 Verify Backend Functionality

- [ ] Register a test user: `curl -X POST https://api.staging.dayjoy.ai/api/auth/register -d '{...}'`
- [ ] Login: `curl -X POST https://api.staging.dayjoy.ai/api/auth/login -d '{...}'`
- [ ] Get profile: `curl -H "Authorization: Bearer <token>" https://api.staging.dayjoy.ai/api/users/me`
- [ ] List products: `curl -H "Authorization: Bearer <token>" https://api.staging.dayjoy.ai/api/products`
- [ ] Create order: `curl -X POST -H "Authorization: Bearer <token>" https://api.staging.dayjoy.ai/api/orders -d '{...}'`
- [ ] **P0 GATE:** If any of the above fail with "column does not exist", return to Section 0.2 (Prisma @map fix).

---

## Section 3: Frontend Deployment

### 3.1 Build & Deploy Admin Dashboard

- [ ] Set env vars: `NEXT_PUBLIC_API_URL=https://api.staging.dayjoy.ai`
- [ ] Build: `cd apps/admin-dashboard && pnpm build`
- [ ] Build Docker image: `docker build -f deployment/docker/frontend.Dockerfile -t dayjoyai/admin-dashboard:staging ./apps/admin-dashboard`
- [ ] Push to ECR
- [ ] Deploy to K8s
- [ ] Verify: `https://app.staging.dayjoy.ai` loads
- [ ] Verify login works (admin user)
- [ ] Verify dashboard renders with real data

### 3.2 Build & Deploy Customer Portal

- [ ] Set env vars: `NEXT_PUBLIC_API_URL=https://api.staging.dayjoy.ai`
- [ ] Build: `cd apps/customer-portal && pnpm build`
- [ ] Build Docker image
- [ ] Push to ECR
- [ ] Deploy to K8s
- [ ] Verify: `https://customer.staging.dayjoy.ai` loads
- [ ] Verify login works (customer user)
- [ ] Verify product browsing, cart, checkout

### 3.3 Build & Deploy Distributor Portal

- [ ] Set env vars: `NEXT_PUBLIC_API_URL=https://api.staging.dayjoy.ai`
- [ ] Build: `cd apps/distributor-portal && pnpm build`
- [ ] Build Docker image
- [ ] Push to ECR
- [ ] Deploy to K8s
- [ ] Verify: `https://distributor.staging.dayjoy.ai` loads
- [ ] Verify login works (distributor user)
- [ ] Verify downline tree, commissions, sales analytics

### 3.4 Build & Deploy Employee Portal

- [ ] Set env vars: `NEXT_PUBLIC_API_URL=https://api.staging.dayjoy.ai`
- [ ] Build: `cd apps/employee-portal && pnpm build`
- [ ] Build Docker image
- [ ] Push to ECR
- [ ] Deploy to K8s
- [ ] Verify: `https://employee.staging.dayjoy.ai` loads
- [ ] Verify login works (employee user)
- [ ] Verify tasks, CRM, tickets, attendance

### 3.5 Build & Deploy Website Chat Widget

- [ ] **P0 GATE:** The website-chat widget is currently a bare skeleton (no chat UI, no API routes, no admin pages). Either:
  - [ ] Implement the missing widget features (per worklog `website-agent-c2-backend-admin` spec), OR
  - [ ] Skip website chat for staging and document as "not deployed"
- [ ] Set env vars: `NEXT_PUBLIC_API_URL=https://api.staging.dayjoy.ai`
- [ ] Build: `cd apps/website-chat && pnpm build`
- [ ] Build Docker image
- [ ] Push to ECR
- [ ] Deploy to K8s
- [ ] Verify: `https://chat.staging.dayjoy.ai` loads
- [ ] Verify chat widget initializes
- [ ] Verify messages send/receive
- [ ] Verify streaming (SSE) works
- [ ] Verify admin panel loads

---

## Section 4: AI Channels Configuration

### 4.1 RAG Knowledge Base Ingestion

- [ ] Verify `packages/knowledge-base/` contains source documents (PDF, DOCX, MD, TXT, CSV, HTML)
- [ ] Run bulk ingestion: `npx tsx rag/ingestion/ingest-bulk.ts --source packages/knowledge-base/`
- [ ] Verify ingestion completed without errors
- [ ] Verify chunks created: `SELECT count(*) FROM rag_chunks;` (expect 1000+)
- [ ] Verify embeddings created: `SELECT count(*) FROM rag_embeddings;` (should match chunks)
- [ ] Test RAG query:
  ```bash
  curl -X POST https://api.staging.dayjoy.ai/api/knowledge/query \
    -H "Authorization: Bearer <token>" \
    -d '{"query": "What is the return policy?"}'
  ```
- [ ] Verify response includes citations
- [ ] Verify response latency < 5 seconds
- [ ] Run RAG evaluation: `cd testing && pnpm test:ai-eval` (requires test DB)

### 4.2 Vapi Voice AI Configuration

- [ ] Import Vapi assistant config from `vapi/config/`:
  - [ ] Upload assistant config to Vapi dashboard, OR
  - [ ] Use Vapi API: `curl -X POST https://api.vapi.ai/assistant -H "Authorization: Bearer ${VAPI_API_KEY}" -d @vapi/config/assistant-config.json`
- [ ] Configure Vapi webhook URL:
  - [ ] In Vapi dashboard, set Server URL to `https://api.staging.dayjoy.ai/api/voice/webhook`
  - [ ] Set webhook secret to match `VAPI_WEBHOOK_SECRET` env var
- [ ] Verify Vapi webhook signature verification:
  ```bash
  # Send a test webhook with invalid signature → should return 401
  curl -X POST https://api.staging.dayjoy.ai/api/voice/webhook \
    -H "x-vapi-signature: invalid" \
    -d '{"test": true}'
  # Should return 401 Unauthorized
  ```
- [ ] Test inbound voice call:
  - [ ] Call the Vapi phone number
  - [ ] Verify the assistant answers
  - [ ] Verify the conversation is logged in the database: `SELECT * FROM voice_calls ORDER BY started_at DESC LIMIT 1;`
- [ ] Test outbound voice call:
  ```bash
  curl -X POST https://api.staging.dayjoy.ai/api/voice/calls \
    -H "Authorization: Bearer <token>" \
    -d '{"phoneNumber": "+91XXXXXXXXXX", "assistantId": "<vapi-assistant-id>"}'
  ```
- [ ] Verify tool calls work (e.g., "Search for product X" triggers `search_products` tool)

### 4.3 WhatsApp AI Configuration (ONLY if WhatsApp module is implemented)

- [ ] **P0 GATE:** The WhatsApp AI module is NOT implemented in the current repo. Either:
  - [ ] Complete Section 0.3 first, OR
  - [ ] Skip WhatsApp for staging and document as "not deployed"
- [ ] Configure Meta WhatsApp webhook URL in Meta Business Manager:
  - [ ] Webhook URL: `https://api.staging.dayjoy.ai/api/whatsapp/webhook`
  - [ ] Verify token: matches `WHATSAPP_VERIFY_TOKEN` env var
  - [ ] Subscribe to: `messages`, `message_status`, `message_errors`
- [ ] Verify Meta webhook subscription:
  ```bash
  # Meta sends a GET with hub.verify_token + hub.challenge
  curl "https://api.staging.dayjoy.ai/api/whatsapp/webhook?hub.verify_token=<token>&hub.challenge=test&hub.mode=subscribe"
  # Should return "test" (the challenge)
  ```
- [ ] Verify HMAC signature verification:
  ```bash
  # Send a POST with invalid X-Hub-Signature-256 → should return 401
  curl -X POST https://api.staging.dayjoy.ai/api/whatsapp/webhook \
    -H "X-Hub-Signature-256: sha256=invalid" \
    -d '{"test": true}'
  # Should return 401 Unauthorized
  ```
- [ ] Test inbound WhatsApp message:
  - [ ] Send a WhatsApp message from a test phone to the business number
  - [ ] Verify the message is received: `SELECT * FROM whatsapp_messages WHERE direction = 'inbound' ORDER BY received_at DESC LIMIT 1;`
  - [ ] Verify AI responds: check outbound messages table
- [ ] Test rich messages (buttons, lists, media, templates)

### 4.4 Website Chat Configuration (ONLY if Website Chat backend is implemented)

- [ ] **P0 GATE:** The Website Chat backend module is NOT implemented in the current repo. Either:
  - [ ] Complete Section 0.4 first, OR
  - [ ] Skip website chat backend for staging and use the widget in "demo mode" only
- [ ] Configure widget branding via admin panel:
  - [ ] Navigate to `https://chat.staging.dayjoy.ai/admin/settings`
  - [ ] Set branding (colors, logo, position)
  - [ ] Set behavior (greeting, offline message)
  - [ ] Set AI (agent selection, model)
  - [ ] Set security (rate limits, allowed domains)
- [ ] Test chat initialization:
  ```bash
  curl -X POST https://api.staging.dayjoy.ai/api/website-chat/init \
    -d '{"visitorId": "test-visitor", "pageUrl": "https://example.com"}'
  ```
- [ ] Test message send:
  ```bash
  curl -X POST https://api.staging.dayjoy.ai/api/website-chat/<sessionId>/message \
    -d '{"content": "Hello"}'
  ```
- [ ] Test streaming (SSE):
  ```bash
  curl -N -X POST https://api.staging.dayjoy.ai/api/website-chat/<sessionId>/message/stream \
    -d '{"content": "Tell me about your products"}'
  # Should stream tokens as they arrive
  ```
- [ ] Verify CSRF protection (cross-origin requests blocked)
- [ ] Verify XSS sanitization (HTML in messages is escaped)
- [ ] Verify rate limiting (exceeding 30 messages/min returns 429)

---

## Section 5: n8n Automation Deployment

### 5.1 Deploy n8n

- [ ] Choose deployment method:
  - [ ] Docker Compose: `cd automation/n8n && docker compose up -d`, OR
  - [ ] Kubernetes: `kubectl apply -f automation/n8n/deployment/kubernetes/`
- [ ] Verify n8n is running: `curl https://n8n.staging.dayjoy.ai/healthz`
- [ ] Configure n8n admin user on first run
- [ ] Configure n8n encryption key (store in Secrets Manager)

### 5.2 Import Workflows

- [ ] Import all 45 workflows from `automation/n8n/workflows/`:
  ```bash
  for workflow in automation/n8n/workflows/**/*.json; do
    curl -X POST https://n8n.staging.dayjoy.ai/api/v1/workflows \
      -H "Authorization: Bearer <n8n-api-key>" \
      -H "Content-Type: application/json" \
      -d @$workflow
  done
  ```
- [ ] Verify all 45 workflows imported: `curl https://n8n.staging.dayjoy.ai/api/v1/workflows | jq '.data | length'` (expect 45)

### 5.3 Configure n8n Credentials

- [ ] Import credentials from `automation/n8n/shared/credentials.json`
- [ ] Configure each credential with real values:
  - [ ] Dayjoy API (JWT auth)
  - [ ] Slack (webhook URL)
  - [ ] Email/SMTP
  - [ ] Google Calendar (OAuth)
  - [ ] Twilio (if using SMS)
- [ ] Verify HMAC webhook auth secret is set (in n8n credentials, NOT env)

### 5.4 Activate Workflows

- [ ] Activate all 45 workflows (in n8n UI or via API)
- [ ] Verify workflows are active: `curl https://n8n.staging.dayjoy.ai/api/v1/workflows | jq '.data[] | select(.active == true) | .name' | wc -l` (expect 45)

### 5.5 Test Critical Workflows

- [ ] Test lead capture workflow:
  - [ ] Trigger via API: create a lead
  - [ ] Verify the workflow executes (CRM sync, notification, follow-up scheduling)
- [ ] Test order confirmation workflow:
  - [ ] Trigger via API: create an order
  - [ ] Verify email confirmation sent
  - [ ] Verify WhatsApp confirmation sent (if WhatsApp implemented)
- [ ] Test error handling:
  - [ ] Force a workflow failure (e.g., invalid credential)
  - [ ] Verify global error handler catches it
  - [ ] Verify dead-letter queue receives it
  - [ ] Verify retry strategy executes

---

## Section 6: Monitoring Setup

### 6.1 Deploy Monitoring Stack

- [ ] Deploy Prometheus: `kubectl apply -f monitoring/prometheus/` (or use existing `docker-compose.yml` monitoring services)
- [ ] Deploy Grafana: `kubectl apply -f monitoring/grafana/` (or use existing)
- [ ] Deploy Loki + Promtail: `kubectl apply -f monitoring/loki/`
- [ ] Deploy Alertmanager: `kubectl apply -f monitoring/prometheus/alertmanager.yml`
- [ ] Verify all monitoring pods running: `kubectl get pods -n monitoring`

### 6.2 Import Grafana Dashboards

- [ ] Import 5 dashboards from `monitoring/grafana/dashboards/`:
  - [ ] `api-overview.json` — backend API latency, error rate, request volume
  - [ ] `business-kpis.json` — orders, revenue, customers, distributors
  - [ ] `database.json` — connection pool, query latency, slow queries
  - [ ] `rag.json` — retrieval latency, recall, hallucination rate
  - [ ] `voice-ai.json` — call volume, duration, outcome, sentiment
- [ ] Verify each dashboard loads with real data

### 6.3 Configure Alertmanager Routing

- [ ] Configure Slack webhook URL (in Secrets Manager, not in YAML)
- [ ] Configure PagerDuty integration key (in Secrets Manager)
- [ ] Verify alert routing:
  - [ ] Critical alerts → PagerDuty
  - [ ] Warning alerts → Slack
  - [ ] Info alerts → Slack (dedicated channel)
- [ ] Test alert firing:
  - [ ] Stop the backend temporarily
  - [ ] Verify `backend_down` alert fires
  - [ ] Verify Slack/PagerDuty receives the alert
  - [ ] Restart backend
  - [ ] Verify alert resolves

### 6.4 Verify 12 Alert Rules

- [ ] `backend_down` — backend pod not ready for 1 min
- [ ] `high_error_rate` — 5xx error rate > 5% for 5 min
- [ ] `high_latency` — p95 latency > 2s for 5 min
- [ ] `database_connections_high` — DB connections > 80% of pool
- [ ] `redis_connections_high` — Redis connections > 80%
- [ ] `disk_usage_high` — disk usage > 85%
- [ ] `memory_usage_high` — memory usage > 90%
- [ ] `cpu_usage_high` — CPU usage > 80% for 10 min
- [ ] `rag_retrieval_slow` — RAG retrieval p95 > 5s
- [ ] `voice_call_failure_high` — voice call failure rate > 10%
- [ ] `whatsapp_message_failure_high` — WhatsApp failure rate > 10% (if implemented)
- [ ] `certificate_expiring` — SSL cert expiring in 14 days

---

## Section 7: Security Verification

### 7.1 Pre-Deployment Security Checks

- [ ] **Verify no plaintext secrets in any file:**
  ```bash
  grep -rn "your_vapi_api_key\|your_jwt_secret\|user:password\|dayjoy:dayjoy" \
    deployment/ docker-compose.yml .github/ \
    --exclude-dir=node_modules --exclude-dir=_reference
  # Should return nothing (except in .env.example or README documentation)
  ```
- [ ] **Verify `.gitignore` covers `.env`:**
  ```bash
  grep -E "^\.env" .gitignore
  # Should show .env, .env.local, .env.*.local, .env.production, .env.staging
  ```
- [ ] **Verify no `.env` files are committed:**
  ```bash
  git ls-files | grep -E "^\.env$|^\.env\."
  # Should return nothing
  ```
- [ ] **Verify JWT_SECRET is min 32 chars:** (check in Secrets Manager, not in code)
- [ ] **Verify DATABASE_PASSWORD is strong:** (check in Secrets Manager)
- [ ] **Verify all API keys are in Secrets Manager** (not in `.env` files committed to git)
- [ ] **Verify ExternalSecret is the source of truth** for K8s secrets (not the deleted plaintext Secret)

### 7.2 Run Security Test Suite

- [ ] Run authentication tests: `cd testing && pnpm test:security -- authentication`
- [ ] Run authorization tests: `cd testing && pnpm test:security -- authorization`
- [ ] Run RBAC tests: `cd testing && pnpm test:security -- rbac`
- [ ] Run SQL injection tests: `cd testing && pnpm test:security -- sql-injection`
- [ ] Run XSS tests: `cd testing && pnpm test:security -- xss`
- [ ] Run CSRF tests: `cd testing && pnpm test:security -- csrf`
- [ ] Run rate limiting tests: `cd testing && pnpm test:security -- rate-limiting`
- [ ] Verify all security tests pass

### 7.3 Run External Security Scans

- [ ] **OWASP ZAP** baseline scan:
  ```bash
  docker run -t owasp/zap2docker-stable zap-baseline.py -t https://api.staging.dayjoy.ai
  ```
- [ ] **Trivy** container scan:
  ```bash
  trivy image <ecr-registry>/dayjoyai/backend:staging
  ```
- [ ] **Checkov** IaC scan:
  ```bash
  checkov -d deployment/terraform/
  checkov -d deployment/kubernetes/
  ```
- [ ] **Gitleaks** secret scan:
  ```bash
  gitleaks detect --source . --report-path gitleaks-report.json
  ```
- [ ] **Semgrep** SAST scan:
  ```bash
  semgrep --config=auto backend/ rag/ vapi/
  ```
- [ ] Verify no Critical/High findings (or document accepted risks)

### 7.4 SSL/TLS Verification

- [ ] Verify SSL certificate is valid for all subdomains
- [ ] Verify TLS 1.2+ only (disable TLS 1.0/1.1)
- [ ] Verify HSTS header is set
- [ ] Verify certificate auto-renewal is configured (cert-manager)

---

## Section 8: Testing

### 8.1 Run Test Suites

- [ ] **Unit tests:** `cd backend && pnpm test` (the 24 `*.spec.ts` files)
- [ ] **Testing workspace unit:** `cd testing && pnpm test:unit`
- [ ] **Integration tests** (requires test DB):
  ```bash
  export DATABASE_URL="postgresql://dayjoy:password@localhost:5432/dayjoy_test"
  cd testing && pnpm test:integration
  ```
- [ ] **API tests:** `cd testing && pnpm test:api`
- [ ] **Database tests:** `cd testing && pnpm test:database` (requires test DB)
- [ ] **RAG tests:** `cd testing && pnpm test:rag` (requires test DB with pgvector)
- [ ] **Voice tests:** `cd testing && pnpm test:voice`
- [ ] **WhatsApp tests:** `cd testing && pnpm test:whatsapp` (⚠️ tests against mocks of non-existent service — verify after WhatsApp module is implemented)
- [ ] **Website tests:** `cd testing && pnpm test:website` (⚠️ tests against mocks of non-existent service — verify after Website Chat backend is implemented)
- [ ] **Security tests:** `cd testing && pnpm test:security`
- [ ] **Edge case tests:** `cd testing && pnpm test:edge-cases`
- [ ] **AI evaluation tests:** `cd testing && pnpm test:ai-eval`
- [ ] **Performance tests:** `cd testing && pnpm test:performance` (against staging)
- [ ] **Portal E2E tests:** `cd testing && npx playwright test` (requires running portal dev servers)

### 8.2 Verify Coverage

- [ ] Generate coverage report: `cd backend && pnpm test:coverage`
- [ ] Verify coverage thresholds met:
  - [ ] Statements ≥ 80%
  - [ ] Branches ≥ 75%
  - [ ] Functions ≥ 80%
  - [ ] Lines ≥ 80%
- [ ] Review uncovered files — ensure no critical paths are untested

### 8.3 Verify Test Integrity

- [ ] Confirm tests have real assertions (not pseudo-tests):
  ```bash
  grep -rL "expect(" testing/**/*.test.ts
  # Should return nothing (every test file has at least one expect)
  ```
- [ ] Confirm WhatsApp tests are NOT giving false confidence:
  - [ ] If WhatsApp module is implemented (Section 0.3), run tests against real service
  - [ ] If WhatsApp module is NOT implemented, mark tests as `describe.skip` and document why
- [ ] Same for Website Chat tests

---

## Section 9: CI/CD Pipeline Verification

- [ ] **P0 GATE:** Section 0.6 (CI/CD rewrite) must be complete
- [ ] Configure GitHub Actions secrets:
  - [ ] `AWS_ACCESS_KEY_ID` (deployer IAM user)
  - [ ] `AWS_SECRET_ACCESS_KEY`
  - [ ] `AWS_REGION` (as a variable, not secret)
  - [ ] `ECR_REGISTRY` (as a variable)
  - [ ] `KUBE_CONFIG_DATA` (base64-encoded kubeconfig)
  - [ ] `SLACK_WEBHOOK` (for CI notifications)
- [ ] Verify ECR repositories exist:
  - [ ] `dayjoyai/backend`
  - [ ] `dayjoyai/admin-dashboard`
  - [ ] `dayjoyai/customer-portal`
  - [ ] `dayjoyai/distributor-portal`
  - [ ] `dayjoyai/employee-portal`
  - [ ] `dayjoyai/website-chat`
- [ ] Test staging deployment:
  - [ ] Open a PR
  - [ ] Verify CI runs all stages: quality → test → security → build → push → deploy-staging
  - [ ] Verify deployment succeeds
  - [ ] Verify staging is healthy after deployment
- [ ] Test rollback:
  - [ ] Deploy a known-bad version
  - [ ] Verify rollback to previous version works
  - [ ] Verify staging is healthy after rollback
- [ ] Verify production deployment requires manual approval (environment protection rule)

---

## Section 10: Backup & Disaster Recovery

### 10.1 Configure Backups

- [ ] Verify RDS automated backups enabled (7-30 day retention)
- [ ] Verify RDS point-in-time recovery enabled
- [ ] Configure backup script cron job:
  ```bash
  # Add to crontab on a backup runner EC2 instance:
  0 2 * * * /opt/dayjoy/deployment/scripts/backup-postgres.sh dayjoyai-backups-staging
  ```
- [ ] Verify S3 bucket has lifecycle policy (Glacier transition after 30 days, deletion after 365 days)
- [ ] Configure Redis persistence (AOF + RDB snapshots)

### 10.2 Test Backup & Restore

- [ ] **Run a manual backup:**
  ```bash
  DB_PASSWORD=<password> bash deployment/scripts/backup-postgres.sh dayjoyai-backups-staging
  ```
- [ ] Verify backup file created in S3: `aws s3 ls s3://dayjoyai-backups-staging/postgres/`
- [ ] **Test restore (in an isolated DB):**
  ```bash
  # Provision a throwaway RDS instance
  # Run restore:
  DB_PASSWORD=<password> DB_HOST=<throwaway-endpoint> \
    bash deployment/scripts/restore-postgres.sh <backup-file>
  ```
- [ ] Verify restored data:
  ```bash
  psql -h <throwaway-endpoint> -U dayjoy -d dayjoyai -c "SELECT count(*) FROM tenants;"
  # Should match production count
  ```
- [ ] Document restore procedure in `docs/operations/restore-procedure.md`
- [ ] Schedule quarterly restore drills

### 10.3 Disaster Recovery Plan

- [ ] Document RPO (Recovery Point Objective): 24 hours (daily backup)
- [ ] Document RTO (Recovery Time Objective): 4 hours
- [ ] Document DR procedure:
  - [ ] Provision new infrastructure via Terraform
  - [ ] Restore database from latest backup
  - [ ] Deploy application images
  - [ ] Switch DNS to new infrastructure
- [ ] Test DR procedure annually

---

## Section 11: Launch Day

### 11.1 Final Verification (T-2 hours)

- [ ] All health checks green:
  - [ ] `curl https://api.staging.dayjoy.ai/health/ready` returns 200
  - [ ] All K8s pods Running
  - [ ] No recent restarts
- [ ] All monitoring dashboards showing data:
  - [ ] Grafana API overview dashboard shows traffic
  - [ ] Grafana business KPIs dashboard shows orders/revenue
  - [ ] Grafana RAG dashboard shows retrieval metrics
  - [ ] Grafana voice-ai dashboard shows calls
  - [ ] Grafana database dashboard shows healthy connections
- [ ] All alerts in OK state (no firing alerts)
- [ ] Recent backups completed successfully

### 11.2 Smoke Tests (T-1 hour)

- [ ] **Admin login:** `https://app.staging.dayjoy.ai` → login as admin → dashboard loads
- [ ] **Customer login:** `https://customer.staging.dayjoy.ai` → login as customer → products load
- [ ] **Distributor login:** `https://distributor.staging.dayjoy.ai` → login as distributor → downline loads
- [ ] **Employee login:** `https://employee.staging.dayjoy.ai` → login as employee → tasks load
- [ ] **Voice call (inbound):** Call the Vapi number → assistant answers → conversation logged
- [ ] **Voice call (outbound):** Trigger outbound call → call connects → conversation logged
- [ ] **WhatsApp message (inbound):** Send a message to the business number → AI responds → message logged (ONLY if WhatsApp implemented)
- [ ] **WhatsApp message (outbound):** Send a template message → message delivered (ONLY if WhatsApp implemented)
- [ ] **Website chat:** Open the widget → send a message → AI responds → streaming works (ONLY if Website Chat backend implemented)
- [ ] **Order creation:** Place an order via customer portal → order appears in admin → inventory updated → confirmation email sent
- [ ] **AI conversation:** Have a multi-turn conversation with the AI → verify memory persists → verify tool calls work
- [ ] **RAG query:** Ask a knowledge-base question → verify citations in response
- [ ] **n8n workflows:** Verify at least 3 critical workflows have executed successfully in the last hour

### 11.3 Go-Live (T-0)

- [ ] **Switch DNS to production:**
  - [ ] Update Route53 records: `api.dayjoy.ai` → production ALB
  - [ ] Update Route53 records: `app.dayjoy.ai` → production ALB
  - [ ] Update Route53 records: `customer.dayjoy.ai` → production ALB
  - [ ] Update Route53 records: `distributor.dayjoy.ai` → production ALB
  - [ ] Update Route53 records: `employee.dayjoy.ai` → production ALB
  - [ ] Update Route53 records: `chat.dayjoy.ai` → production ALB
- [ ] **Wait for DNS propagation** (5-30 min)
- [ ] **Verify production URLs:**
  - [ ] `https://api.dayjoy.ai/health/ready` returns 200
  - [ ] `https://app.dayjoy.ai` loads
  - [ ] `https://customer.dayjoy.ai` loads
  - [ ] `https://distributor.dayjoy.ai` loads
  - [ ] `https://employee.dayjoy.ai` loads
  - [ ] `https://chat.dayjoy.ai` loads
- [ ] **Notify team:**
  - [ ] Post in Slack `#dayjoy-launch`: "Production go-live complete at <time>"
  - [ ] Email stakeholders
  - [ ] Update status page (if applicable)

### 11.4 Post-Launch Monitoring (T+1 hour)

- [ ] Monitor error rates every 5 minutes (should be < 1%)
- [ ] Monitor latency (p95 should be < 1s)
- [ ] Monitor AI accuracy (no hallucinations reported)
- [ ] Monitor response times (AI responses < 5s)
- [ ] Check for failed n8n workflows
- [ ] Verify daily backup scheduled
- [ ] Review audit logs for suspicious activity

---

## Section 12: Post-Launch (First 24 Hours)

### 12.1 Continuous Monitoring

- [ ] **Every 2 hours:**
  - [ ] Check Grafana API overview dashboard — error rate, latency, traffic
  - [ ] Check Grafana business KPIs — orders, revenue
  - [ ] Check for any firing alerts
  - [ ] Check K8s pod restarts (should be 0)
  - [ ] Check n8n failed workflows
- [ ] **At T+4 hours:**
  - [ ] Review AI conversation logs for quality issues
  - [ ] Review voice call transcripts for accuracy
  - [ ] Review WhatsApp message logs (if implemented)
  - [ ] Review website chat transcripts (if implemented)
- [ ] **At T+8 hours:**
  - [ ] Check database performance (slow queries, connection pool usage)
  - [ ] Check Redis memory usage
  - [ ] Check disk usage on all servers
- [ ] **At T+24 hours:**
  - [ ] Verify daily backup completed: `aws s3 ls s3://dayjoyai-backups-production/postgres/ | tail -5`
  - [ ] Review 24-hour metrics: total users, orders, AI conversations, voice calls, WhatsApp messages
  - [ ] Document any incidents in `docs/incidents/`

### 12.2 First Week

- [ ] Daily standup review of monitoring dashboards
- [ ] Triage any P1/P2 issues discovered during launch
- [ ] Schedule the first restore drill (within 7 days)
- [ ] Schedule the first security scan review (within 7 days)
- [ ] Collect user feedback via support tickets and AI conversations
- [ ] Review AI accuracy metrics and tune prompts if needed

---

## Section 13: Rollback Plan

### 13.1 Document Rollback Procedure

- [ ] **Application rollback** (revert to previous Docker image):
  ```bash
  kubectl set image deployment/backend backend=<ecr-registry>/dayjoyai/backend:<previous-tag> -n dayjoy
  kubectl rollout status deployment/backend -n dayjoy
  ```
- [ ] **Database rollback** (restore from backup):
  ```bash
  # WARNING: This will lose all data since the backup was taken
  DB_PASSWORD=<password> DB_HOST=<rds-endpoint> \
    bash deployment/scripts/restore-postgres.sh <backup-file>
  ```
- [ ] **DNS rollback** (revert Route53 records):
  ```bash
  aws route53 change-resource-record-sets --hosted-zone-id <zone-id> \
    --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{...}}]}'
  ```
- [ ] **n8n workflow rollback** (deactivate new workflows, activate previous versions)

### 13.2 Rollback Triggers

Rollback immediately if any of the following occur within the first hour of go-live:
- [ ] Error rate > 10% for 5 consecutive minutes
- [ ] p95 latency > 5s for 5 consecutive minutes
- [ ] Any data corruption detected
- [ ] Security incident detected
- [ ] Customer-reported critical issue (e.g., cannot place orders)

### 13.3 Rollback Drill

- [ ] Schedule a rollback drill within 30 days of go-live
- [ ] Practice the rollback procedure in staging
- [ ] Measure rollback time (target: < 30 minutes)
- [ ] Document lessons learned

---

## Section 14: Sign-Off

### 14.1 Required Sign-Offs (5 roles)

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Engineering Lead | | | |
| DevOps / SRE Lead | | | |
| Security Lead | | | |
| QA Lead | | | |
| Product Lead | | | |

### 14.2 GO / NO-GO / HOLD Decision

- [ ] **GO** — All Section 0 P0 blockers resolved, all pre-launch sections complete, all sign-offs obtained. Proceed to launch.
- [ ] **NO-GO** — One or more P0 blockers unresolved, or critical sign-off missing. Do not launch.
- [ ] **HOLD** — P0 blockers resolved but waiting on external dependency (e.g., API key provisioning, DNS propagation). Resume when dependency resolves.

**Final Decision:** ____________________ **Date:** __________

**Decision Maker:** ____________________ (VP Engineering or CTO)

---

## Appendix A: Quick-Reference Commands

### Build
```bash
cd backend && pnpm build                    # Build backend
cd apps/admin-dashboard && pnpm build       # Build admin dashboard
cd apps/customer-portal && pnpm build       # Build customer portal
cd apps/distributor-portal && pnpm build    # Build distributor portal
cd apps/employee-portal && pnpm build       # Build employee portal
cd apps/website-chat && pnpm build          # Build website chat widget
```

### Test
```bash
cd backend && pnpm test                     # Backend unit tests
cd testing && pnpm test:unit                # System-wide unit tests
cd testing && pnpm test:integration         # Integration tests (needs test DB)
cd testing && pnpm test:api                 # API tests
cd testing && pnpm test:security            # Security tests
cd testing && pnpm test:edge-cases          # Edge case tests
cd testing && pnpm test:ai-eval             # AI evaluation tests
cd testing && pnpm test:performance         # Performance tests
cd testing && npx playwright test           # Portal E2E tests
```

### Database
```bash
cd backend && pnpm db:generate              # Generate Prisma Client
cd backend && pnpm db:migrate:deploy        # Apply migrations
cd backend && pnpm db:seed                  # Run seed
psql -h <host> -U dayjoy -d dayjoy_ai -c "SELECT count(*) FROM tenants;"  # Verify
```

### Deploy
```bash
docker build -f deployment/docker/backend.Dockerfile -t dayjoyai/backend:prod ./backend
docker push <ecr-registry>/dayjoyai/backend:prod
kubectl set image deployment/backend backend=<ecr-registry>/dayjoyai/backend:prod -n dayjoy
kubectl rollout status deployment/backend -n dayjoy
```

### Monitor
```bash
kubectl get pods -n dayjoy                  # Check pod status
kubectl logs -f deployment/backend -n dayjoy  # Tail backend logs
curl https://api.dayjoy.ai/health           # Health check
curl https://api.dayjoy.ai/metrics          # Prometheus metrics
```

### Backup & Restore
```bash
DB_PASSWORD=<password> bash deployment/scripts/backup-postgres.sh dayjoyai-backups-production
DB_PASSWORD=<password> DB_HOST=<host> bash deployment/scripts/restore-postgres.sh <backup-file>
```

### Rollback
```bash
kubectl rollout undo deployment/backend -n dayjoy    # Roll back to previous deployment
kubectl set image deployment/backend backend=<ecr-registry>/dayjoyai/backend:<previous-tag> -n dayjoy
```

---

## Appendix B: Critical Path Summary

The critical path to production go-live is:

1. **Section 0** (P0 Blocker Remediation) — 3–5 engineer-days (mechanical fixes) + 2–3 engineer-weeks (missing module implementations)
2. **Section 1** (Infrastructure) — 2–3 days (Terraform apply + DNS + Secrets Manager)
3. **Section 2** (Backend Deploy) — 1 day (build + deploy + verify)
4. **Section 3** (Frontend Deploy) — 1 day (build + deploy all 5 portals)
5. **Section 4** (AI Channels) — 2–3 days (RAG ingestion + Vapi config + WhatsApp config + Website chat config)
6. **Section 5** (n8n) — 1 day (deploy + import 45 workflows + test)
7. **Section 6** (Monitoring) — 1 day (deploy stack + import dashboards + configure alerts)
8. **Section 7** (Security) — 1 day (scans + verification)
9. **Section 8** (Testing) — 1 day (run all suites + verify coverage)
10. **Section 9** (CI/CD) — 1 day (configure secrets + test staging deploy + test rollback)
11. **Section 10** (Backups) — 0.5 day (configure + test restore)
12. **Section 11** (Launch Day) — 1 day (final verification + smoke tests + go-live + monitor)
13. **Section 12** (Post-Launch) — 1 day (24-hour monitoring)
14. **Section 13** (Rollback Plan) — 0.5 day (document + schedule drill)
15. **Section 14** (Sign-Off) — 0.5 day (5 role sign-offs + GO/NO-GO decision)

**Total estimated time (after P0 remediation):** 2–3 weeks
**Total estimated time (including P0 remediation):** 5–7 weeks

---

**End of Production Launch Checklist.**

For questions or clarifications, contact the Engineering Lead. For audit
findings, see `PRODUCTION_READINESS_AUDIT.md`. For executive summary, see
`PRODUCTION_READINESS_REPORT.md`.
