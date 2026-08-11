# Architecture Overview

## High-Level Architecture

The Dayjoy AI Platform follows a **layered, modular architecture** with clear separation of concerns.

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                 │
│              Admin Console + End-User Chat            │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS / REST / WebSocket
┌──────────────────────────▼──────────────────────────┐
│                API Gateway (FastAPI)                  │
│      Auth · RBAC · Rate Limit · Tenant Routing       │
└──────────────────────────┬──────────────────────────┘
                           │
   ┌───────────────────────┼───────────────────────┐
   │                       │                       │
   ▼                       ▼                       ▼
┌──────────┐        ┌──────────────┐        ┌──────────────┐
│ Services │───────►│ Repositories │───────►│  Database    │
│ (Logic)  │        │  (Data)      │        │ (PostgreSQL) │
└──────────┘        └──────────────┘        └──────────────┘
```

## Layers

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| API | `app/api/` | FastAPI routes; request validation; response serialization |
| Service | `app/services/` | Business logic; orchestrates repositories |
| Repository | `app/repositories/` | Data access; SQLAlchemy queries |
| Model | `app/models/` | SQLAlchemy ORM (DB tables) |
| Schema | `app/schemas/` | Pydantic models (request/response shapes) |
| Core | `app/core/` | Cross-cutting (config, logging, DB, security, exceptions) |
| Middleware | `app/middleware/` | Custom middleware (request ID, etc.) |

## Key Design Decisions

### 1. Layered Architecture (not Hexagonal/Clean)
We use a pragmatic 4-layer architecture (API → Service → Repository → Model) instead of strict Hexagonal. Why: simpler, fewer abstractions, faster to build. Trade-off: harder to swap the database (we accept this — PostgreSQL is a strategic choice).

### 2. Async-First
Everything is async (FastAPI + SQLAlchemy 2.0 async + asyncpg). Why: voice and chat require high concurrency; async scales better than threads. Trade-off: harder to debug (stack traces, context), some libraries lack async support.

### 3. Multi-Tenancy via Schema Isolation
Each tenant gets its own PostgreSQL schema. Why: strict data isolation, easier compliance, per-tenant backup. Trade-off: schema management complexity; we accept this.

### 4. Pydantic v2 for Validation
All request/response models use Pydantic v2. Why: fast, type-safe, auto-generates OpenAPI. Trade-off: tight coupling to Pydantic (acceptable — it's the industry standard).

### 5. Monorepo
All code in one Git repository. Why: shared types, simpler onboarding, atomic refactors. Trade-off: repo size; mitigated by path-based CI.

## Tech Stack Rationale

See [README.md](../README.md) for the full tech stack table with justifications.

## ADRs (Architecture Decision Records)

We record every significant architectural decision as an ADR in [`adr/`](adr/). Read them to understand why the codebase is structured the way it is.

- [ADR-0001: Use a monorepo](adr/0001-monorepo.md)
- [ADR-0002: Use FastAPI over Django](adr/0002-fastapi-over-django.md) (Phase 2)
- [ADR-0003: Use pgvector over a separate vector DB](adr/0003-pgvector-over-pinecone.md) (Phase 5)
