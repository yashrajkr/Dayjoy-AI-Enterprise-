# Dayjoy AI Enterprise — FastAPI Backend (Reference Implementation)

This is the **complete, working FastAPI backend** from the `DayJoy_AI_Voice_Assistant`
project. It is included as a **reference implementation** alongside the NestJS
backend in `/backend/`.

## Why Two Backends?

| | NestJS Backend (`/backend/`) | FastAPI Backend (here) |
|---|---|---|
| Language | TypeScript | Python 3.12 |
| Framework | NestJS 10 | FastAPI 0.115+ |
| ORM | Prisma 6 | SQLAlchemy 2.0 async + Alembic |
| Tests | 0 | **834 tests** ✅ |
| Migrations | schema only (broken) | **21 Alembic migrations** ✅ |
| RAG | vapor | **real pipeline** ✅ |
| Voice | scaffold | **real Vapi integration** ✅ |
| Telephony | none | **real Twilio integration** ✅ |
| WhatsApp | none | **real Meta Cloud API** ✅ |
| Multi-LLM | OpenAI env only | **OpenAI + Anthropic + Gemini + Groq** ✅ |
| Endpoints | ~50 (many broken) | **~270 across 42 routers** ✅ |
| Models | 19 | **199 SQLAlchemy models** ✅ |

## Production Strategy

The FastAPI backend is significantly more complete than the NestJS backend.
**Strongly consider standardizing on FastAPI as the canonical backend** — see
`PRODUCTION_READINESS_ROADMAP.md` at repo root.

If you must keep NestJS (e.g., team constraint), use this FastAPI code as:
- A reference for how to implement features that are stubs in NestJS
- A source of test patterns and edge cases
- A migration target — port module-by-module to NestJS

## Structure

```
apps/backend-fastapi-reference/
├── app/
│   ├── main.py                    FastAPI app, lifespan, middleware, /health
│   ├── api/v1/endpoints/          42 routers, ~270 routes
│   ├── services/                  26 services (auth, RAG, voice, marketplace, etc.)
│   ├── models/                    34 SQLAlchemy model files (199 tables)
│   ├── repositories/              10 repositories (base + 9 entities)
│   ├── schemas/                   10 Pydantic schema files
│   ├── core/                      config (625L), security, database, logging
│   ├── middleware/                rate_limit, security_headers, csrf, cache,
│   │                              circuit_breaker, metrics, request_id,
│   │                              graceful_shutdown
│   ├── ai/                        gateway, llm_gateway, rag, memory, orchestrator,
│   │                              prompt_manager, safety/guardrails,
│   │                              rag_pipeline/{pipeline, retrieval, ingestion,
│   │                              chunker, citations, confidence},
│   │                              providers/{openai, anthropic, gemini, groq},
│   │                              embeddings/{openai, bge, fake},
│   │                              vector_store/{qdrant, pgvector, memory},
│   │                              document_processors/{pdf, docx, csv, json,
│   │                              html, markdown, text, web, faq},
│   │                              tools/{rag, business, engine}
│   ├── voice/                     service 36KB, conversation, session_manager,
│   │                              providers/{vapi + 4 stubs}, streaming/ws
│   ├── telephony/                 service, call_router, providers/{twilio + 3 stubs}
│   ├── whatsapp/                  service, meta_client
│   ├── omnichannel/               omnichannel orchestration
│   ├── workflow/                  engine, rules_engine, event_bus
│   ├── analytics/                 business analytics
│   ├── notifications/             multi-channel notifications
│   ├── observability/             metrics, tracing
│   ├── utils/                     shared utilities
│   └── tests/                     29 test files, 834 tests, 15,689 LOC
├── alembic/                       21 migrations, 8,491 LOC
├── pyproject.toml                 Python 3.12, FastAPI, SQLAlchemy 2.0 async
├── Dockerfile                     production container
├── .env.example                   all env vars
├── alembic.ini                    migration config
├── uv.lock                        locked deps (uv package manager)
└── docker-init/                   Postgres init scripts
```

## Run

```bash
cd apps/backend-fastapi-reference

# Install uv (if not present)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Sync deps
uv sync

# Set up env
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, VAPI_API_KEY, etc.

# Run migrations
uv run alembic upgrade head

# Start dev server
uv run uvicorn app.main:app --reload --port 8000
```

## Run Tests

```bash
cd apps/backend-fastapi-reference
uv run pytest -v
# 834 tests across 29 files
```

## Key Endpoint Groups

| Router | Routes | Purpose |
|---|---|---|
| `/api/v1/auth` | 12 | register, login, logout, refresh, password reset, verify email |
| `/api/v1/users` | 8 | user CRUD |
| `/api/v1/organizations` | 10 | multi-tenant org management |
| `/api/v1/rbac` | 12 | roles, permissions, user-role assignment |
| `/api/v1/customers` | 10 | customer CRUD + interactions |
| `/api/v1/products` | 8 | product catalog |
| `/api/v1/voice` | 20 + WS | voice AI via Vapi |
| `/api/v1/voice/webhook` | 1 | Vapi webhook (HMAC verified) |
| `/api/v1/telephony` | 24 | Twilio telephony |
| `/api/v1/telephony/webhook` | 1 | Twilio webhook (HMAC verified) |
| `/api/v1/whatsapp` | 21 | WhatsApp Business API |
| `/api/v1/whatsapp/webhook` | 1 | Meta webhook (HMAC verified) |
| `/api/v1/knowledge` | 19 | RAG document management |
| `/api/v1/ai` | 18 | AI agent + conversation + memory |
| `/api/v1/llm` | 6 | multi-LLM gateway |
| `/api/v1/enterprise-os/*` | 62 | autonomous enterprise (digital twins, simulation, knowledge graph) |
| `/api/v1/marketplace/*` | 32 | plugin marketplace + MCP + OAuth |
| `/api/v1/workflow` | 12 | workflow automation |
| `/api/v1/analytics` | 10 | business analytics |
| `/api/v1/audit` | 6 | audit logs |
| `/api/v1/oauth` | 8 | OAuth2 server |
| `/health` | 3 | live, ready, full health check |
| `/metrics` | 1 | Prometheus metrics |

See `app/api/v1/endpoints/` for the complete list.
