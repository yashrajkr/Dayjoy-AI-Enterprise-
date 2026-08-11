# Dayjoy AI Enterprise

> Complete enterprise AI platform for Dayjoy — voice AI, WhatsApp AI, RAG knowledge
> base, multi-tenant backend, distributor portal, customer portal, and admin dashboard.

## Repository Structure

```
dayjoy-ai-enterprise/
├── apps/                       Frontend applications (Next.js)
│   ├── admin-dashboard/        Next.js 15 + React 19 admin dashboard (93 files)
│   ├── customer-portal/        (placeholder — adapt from admin-dashboard)
│   ├── distributor-portal/     (placeholder — adapt from admin-dashboard)
│   ├── employee-portal/        (placeholder — adapt from admin-dashboard)
│   ├── website-chat/           (placeholder)
│   └── voice-ai/               (placeholder)
├── _reference/                 REFERENCE ONLY — do NOT ship in production
│   ├── fastapi-backend-reference/  Complete FastAPI backend (311 files, 834 tests)
│   ├── whatsapp-python-reference/ WhatsApp integration in Python
│   └── load-test-python.py     Locust load-test script
├── backend/                    NestJS backend — CANONICAL (see ADR-0002) (12 modules + shared infra)
│   ├── auth/                   Authentication (JWT, RBAC, password reset)
│   ├── users/                  User CRUD
│   ├── customers/              Customer CRUD
│   ├── distributors/           Distributor CRUD
│   ├── products/               Product catalog
│   ├── orders/                 Order management
│   ├── ai/                     AI agents, conversations, memory, tools
│   ├── rag/                    RAG endpoints (delegates to /rag/)
│   ├── analytics/              Business + AI + RAG analytics
│   ├── notifications/          Email/SMS/WhatsApp/push notifications
│   ├── automation/             Workflow engine (placeholder)
│   ├── admin/                  Admin endpoints (users, tenants, config)
│   ├── _shared/                Cross-module infrastructure (config, db, middleware)
│   └── _express-reference/     Alternative Express impl (reference only)
├── database/                   Prisma schema + SQL migrations + seeds
│   ├── prisma/schema.prisma    UNIFIED schema — 63 models, 28 enums
│   ├── migrations/             4 SQL migrations (core, business, AI, RAG)
│   ├── seed/                   Seed data
│   └── docs/                   140+ table specification
├── rag/                        RAG pipeline (TypeScript / NestJS-style)
│   ├── ingestion/              Document chunking
│   ├── embeddings/             Embedding generation (OpenAI, BGE)
│   ├── vector-store/           pgvector / Qdrant integration
│   ├── retriever/              Vector + keyword retrieval
│   ├── prompts/                Prompt assembly
│   └── evaluation/             LLM gateway + response processing
├── vapi/                       Voice AI (Vapi) — 63 files across 10 modules
│   ├── config/                 Module 1 — Vapi client + assistant config
│   ├── assistants/             Module 2 — Prompts + knowledge + flows
│   ├── tools/                  Module 3 — 8 function-calling tools
│   ├── webhooks/               Module 4 — Webhook handlers
│   ├── flows/                  Module 5 — Conversation flow manager
│   ├── memory/                 Module 6 — Session + customer memory
│   ├── analytics/              Module 7 — Call logger + AI metrics
│   ├── tests/                  Module 8 — Test suite
│   ├── deployment/             Module 9 — Docker + K8s
│   └── docs/                   Module 10 — API docs, runbooks, troubleshooting
├── whatsapp-ai/                WhatsApp Business API integration
├── shared/                     Shared types, utils, constants
├── packages/                   Workspace packages (@dayjoy/*)
│   ├── database/               Prisma client wrapper
│   ├── shared/                 Re-exports /shared
│   ├── types/                  TypeScript types
│   ├── utils/                  Validation, formatters, errors
│   ├── config/                 Zod env schema
│   ├── sdk/                    External consumer SDK
│   ├── ui/                     React UI components (placeholder)
│   └── knowledge-base/         Source documents for RAG
├── docs/                       Architecture + research docs (189 markdown files)
│   ├── architecture/           System, AI, RAG, voice, WhatsApp architecture
│   ├── database/               DB design, data dictionary, indexing
│   ├── api/                    API standards, catalog, webhooks
│   ├── ai/                     AI agent, reasoning, memory, governance
│   ├── frontend/               UX, design system, accessibility
│   ├── infrastructure/         Cloud, network, CI/CD, observability
│   ├── operations/             Incident, change, release, compliance
│   ├── implementation/         Build plans, testing strategy, deployment checklist
│   └── research/               Business model, product, competitor analysis
├── deployment/                 Docker, Kubernetes, Terraform, scripts
├── monitoring/                 Prometheus, Grafana, Loki
├── testing/                    Unit, integration, E2E, load tests
└── .github/                    CI/CD workflows, issue templates
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL 15+ with pgvector
- Redis 7+

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd dayjoy-ai-enterprise
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Start infrastructure
docker compose -f deployment/docker/docker-compose.dev.yml up -d postgres redis

# 4. Run database migrations
cd database
psql -d dayjoy_ai -f migrations/001_initial_schema.sql
psql -d dayjoy_ai -f migrations/002_business_tables.sql
psql -d dayjoy_ai -f migrations/003_ai_tables.sql
psql -d dayjoy_ai -f migrations/004_rag_chunks_pgvector.sql
npx prisma generate --schema prisma/schema.prisma
npx tsx seed/seed.ts
cd ..

# 5. Start backend
cd backend && pnpm start:dev

# 6. Start frontend (in another terminal)
cd apps/admin-dashboard && pnpm dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Apps                          │
│  Admin │ Customer │ Distributor │ Employee │ Voice │ Chat   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                     ┌──────┴──────┐
                     │  API Gateway │  (NestJS)
                     └──────┬──────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────┴────┐       ┌──────┴──────┐     ┌──────┴──────┐
   │  Auth   │       │   Backend   │     │  Voice AI   │
   │ (JWT)   │       │  Modules    │     │  (Vapi)     │
   └────┬────┘       └──────┬──────┘     └──────┬──────┘
        │                   │                   │
        └──────────┬────────┴───────────────────┘
                   │
            ┌──────┴──────┐
            │    RAG      │  (chunking → embeddings → vector → retrieval → LLM)
            └──────┬──────┘
                   │
        ┌──────────┴──────────┐
        │   PostgreSQL 15     │  (+ pgvector)
        │   + Redis 7         │
        └─────────────────────┘
```

## Documentation

- **[Architecture](docs/architecture/)** — System, AI, RAG, voice, WhatsApp architecture
- **[Database](docs/database/)** — DB design, data dictionary, indexing strategy
- **[API](docs/api/)** — API standards, catalog, endpoint specs
- **[AI](docs/ai/)** — Agent, reasoning, memory, governance
- **[Implementation](docs/implementation/)** — Build plans, testing, deployment
- **[Operations](docs/operations/)** — Incident, change, release, compliance
- **[Research](docs/research/)** — Business model, product, competitor analysis

## Voice AI (Vapi) — 63 files across 10 modules

| Module | Folder | Files | Purpose |
|---|---|---|---|
| 1 — Foundation | `vapi/config/` | 5 | Vapi client, assistant config, NestJS module, DB schema |
| 2 — Prompts | `vapi/assistants/` | 5 | Master system prompt, knowledge, RAG, flows, escalation |
| 3 — Tools | `vapi/tools/` | 9 | Search knowledge, products, customers, distributors, leads, appointments, tickets, transfer |
| 4 — Webhooks | `vapi/webhooks/` | 6 | Controller, service, call-started/ended, transcript, function-call |
| 5 — Flows | `vapi/flows/` | 5 | Flow types, manager, customer-support, product-inquiry, business-opportunity |
| 6 — Memory | `vapi/memory/` | 4 | Memory types, service, session, customer profile |
| 7 — Analytics | `vapi/analytics/` | 5 | Analytics types, call logger, tool tracker, AI metrics, dashboard |
| 8 — Tests | `vapi/tests/` | 7 | Setup, tool tests, flow tests, memory tests, webhook tests, E2E, load |
| 9 — Deployment | `vapi/deployment/` | 4 | Production checklist, env, Docker, K8s |
| 10 — Documentation | `vapi/docs/` | 13 | Setup guides, API docs, runbooks, troubleshooting, summaries |

See `vapi/docs/vapi-all-63-files-confirmed.md` for the full file manifest.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind 4, shadcn/ui |
| Backend (NestJS — canonical) | NestJS 10, TypeScript 5, Prisma 6 |
| Backend (FastAPI — reference only) | FastAPI 0.115+, Python 3.12, SQLAlchemy 2.0 async, Alembic |
| Database | PostgreSQL 15 + pgvector |
| Cache | Redis 7 |
| ORM | Prisma 6 (NestJS) / SQLAlchemy 2.0 async (FastAPI) |
| Voice AI | Vapi SDK |
| WhatsApp | Meta Cloud API |
| Telephony | Twilio |
| RAG | OpenAI embeddings + pgvector + Qdrant |
| LLM Providers | OpenAI, Anthropic, Gemini, Groq |
| Auth | JWT + refresh tokens + RBAC |
| Observability | Prometheus + Grafana + Loki |
| CI/CD | GitHub Actions |
| Infra | Docker, Kubernetes, Terraform |

## Two Backends — Strategy (see ADR-0002)

This repo contains **two backend implementations**:

| | `/backend/` (NestJS — **canonical**) | `/_reference/fastapi-backend-reference/` (FastAPI — reference) |
|---|---|---|
| Tests | 0 | 834 |
| Migrations | unified Prisma schema | 21 Alembic migrations |
| RAG | scaffold (TS port in progress) | real pipeline |
| Voice | scaffold (Vapi TS impl in `vapi/`) | real Vapi integration |
| Telephony | none | real Twilio integration |
| WhatsApp | none | real Meta Cloud API |
| Multi-LLM | OpenAI env only | OpenAI + Anthropic + Gemini + Groq |
| Endpoints | ~50 | ~270 across 42 routers |
| Models | 63 (Prisma, unified) | 199 (SQLAlchemy) |

**Decision (ADR-0002):** NestJS + TypeScript is the canonical backend.
The FastAPI code in `_reference/` is preserved as an implementation reference
for porting RAG, voice, telephony, WhatsApp, and auth flows to NestJS.

See `PRODUCTION_READINESS_ROADMAP.md` for the 8-phase plan (Phases 0, 1, 2, 5,
6, 7, 8 complete; Phases 3 and 4 pending).

## License

Proprietary. See `LICENSE` for details.

## Status

MVP / Pre-pilot. See `docs/implementation/` for the build plan and
`PRODUCTION_READINESS_ROADMAP.md` (in repo root) for the path to production.
