# Dayjoy AI Enterprise — Backend (NestJS 10 + Prisma 6 + PostgreSQL + Redis)

> The API gateway of the Dayjoy Enterprise AI platform — multi-tenant SaaS
> covering CRM, distributor management, voice/WhatsApp/website AI agents,
> RAG knowledge base, analytics, and admin operations.

[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Folder Structure](#3-folder-structure)
4. [Setup](#4-setup)
5. [Development Workflow](#5-development-workflow)
6. [Environment Variables](#6-environment-variables)
7. [API Documentation](#7-api-documentation)
8. [Architecture](#8-architecture)
9. [Module List](#9-module-list)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Troubleshooting](#12-troubleshooting)
13. [Contributing](#13-contributing)

---

## 1. Overview

The backend is a single NestJS application exposing a versioned REST API at
`/api/*`. It is the central nervous system of the Dayjoy platform and is
responsible for:

- **Identity** — JWT auth, RBAC, refresh-token rotation, JWT revocation via
  Redis-backed blocklist.
- **CRM** — customers, distributors, products, orders, leads, appointments,
  support tickets.
- **AI** — agent definitions, conversation state, per-user memory, tool
  execution, streaming LLM responses.
- **Knowledge / RAG** — document ingestion, chunking, embeddings
  (OpenAI `text-embedding-3-small`), pgvector retrieval, re-ranking, query
  logging.
- **Analytics** — KPI roll-ups over orders, conversations, RAG queries.
- **Admin** — tenant configuration, role/permission management, audit logs.
- **Notifications** — pluggable provider (noop by default) for email/SMS/
  WhatsApp/in-app push.

The app is **multi-tenant by design**: every tenant-scoped table has a
`tenantId` column, and the global `TenantMiddleware` resolves the active
tenant from the JWT (or, for SUPER_ADMIN impersonation, from the
`X-Tenant-Id` header).

---

## 2. Tech Stack

| Layer              | Technology                                  | Notes                                                                 |
|--------------------|---------------------------------------------|-----------------------------------------------------------------------|
| Framework          | NestJS 10                                   | App Router, modular DI, interceptors/guards/filters                  |
| Language           | TypeScript 5                                | `strict: true`, `emitDecoratorMetadata`                              |
| ORM                | Prisma 6                                    | Schema at `database/prisma/schema.prisma`; client via `PrismaService` |
| Database           | PostgreSQL 15                               | `pgvector` extension for RAG embeddings                              |
| Cache / Rate limit | Redis 7                                     | `ioredis`; JWT blocklist + sliding-window rate limit + OAuth2 state  |
| Auth               | Passport-JWT, bcryptjs                      | Access + refresh tokens; JTI revocation                              |
| Validation         | class-validator + class-transformer         | Global `ValidationPipe` (whitelist, transform)                       |
| API docs           | `@nestjs/swagger`                           | Mounted at `/docs` in non-production                                 |
| Security           | helmet, compression, express-rate-limit     | CSP, HSTS, gzip, IP-based throttling                                 |
| Logging            | Winston (`AppLoggerService`)                | JSON in prod, colorised in dev; PII redaction                        |
| Metrics            | `prom-client` (`/metrics`)                  | Histograms for HTTP + RAG + voice; default Node metrics              |
| Health             | `@nestjs/terminus` (`/health/*`)            | Liveness + readiness (PostgreSQL + Redis)                            |
| Tests              | Vitest + Supertest                          | Unit (`*.spec.ts`), E2E (`test/*.e2e.spec.ts`)                       |

---

## 3. Folder Structure

```
backend/
├── main.ts                       # Bootstrap: helmet, CORS, validation, Swagger, shutdown
├── app.module.ts                 # Root module — wires 14 feature modules + globals
├── BACKEND_DESIGN.md             # Comprehensive backend design document (this folder)
├── backend-notes.md              # Phase-8 wiring notes (Employees + RAG + Vapi)
├── nest-cli.json                 # NestJS CLI config (sourceRoot = .)
├── tsconfig.json                 # TypeScript compiler config (rootDir=.., @rag + @vapi aliases)
├── tsconfig.check.json           # tsc --noEmit config (mirrors tsconfig.json)
├── vitest.config.ts              # Unit-test config (excludes e2e)
├── vitest.e2e.config.ts          # E2E test config (test/*.e2e.spec.ts)
├── package.json                  # Deps + scripts
├── .env.example                  # All env vars (validated by zod at boot)
│
├── _shared/                      # Cross-cutting infrastructure
│   ├── api/                      # ApiResponse envelope, PaginatedResponse, PaginationDto
│   │   ├── api-response.ts
│   │   ├── pagination.dto.ts
│   │   ├── api.module.ts
│   │   └── index.ts
│   ├── auth/                     # @Public, @Roles, @CurrentUser decorators + RolesGuard
│   ├── common/                   # Filters, interceptors, middleware, decorators
│   │   ├── exceptions/           # AllExceptionsFilter, PrismaExceptionFilter
│   │   ├── interceptors/         # Transform, Timeout, Logging
│   │   ├── middleware/           # RequestLogging, Security, Tenant
│   │   ├── decorators/           # Public, Roles, CurrentUser
│   │   ├── guards/               # RolesGuard
│   │   ├── constants/            # App constants
│   │   ├── common.module.ts
│   │   └── index.ts
│   ├── config/                   # ConfigModule (zod-validated env), configuration.ts
│   ├── database/                 # PrismaService + PrismaModule (@Global)
│   ├── health/                   # HealthController + HealthModule (/health/*)
│   ├── logging/                  # AppLoggerService (Winston) + RequestIdMiddleware
│   ├── metrics/                  # MetricsController (/metrics) + MetricsInterceptor
│   ├── security/                 # RedisModule, JwtBlocklist, RateLimit, PermissionsGuard
│   ├── ai/                       # SharedAiModule — OpenAI client provider
│   └── testing/                  # Mock helpers (mock-prisma, mock-redis)
│
├── auth/                         # Feature: register, login, refresh, logout, password reset
├── users/                        # Feature: user CRUD
├── employees/                    # Feature: employee-role users + role assignment
├── customers/                    # Feature: customer CRM
├── distributors/                 # Feature: distributor CRM + commissions
├── products/                     # Feature: product catalog + categories
├── orders/                       # Feature: orders + line items
├── notifications/                # Feature: notifications (5 providers: email/SMS/WhatsApp/push/in-app)
├── ai/                           # Feature: AI agents, conversations, memory, tools
├── knowledge/                    # Feature: RAG ingest + query
├── analytics/                    # Feature: KPI roll-ups
├── admin/                        # Feature: tenant config, roles, permissions, audit
├── automation/                   # Placeholder (only README.md — module not yet implemented)
│
├── _express-reference/           # Earlier Express prototype (kept for reference; not wired)
├── test/                         # E2E tests (test/*.e2e.spec.ts)
│   └── app.e2e.spec.ts           # Health, auth flow, basic CRUD smoke
└── dist/                         # Compiled output (gitignored)

# Sibling workspace packages (imported from ../rag/ and ../vapi/)
../rag/                           # RAG pipeline (Loaders, Chunking, Ingestion, Embeddings,
│                                 # VectorStore, Retrieval, ContextBuilder, PromptAssembly,
│                                 # LLMGateway, ResponseProcessing, ResponsePipeline,
│                                 # Search, ConversationMemory, Evaluation, Security)
../vapi/                          # Voice AI (Config, Assistants, Tools, Webhooks, Flows,
                                  # Memory, Analytics)
```

---

## 4. Setup

### Prerequisites

- **Node.js** ≥ 18 (tested on 20.x)
- **pnpm** ≥ 8
- **PostgreSQL** 15 with the `pgvector` extension
- **Redis** 7

### Install

From the repository root (monorepo uses pnpm workspaces):

```bash
pnpm install
```

### Configure env

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, REDIS_URL, JWT_SECRET (≥32 chars), SESSION_SECRET (≥32 chars)
```

### Database

```bash
# Generate Prisma client
pnpm --filter backend db:generate

# Apply migrations
pnpm --filter backend db:migrate:deploy

# Seed (optional — requires the seed script to be camelCase-compatible)
pnpm --filter backend db:seed
```

### Run

```bash
# Development (hot reload)
pnpm --filter backend start:dev

# Production
pnpm --filter backend build
pnpm --filter backend start:prod
```

The server listens on `http://localhost:3000` by default.

---

## 5. Development Workflow

| Command                          | Description                                           |
|----------------------------------|-------------------------------------------------------|
| `pnpm --filter backend start:dev`| Run with `nest start --watch` (hot reload)            |
| `pnpm --filter backend build`    | Compile to `dist/` via `nest build`                   |
| `pnpm --filter backend lint`     | ESLint with `--fix`                                   |
| `pnpm --filter backend format`   | Prettier write                                        |
| `pnpm --filter backend test`     | Vitest unit tests (`*.spec.ts`)                       |
| `pnpm --filter backend test:watch` | Vitest watch mode                                  |
| `pnpm --filter backend test:coverage` | Vitest with V8 coverage                          |
| `pnpm --filter backend test:e2e` | Vitest E2E (`test/*.e2e.spec.ts`) — requires DB+Redis |

### Type checking

```bash
pnpm --filter backend exec tsc --noEmit -p tsconfig.check.json
```

---

## 6. Environment Variables

All variables are validated at boot by `_shared/config/configuration.schema.ts`
(zod). The app refuses to start if any required variable is missing or
malformed.

| Name                       | Description                                          | Default                  | Required |
|----------------------------|------------------------------------------------------|--------------------------|----------|
| `NODE_ENV`                 | `development` \| `production` \| `test`              | `development`            | yes      |
| `PORT`                     | HTTP port                                            | `3000`                   | no       |
| `APP_URL`                  | Public base URL                                      | `http://localhost:3000`  | no       |
| `APP_VERSION`              | Surfaced in `/health` + Swagger                      | `1.0.0`                  | no       |
| `CORS_ORIGIN`              | Single allowed origin                                | `http://localhost:3000`  | no       |
| `CORS_ORIGINS`             | Comma-separated origins (overrides `CORS_ORIGIN`)    | —                        | no       |
| `REQUEST_TIMEOUT_MS`       | Global request timeout                               | `30000`                  | no       |
| `DATABASE_URL`             | PostgreSQL URL (`postgresql://...`)                  | —                        | yes      |
| `REDIS_URL`                | Redis URL (`redis://...`)                            | —                        | yes\*    |
| `JWT_SECRET`               | JWT signing secret (≥ 32 chars)                      | —                        | yes      |
| `JWT_EXPIRES_IN`           | Access-token TTL                                     | `1h`                     | no       |
| `JWT_REFRESH_EXPIRES_IN`   | Refresh-token TTL                                    | `7d`                     | no       |
| `SESSION_SECRET`           | Cookie session secret (≥ 32 chars)                   | —                        | yes      |
| `RATE_LIMIT_API_MAX`       | Max `/api/*` requests per 15 min per IP              | `100`                    | no       |
| `RATE_LIMIT_AUTH_MAX`      | Max `/api/auth/*` requests per 15 min per IP         | `10`                     | no       |
| `OPENAI_API_KEY`           | OpenAI API key (chat + embeddings)                   | —                        | no\*\*   |
| `OPENAI_MODEL`             | Chat completions model                               | `gpt-4o`                 | no       |
| `OPENAI_EMBEDDING_MODEL`   | Embeddings model                                     | `text-embedding-3-small` | no       |
| `VAPI_API_KEY`             | Vapi API key                                         | —                        | no       |
| `VAPI_WEBHOOK_SECRET`      | Vapi HMAC webhook secret                             | —                        | no\*\*\* |
| `WHATSAPP_TOKEN`           | WhatsApp Business access token                       | —                        | no       |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID                    | —                        | no       |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | WhatsApp webhook verify token                   | —                        | no       |
| `TWILIO_ACCOUNT_SID`       | Twilio account SID                                   | —                        | no       |
| `TWILIO_AUTH_TOKEN`        | Twilio auth token                                    | —                        | no       |
| `TWILIO_PHONE_NUMBER`      | Twilio from-phone                                    | —                        | no       |
| `SMTP_HOST`                | SMTP host                                            | —                        | no       |
| `SMTP_PORT`                | SMTP port                                            | `587`                    | no       |
| `SMTP_USER`                | SMTP username                                        | —                        | no       |
| `SMTP_PASSWORD`            | SMTP password                                        | —                        | no       |
| `SMTP_FROM`                | From address                                         | `no-reply@dayjoy.ai`     | no       |
| `LOG_LEVEL`                | Winston log level                                    | `info`                   | no       |
| `UPLOAD_MAX_SIZE`          | Max body size in bytes                               | `10485760` (10 MB)       | no       |
| `AWS_REGION`               | AWS region (External Secrets Operator)               | `ap-south-1`             | no       |
| `AWS_SECRET_MANAGER_SECRET_ID` | AWS Secrets Manager path                         | `dayjoy/prod`            | no       |

> \* `REDIS_URL` is marked optional in the zod schema so unit tests can
> monkey-patch the module. It IS required in every non-test environment —
> the SecurityModule throws at boot if it's unset.
>
> \*\* `OPENAI_API_KEY` is optional in the schema but the AI + knowledge
> feature modules will throw at first use if it's missing.
>
> \*\*\* `VAPI_WEBHOOK_SECRET` is optional in the schema but the Vapi
> webhook signature verification fails CLOSED at runtime if it's unset in
> non-test environments — do NOT deploy without it.

---

## 7. API Documentation

### Swagger UI (dev + staging only)

Mounted at **`/docs`** when `NODE_ENV !== 'production'`. Includes:

- Bearer-token auth (click **Authorize**, paste your JWT without the
  `Bearer ` prefix).
- Tags: `auth`, `users`, `customers`, `distributors`, `products`, `orders`,
  `ai`, `knowledge`, `analytics`, `admin`, `notifications`.
  (RAG endpoints — `/api/rag/**` — are registered by the sibling
  `RagModule` and tagged `rag` / `rag-evaluation`. Voice endpoints —
  `/api/voice/**` — are registered by the sibling `VapiModule` and
  tagged `voice`. Add these tag definitions to `main.ts`'s
  `DocumentBuilder` if you want them surfaced in the Swagger UI nav.)
- Per-request duration display.

### Health & metrics

| Endpoint           | Description                                          |
|--------------------|------------------------------------------------------|
| `GET /health/live` | Liveness probe (always 200 if process is up)         |
| `GET /health/ready`| Readiness probe (200 only if Postgres + Redis up)    |
| `GET /health`      | Alias for `/health/ready`                            |
| `GET /metrics`     | Prometheus exposition format                         |

### Sample endpoints

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123!","firstName":"Alice","lastName":"Smith","tenantId":"t1"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123!","tenantId":"t1"}'
# → { "success": true, "data": { "accessToken": "...", "refreshToken": "..." }, "meta": { "requestId": "...", "timestamp": "..." } }

# Authenticated call
curl http://localhost:3000/api/customers \
  -H 'Authorization: Bearer <accessToken>'
```

### Response envelope

Every successful response is wrapped by the global `TransformInterceptor`:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "uuid", "timestamp": "iso-8601" }
}
```

Every error response is wrapped by the global `AllExceptionsFilter`:

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Resource not found", "details": null },
  "meta": { "requestId": "uuid", "timestamp": "iso-8601" }
}
```

Paginated list responses additionally carry `page`, `limit`, `total`,
`totalPages` in `meta`. See `_shared/api/api-response.ts` for the full
contract.

---

## 8. Architecture

```
                       ┌────────────────────────────────────────────────┐
                       │                  Internet                      │
                       └─────────────────────┬──────────────────────────┘
                                             │
                                             ▼
                          ┌────────────────────────────────┐
                          │  Helmet / CORS / RateLimit     │
                          │  (Express middleware, main.ts) │
                          └─────────────────────┬──────────┘
                                                │
              ┌─────────────────────────────────┴─────────────────────────────────┐
              │                            NestJS pipeline                          │
              │  ┌──────────────────────────────────────────────────────────────┐ │
              │  │ Middleware:  RequestId → Security → Tenant → RequestLogging  │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              │  ┌──────────────────────────────────────────────────────────────┐ │
              │  │ Guards:     RolesGuard (APP_GUARD)                            │ │
              │  │              + per-route JwtAuthGuard / PermissionsGuard      │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              │  ┌──────────────────────────────────────────────────────────────┐ │
              │  │ Interceptors: Metrics → Logging → Timeout → Transform        │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              │  ┌──────────────────────────────────────────────────────────────┐ │
              │  │ Pipes:      ValidationPipe (whitelist + transform)           │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              │  ┌──────────────────────────────────────────────────────────────┐ │
              │  │ Controllers: auth / users / customers / distributors / ...   │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              │  ┌──────────────────────────────────────────────────────────────┐ │
              │  │ Filter:     AllExceptionsFilter → ApiResponse error envelope │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              └─────────────────────────────────┬─────────────────────────────────┘
                                                │
                       ┌────────────────────────┴────────────────────────┐
                       ▼                       ▼                       ▼
              ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
              │   PostgreSQL    │    │     Redis       │    │     OpenAI       │
              │  (Prisma 6)     │    │ (ioredis)       │    │   (chat + emb)   │
              │  + pgvector     │    │ blocklist +     │    │                  │
              │                 │    │ rate limit +    │    │                  │
              │                 │    │ OAuth2 state    │    │                  │
              └─────────────────┘    └─────────────────┘    └──────────────────┘
```

### Request lifecycle (top → bottom)

1. **Express middleware** (`main.ts`): helmet, compression, CORS,
   rate-limit, body parsers.
2. **Nest middleware** (`AppModule.configure()`): `RequestIdMiddleware` →
   `SecurityMiddleware` → `TenantMiddleware` → `RequestLoggingMiddleware`.
3. **Guards**: `RolesGuard` (global; no-op unless `@Roles()` set), plus
   per-route `JwtAuthGuard` and `PermissionsGuard`.
4. **Interceptors** (request path, top → bottom): `MetricsInterceptor` →
   `LoggingInterceptor` → `TimeoutInterceptor` → `TransformInterceptor`.
5. **Pipes**: `ValidationPipe` (whitelist + transform).
6. **Controller** handler.
7. **Interceptors** (response path, bottom → top): `TransformInterceptor`
   wraps the payload in the success envelope.
8. **Filter** (only on exception): `AllExceptionsFilter` formats the error
   into the error envelope.

---

## 9. Module List

### Shared infrastructure (`_shared/`)

| Module            | Path                       | Purpose                                                      |
|-------------------|----------------------------|--------------------------------------------------------------|
| `ConfigModule`    | `_shared/config/`          | zod-validated env vars, typed `ConfigService`                |
| `PrismaModule`    | `_shared/database/`        | Prisma 6 client with graceful shutdown hooks                 |
| `SecurityModule`  | `_shared/security/`        | Redis client, JWT blocklist, rate limit, RBAC PermissionsGuard |
| `LoggingModule`   | `_shared/logging/`         | Winston-backed `AppLoggerService` + `RequestIdMiddleware`    |
| `HealthModule`    | `_shared/health/`          | Terminus liveness + readiness probes (`/health/*`)           |
| `MetricsModule`   | `_shared/metrics/`         | Prometheus exposition (`/metrics`) + `MetricsInterceptor`    |
| `SharedAiModule`  | `_shared/ai/`              | OpenAI SDK client provider (chat + embeddings)               |
| `CommonModule`    | `_shared/common/`          | Filters, interceptors, middleware, decorators, RolesGuard    |
| `ApiModule`       | `_shared/api/`             | `ApiResponse` envelope + `PaginatedResponse` + `PaginationDto`|

### Feature modules (12 backend modules + 2 cross-cutting sibling packages)

| Module                | Path              | Purpose                                                  |
|-----------------------|-------------------|----------------------------------------------------------|
| `AuthModule`          | `auth/`           | Register, login, refresh, logout, password reset, email verify |
| `UsersModule`         | `users/`          | User CRUD                                                |
| `EmployeesModule`     | `employees/`      | Employee-role user CRUD + role assignment                |
| `CustomersModule`     | `customers/`      | Customer CRM                                             |
| `DistributorsModule`  | `distributors/`   | Distributor CRM + commission tracking                    |
| `ProductsModule`      | `products/`       | Product catalog + categories                             |
| `OrdersModule`        | `orders/`         | Orders + line items                                      |
| `NotificationsModule` | `notifications/`  | Pluggable notification provider (5 providers)            |
| `AiModule`            | `ai/`             | AI agents, conversations, memory, tool execution         |
| `KnowledgeModule`     | `knowledge/`      | RAG ingest + query                                       |
| `AnalyticsModule`     | `analytics/`      | KPI roll-ups                                             |
| `AdminModule`         | `admin/`          | Tenant config, roles, permissions, audit log             |
| `RagModule`           | `../rag/`         | RAG pipeline (Loaders, Ingestion, Embeddings, VectorStore, Retrieval, ContextBuilder, PromptAssembly, LLMGateway, ResponsePipeline, Search, ConversationMemory) |
| `EvaluationModule`    | `../rag/evaluation/` | RAG evaluation (recall, precision, hallucination, citation accuracy) |
| `RagSecurityModule`   | `../rag/security/`   | Document permissions + tenant-isolation guard + interceptor |
| `VapiModule`          | `../vapi/`        | Voice AI (Config, Assistants, Tools, Webhooks, Flows, Memory, Analytics) |
| `AutomationModule`    | `automation/`     | _Placeholder — only README.md exists; not yet imported_  |

> `RagModule` re-exports all ingestion + query + memory services so
> feature modules (AiModule's `ConversationsService`, `KnowledgeService`,
> etc.) can inject them directly. `EvaluationModule` and
> `RagSecurityModule` are NOT re-exported by `RagModule` (they're
> independently-importable sub-modules), so they are imported explicitly
> in `app.module.ts`. `VapiModule` re-exports `VapiConfigModule`,
> `VapiAssistantsModule`, and `VapiToolsModule` for downstream
> consumers.

---

## 10. Testing

### Unit tests (`*.spec.ts` next to source)

```bash
pnpm --filter backend test
pnpm --filter backend test:watch     # watch mode
pnpm --filter backend test:coverage  # V8 coverage report in coverage/
```

Mock helpers live in `_shared/testing/` (`createMockPrismaService`,
`createMockRedis`).

### E2E tests (`test/*.e2e.spec.ts`)

Boot the full `AppModule` against a real Postgres + Redis + JWT secret env.
Skipped automatically when `DATABASE_URL` / `REDIS_URL` / `JWT_SECRET` /
`SESSION_SECRET` are unset.

```bash
DATABASE_URL=postgres://... REDIS_URL=redis://... \
JWT_SECRET=$(openssl rand -hex 48) SESSION_SECRET=$(openssl rand -hex 48) \
pnpm --filter backend test:e2e
```

### Coverage targets

- `_shared/common/` (filters, interceptors, middleware): **≥ 90%**
- `_shared/security/` (JwtBlocklist, RateLimit, PermissionsGuard): **≥ 90%**
- Feature services: **≥ 80%**

---

## 11. Deployment

### Docker

The backend ships as a Docker image built from the repo-root
`Dockerfile` (multi-stage: build with Node 20, run on a slim image).
The compose stack at the repo root (`docker-compose.yml`) brings up:

- `backend` (this app, port 3000)
- `postgres` (PostgreSQL 15 + pgvector)
- `redis` (Redis 7)
- `qdrant` (optional, for vector search)

```bash
docker compose up -d
docker compose logs -f backend
```

### Kubernetes

Production manifests live in `deployment/k8s/`. Key resources:

- `Deployment` + `Service` for the backend (3 replicas, rolling update)
- `HorizontalPodAutoscaler` (CPU + memory targets)
- `PodDisruptionBudget` (min available = 2)
- `ExternalSecret` (syncs `JWT_SECRET`, `OPENAI_API_KEY`, etc. from
  AWS Secrets Manager)
- `NetworkPolicy` (allow ingress only from the nginx ingress controller
  namespace)

Health probes:

- **Liveness**: `GET /health/live` every 10s, failure threshold 3.
- **Readiness**: `GET /health/ready` every 5s, failure threshold 2.

### Graceful shutdown

`app.enableShutdownHooks()` translates SIGTERM/SIGINT into `app.close()`,
which in turn triggers `OnModuleDestroy` hooks:

- `PrismaService.$disconnect()`
- `RedisModule`'s ioredis `quit()`
- Any in-flight WebSocket connections drain

The pod's `terminationGracePeriodSeconds` is set to 30s in the K8s
manifest to give in-flight requests time to complete.

---

## 12. Troubleshooting

### `Invalid environment variables` at boot

The zod schema in `_shared/config/configuration.schema.ts` rejected one or
more env vars. The error message lists the failing paths — fix them in
`.env` and restart.

### `REDIS_URL is not set`

The SecurityModule requires Redis. Set `REDIS_URL` in your `.env`. In unit
tests, the schema marks it optional so mocks can replace it.

### `JWT_SECRET must be ≥ 32 characters`

Generate one with `openssl rand -hex 48`.

### CORS error in the browser

Add your frontend origin to `CORS_ORIGINS` (comma-separated) in `.env`.
The browser sends the `Origin` header; if it's not in the allow-list, the
backend returns a 500 with `CORS policy violation`.

### Swagger UI returns 404

`/docs` is only mounted when `NODE_ENV !== 'production'`. In production,
Swagger is intentionally disabled to avoid leaking the API surface.

### `PrismaClientKnownRequestError: P2025`

The client tried to update / delete a record that doesn't exist. The
`AllExceptionsFilter` translates this into a 404 `NOT_FOUND` envelope —
no code change needed.

### Request hangs > 30s

The global `TimeoutInterceptor` aborts handlers that exceed
`REQUEST_TIMEOUT_MS` (default 30000ms). For long-running operations
(RAG ingest, exports), use a background queue + polling endpoint instead
of a single synchronous request.

---

## 13. Contributing

See the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the contribution
guide, branching model, and pre-commit hooks. The pre-commit hook runs
ESLint + Prettier on staged files; CI runs the full unit + e2e suites.

### Adding a new feature module

1. `nest g resource <name>` (or hand-write the controller / service /
   module files).
2. Use `@Controller('api/<name>')` so the path matches the existing
   `api/` prefix convention.
3. Add the new module to `AppModule.imports[]`.
4. Return raw payloads from controllers — `TransformInterceptor` wraps
   them automatically. For paginated lists, return
   `PaginatedResponse.create(rows, page, limit, total)`.
5. Throw NestJS exceptions (`NotFoundException`, `ConflictException`,
   etc.) — `AllExceptionsFilter` formats them. Throw Prisma errors
   directly — the filter maps them to HTTP statuses.
6. Add a `*.service.spec.ts` for unit tests; add an e2e case in
   `test/app.e2e.spec.ts` for the new endpoints.

---

**Built with:** NestJS 10 · TypeScript 5 · Prisma 6 · PostgreSQL 15 ·
pgvector · Redis 7 · OpenAI · Winston · Prometheus · Vitest
