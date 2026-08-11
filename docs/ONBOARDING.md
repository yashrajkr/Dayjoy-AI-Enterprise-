# Engineer Onboarding

Welcome to the Dayjoy AI Enterprise team! This guide gets you productive in < 1 day.

## Day 1: Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker Desktop
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)
- AWS CLI configured (for staging access)

### Setup Steps

```bash
# 1. Clone
git clone <repo-url>
cd dayjoy-ai-enterprise

# 2. Install deps
pnpm install

# 3. Set up env
cp .env.example .env
# Fill in: DATABASE_URL, REDIS_URL, JWT_SECRET, OPENAI_API_KEY

# 4. Start infra
docker compose up -d postgres redis

# 5. Run migrations
cd database
psql -d dayjoy_ai -f migrations/001_initial_schema.sql
psql -d dayjoy_ai -f migrations/002_business_tables.sql
psql -d dayjoy_ai -f migrations/003_ai_tables.sql
psql -d dayjoy_ai -f migrations/004_rag_chunks_pgvector.sql
npx prisma generate --schema prisma/schema.prisma
npx tsx seed/seed.ts
cd ..

# 6. Start backend
cd backend && pnpm start:dev
# → http://localhost:3000

# 7. Start frontend (new terminal)
cd apps/admin-dashboard && pnpm dev
# → http://localhost:3003

# 8. Verify
curl http://localhost:3000/health
# → {"status":"ok","info":{"database":{"status":"up"},...}}
```

## Repository Tour

Read these in order:
1. `README.md` — project overview, structure, quick start
2. `PRODUCTION_READINESS_ROADMAP.md` — what's done, what's pending
3. `docs/architecture/` — system design (17 docs)
4. `docs/architecture/adr/` — architectural decisions (4 ADRs)
5. `database/prisma/schema.prisma` — data model (63 models)
6. `backend/app.module.ts` — module wiring
7. `backend/auth/` — authentication patterns
8. `vapi/docs/vapi-api-documentation.md` — Voice AI API

## Key Concepts

### Multi-tenancy
Every DB table has `tenantId`. RLS policies filter by `current_setting('app.current_tenant')`.
Set this on every DB connection.

### RBAC
- `User.role` — denormalized for fast checks (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, `VIEWER`)
- `UserRole` join — fine-grained role assignment
- `RolePermission` join — permission matrix
- `PermissionsGuard` checks `resource:action` permissions

### RAG Pipeline
1. Document → `rag_sources` → `rag_documents` → `rag_chunks`
2. Chunk → `embeddings` (1536-dim via OpenAI text-embedding-3-small)
3. Store in pgvector with HNSW index
4. Query → embed → vector search → top-k chunks → prompt assembly → LLM → response

### Voice AI (Vapi)
- Webhook at `POST /api/voice/webhook` receives call events
- HMAC-SHA256 signature verification (mandatory)
- 8 tools: search_knowledge, search_products, customer_lookup, distributor_lookup, lead_capture, appointment_booking, support_ticket, human_transfer
- Memory in Redis (session) + Postgres (customer profile)

## Common Tasks

### Add a new API endpoint
1. Create DTO in `backend/<module>/dto/`
2. Add method to `backend/<module>/<module>.service.ts`
3. Add route to `backend/<module>/<module>.controller.ts`
4. Add `@RequirePermissions('resource:action')` decorator
5. Write test in `backend/<module>/<module>.spec.ts`
6. Update `docs/api/03_API_CATALOG.md`

### Add a new Prisma model
1. Add model to `database/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_<model>`
3. Run `npx prisma generate`
4. Update `database/seed/seed.ts` with sample data
5. Update `docs/database/03_TABLE_CATALOG.md`

### Add a new Vapi tool
1. Create `vapi/tools/vapi-<tool-name>-tool.ts` implementing `VapiToolInterface`
2. Register in `vapi/tools/vapi-tool-interface.ts`
3. Add to assistant config in `vapi/config/vapi-assistant-config.ts`
4. Write test in `vapi/tests/`
5. Update `vapi/docs/vapi-api-documentation.md`

## Getting Help

- Slack: `#dayjoy-engineering`
- On-call: see PagerDuty schedule
- Architecture questions: read ADRs first, then ask in `#architecture`
- Production access: requires manager approval + MFA

## Next Steps

After Day 1:
- Day 2-3: Pick a "good first issue" from GitHub (label: `good-first-issue`)
- Week 2: Pair with a senior engineer on a feature
- Week 3-4: Take ownership of a small module
