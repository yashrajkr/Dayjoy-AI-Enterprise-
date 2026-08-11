# Dayjoy AI Enterprise — Backend Design Document

> Comprehensive architectural + design reference for the Dayjoy AI
> Enterprise backend (NestJS 10 + Prisma 6 + PostgreSQL + Redis). This
> document is the canonical design reference — `README.md` is the
> developer quick-start; this is the deeper "why" + "how" document.

---

## 1. Overview

The backend is a **NestJS 10 + TypeScript 5** application using
**Prisma 6 ORM** with **PostgreSQL 15 + pgvector**. It provides a
versioned REST API under `/api/*` for all platform features, JWT
authentication with role-based access control (RBAC), and integrates
with the **RAG knowledge pipeline** (`../rag/`) and **Vapi Voice AI**
subsystem (`../vapi/`).

The app is **multi-tenant by design**: every tenant-scoped table has a
`tenantId` column, the global `TenantMiddleware` resolves the active
tenant from the JWT (or, for SUPER_ADMIN impersonation, from the
`X-Tenant-Id` header), and Prisma-level query filters enforce
isolation. Row-level security (RLS) on the database backstops the
application layer.

### Responsibilities

- **Identity** — JWT auth, RBAC, refresh-token rotation, JWT revocation
  via Redis-backed blocklist, password reset, email verification.
- **CRM** — customers, distributors, products, orders, leads,
  appointments, support tickets.
- **HR** — employees (employee-role users), role assignment.
- **AI** — agent definitions, conversation state, per-user memory,
  tool execution, streaming LLM responses.
- **Knowledge / RAG** — document ingestion (PDF / DOCX / Markdown /
  CSV / HTML / Text), chunking, embeddings (OpenAI
  `text-embedding-3-small`), pgvector retrieval, re-ranking, query
  logging, evaluation, security.
- **Voice AI** — Vapi assistant management, voice-call tools (8 tools),
  webhook handling, conversation flows.
- **Analytics** — KPI roll-ups over orders, conversations, RAG queries,
  user activity, channels, AI cost.
- **Admin** — tenant configuration, role/permission management, audit
  logs, integrations.
- **Notifications** — pluggable provider (email / SMS / WhatsApp / push
  / in-app).

---

## 2. Tech Stack

| Component        | Technology                                       | Notes                                                                  |
|------------------|--------------------------------------------------|------------------------------------------------------------------------|
| Framework        | NestJS 10                                        | App Router, modular DI, interceptors / guards / filters               |
| Language         | TypeScript 5                                     | `strict: true`, `emitDecoratorMetadata`, `experimentalDecorators`     |
| ORM              | Prisma 6                                         | Schema at `database/prisma/schema.prisma`; client via `PrismaService` |
| Database         | PostgreSQL 15                                    | `pgvector` extension for RAG embeddings; RLS for tenant isolation      |
| Cache            | Redis 7 (`ioredis`)                              | JWT blocklist, sliding-window rate limit, OAuth2 state, tool cache     |
| Auth             | JWT + Passport + RBAC                            | Access + refresh tokens; JTI revocation; `passport-jwt` strategy      |
| Validation       | class-validator + class-transformer              | Global `ValidationPipe` (whitelist + transform)                       |
| Docs             | Swagger (`@nestjs/swagger`)                      | Mounted at `/docs` in non-production; OpenAPI 3 spec                   |
| Logging          | Winston                                          | JSON in prod, colourised in dev; PII redaction; `AppLoggerService`    |
| Metrics          | `prom-client`                                    | `/metrics` Prometheus exposition + `MetricsInterceptor`               |
| Health           | `@nestjs/terminus`                               | `/health/live` + `/health/ready` (PostgreSQL + Redis)                  |
| Security         | Helmet, CORS, Rate Limiting (`express-rate-limit`) | CSP, HSTS, COOP/COEP, gzip, IP-based throttling                     |
| Password hashing | `bcryptjs`                                       | 12 rounds                                                              |
| AI               | OpenAI SDK (`openai`)                            | Chat completions + embeddings; shared singleton via `OPENAI_CLIENT`   |
| Tokenisation     | `gpt-tokenizer`                                  | Token-aware chunking in the RAG ingestion pipeline                     |
| Document parsing | `pdf-parse`, `mammoth`, `cheerio`, `csv-parse`   | Loaders for the RAG ingestion pipeline                                |
| Tests            | Vitest + Supertest                               | Unit (`*.spec.ts`), E2E (`test/*.e2e.spec.ts`)                        |
| Package manager  | pnpm (monorepo)                                  | `pnpm-workspace.yaml` at repo root                                    |

---

## 3. Architecture

### Layered Architecture

```
HTTP request
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ Express middleware (main.ts)                              │
│   helmet → compression → CORS → rateLimit → body parsers  │
└──────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ NestJS pipeline                                           │
│   Middleware:  RequestId → Security → Tenant → ReqLog     │
│   Guards:      RolesGuard (APP_GUARD) + per-route guards  │
│   Interceptors: Metrics → Logging → Timeout → Transform   │
│   Pipes:       ValidationPipe (whitelist + transform)     │
│   Controller:  route handler                              │
│   Filter:      AllExceptionsFilter → error envelope       │
└──────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ Service layer (business logic)                            │
│   Tenant-scoped Prisma queries · OpenAI calls · Redis I/O │
└──────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ Repository layer (Prisma Client → PostgreSQL + pgvector)  │
└──────────────────────────────────────────────────────────┘
```

### Module Structure

Each feature module follows a uniform shape:

```
<feature>/
├── <feature>.module.ts          # NestJS module definition
├── <feature>.controller.ts      # HTTP endpoints (Swagger-decorated)
├── <feature>.service.ts         # Business logic
├── <feature>.service.spec.ts    # Unit tests (Vitest + mock Prisma/Redis/OpenAI)
├── dto/                         # Data Transfer Objects (class-validator)
├── guards/                      # (optional) per-feature guards
├── strategies/                  # (optional) Passport strategies
└── interfaces/                  # (optional) TypeScript interfaces
```

### Three-Tier Module Composition

The `imports` array of `AppModule` follows a strict three-tier order so
the DI graph resolves top-to-bottom with no `forwardRef` required at
the app-module level:

1. **Shared infrastructure** — `@Global()` modules that provide
   cross-cutting concerns (config, Prisma, Redis, logging, metrics,
   health, OpenAI client, common filters/interceptors/middleware).
2. **Feature modules** — tenant-scoped REST APIs under `/api/*`
   (auth, users, employees, customers, distributors, products, orders,
   notifications, knowledge, ai, analytics, admin).
3. **Cross-cutting feature modules** — sibling workspace packages that
   wire multiple sub-modules together: `RagModule` + `EvaluationModule`
   + `RagSecurityModule` (from `../rag/`) and `VapiModule` (from
   `../vapi/`).

---

## 4. Module List (14 feature modules + 8 shared modules)

### Feature Modules

| # | Module                  | Path                                | Purpose                                                                  |
|---|-------------------------|-------------------------------------|--------------------------------------------------------------------------|
| 1 | `AuthModule`            | `backend/auth/`                     | Register, login, refresh, logout, password reset, email verification    |
| 2 | `UsersModule`           | `backend/users/`                    | User CRUD with RBAC                                                      |
| 3 | `CustomersModule`       | `backend/customers/`                | Customer CRUD + addresses + stats                                        |
| 4 | `DistributorsModule`    | `backend/distributors/`             | Distributor CRUD + performance + commissions                             |
| 5 | `EmployeesModule`       | `backend/employees/`                | Employee CRUD + role assignment                                          |
| 6 | `ProductsModule`        | `backend/products/`                 | Product CRUD + categories + inventory + search                           |
| 7 | `OrdersModule`          | `backend/orders/`                   | Order CRUD + items + status state machine                                |
| 8 | `NotificationsModule`   | `backend/notifications/`            | Notifications + templates + 5 providers (email/SMS/WhatsApp/push/in-app) |
| 9 | `AiModule`              | `backend/ai/`                       | Agents + conversations + memory + 8-tool registry                        |
| 10| `KnowledgeModule`       | `backend/knowledge/`                | Knowledge CRUD + RAG search + articles                                   |
| 11| `AnalyticsModule`       | `backend/analytics/`                | Dashboard + 8 metric endpoints                                           |
| 12| `AdminModule`           | `backend/admin/`                    | Users + tenants + config + audit + integrations                          |
| 13| `RagModule`             | `../rag/`                           | RAG pipeline (ingestion, retrieval, search, evaluation, memory)          |
| 14| `VapiModule`            | `../vapi/`                          | Voice AI (assistants, tools, webhooks, flows, memory, analytics)         |

> `AutomationModule` (`backend/automation/`) is a **placeholder** —
> only `automation/README.md` exists today. It is intentionally NOT
> imported in `app.module.ts` until the module file lands.

### Shared Modules (`_shared/`)

| # | Module            | Path                          | Purpose                                                              |
|---|-------------------|-------------------------------|----------------------------------------------------------------------|
| 1 | `ConfigModule`    | `_shared/config/`             | Env config with Zod validation (fails fast on missing required vars) |
| 2 | `PrismaModule`    | `_shared/database/`           | PrismaClient wrapper with graceful shutdown hooks (`@Global`)        |
| 3 | `SecurityModule`  | `_shared/security/`           | Redis, JWT blocklist, rate limiting, PermissionsGuard                |
| 4 | `AuthModule`      | `_shared/auth/`               | `@CurrentUser`, `@Public`, `@Roles` decorators + `RolesGuard`        |
| 5 | `HealthModule`    | `_shared/health/`             | `/health/live`, `/health/ready` endpoints (Terminus)                 |
| 6 | `MetricsModule`   | `_shared/metrics/`            | `/metrics` endpoint + `MetricsInterceptor`                           |
| 7 | `LoggingModule`   | `_shared/logging/`            | Winston logger + `RequestIdMiddleware`                               |
| 8 | `CommonModule`    | `_shared/common/`             | Exception filters, interceptors, middleware, decorators             |
| 9 | `ApiModule`       | `_shared/api/`                | `ApiResponse`, `PaginatedResponse`, `PaginationDto`                  |
| 10| `SharedAiModule`  | `_shared/ai/`                 | OpenAI client provider (`OPENAI_CLIENT` token, `@Global`)            |
| 11| `TestingModule`   | `_shared/testing/`            | Mock helpers (`createMockPrismaService`, `createMockRedis`)          |

> `_shared/` modules are owned by the security/infra agent and are
> **consumed** by feature modules — they are NOT modified by feature
> work (per task constraints).

---

## 5. API Design

### REST Conventions

- **Prefix**: `/api` (baked into each `@Controller('api/...')` decorator — `main.ts` does NOT call `app.setGlobalPrefix('api')` to avoid doubling the prefix).
- **Versioning**: v1 (path: `/api/v1/...` — current controllers use `/api/...` directly; explicit v1 versioning is a future follow-up).
- **Response envelope** (success):
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": { "requestId": "uuid", "timestamp": "iso-8601" }
  }
  ```
- **Pagination envelope**:
  ```json
  {
    "success": true,
    "data": [ ... ],
    "meta": {
      "requestId": "uuid",
      "timestamp": "iso-8601",
      "page": 1,
      "limit": 20,
      "total": 123,
      "totalPages": 7
    }
  }
  ```
- **Error envelope**:
  ```json
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "Resource not found",
      "details": null
    },
    "meta": { "requestId": "uuid", "timestamp": "iso-8601" }
  }
  ```

### Authentication

- **Scheme**: JWT Bearer token in the `Authorization` header
  (`Authorization: Bearer <accessToken>`).
- **Public endpoints**: marked with the `@Public()` decorator
  (`_shared/auth/public.decorator.ts`).
- **Token expiry**: 1 hour (access), 7 days (refresh).
- **Refresh-token rotation**: every refresh-token use issues a new
  refresh token and revokes the old one (via Redis blocklist).
- **Revocation**: access tokens can be revoked early via the Redis
  JWT blocklist (`JwtBlocklistService`) — checked on every authenticated
  request by `JwtAuthGuard`.

### Authorization (RBAC)

- **Roles**: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, `VIEWER`.
- **Permissions**: `resource:action` (e.g., `users:read`,
  `orders:create`, `admin:*`).
- **Decorators**:
  - `@Roles('ADMIN')` — role-based check (enforced by `RolesGuard`).
  - `@RequirePermissions('users:read')` — permission-based check
    (enforced by `PermissionsGuard`).
- **Guard chain**: `RolesGuard` (global `APP_GUARD`, no-op unless
  `@Roles()` set) → `JwtAuthGuard` (per-route opt-in) →
  `PermissionsGuard` (per-route opt-in).
- **Permission resolution**: `PermissionsGuard` loads the user's
  effective permissions via the `user_roles → role_permissions`
  Prisma join, caches the result in Redis for 5 minutes.

---

## 6. Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Express middleware (main.ts)                                      │
│    helmet → compression → CORS → rateLimit → json/urlencoded parsers │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. NestJS middleware (AppModule.configure())                         │
│    RequestIdMiddleware → SecurityMiddleware → TenantMiddleware →     │
│    RequestLoggingMiddleware                                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Guards (top-most first)                                           │
│    RolesGuard (APP_GUARD — no-op unless @Roles() set)                │
│    + per-route: JwtAuthGuard, PermissionsGuard, RagSecurityGuard     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Interceptors (request path, top → bottom)                         │
│    MetricsInterceptor → LoggingInterceptor → TimeoutInterceptor →    │
│    TransformInterceptor                                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Pipes                                                            │
│    ValidationPipe (whitelist + forbidNonWhitelisted + transform)    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Controller handler (route function)                              │
│    Calls into service layer → Prisma → PostgreSQL                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. Interceptors (response path, bottom → top)                       │
│    TransformInterceptor wraps payload in success envelope           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8. Filter (only on exception)                                       │
│    AllExceptionsFilter formats error into error envelope            │
│    PrismaExceptionFilter maps Prisma errors → HTTP statuses         │
└─────────────────────────────────────────────────────────────────────┘
```

### Prisma error mapping

| Prisma code | HTTP status | Code          |
|-------------|-------------|---------------|
| `P2002`     | 409         | `CONFLICT`    |
| `P2025`     | 404         | `NOT_FOUND`   |
| `P2003`     | 400         | `BAD_REQUEST` |
| other       | 500         | `INTERNAL`    |

---

## 7. Database Integration

- **ORM**: Prisma 6 with a single schema at
  `database/prisma/schema.prisma` (camelCase models, shared across the
  monorepo).
- **Client**: `PrismaService` (extends `PrismaClient`) provided by the
  `@Global()` `PrismaModule`. Every feature service injects it via
  constructor (`private readonly prisma: PrismaService`).
- **Multi-tenancy**: every tenant-scoped table has a `tenantId`
  column; the global `TenantMiddleware` resolves the active tenant
  from the JWT (or the `X-Tenant-Id` header for SUPER_ADMIN
  impersonation) and stamps it onto `req.user.tenantId`. Prisma
  queries filter by `tenantId` at the service layer.
- **Row-level security (RLS)**: PostgreSQL RLS policies backstop the
  application layer. The `TenantMiddleware` issues
  `SET app.current_tenant = '<uuid>'` on the connection before the
  request handler runs, so even a buggy service query cannot leak
  cross-tenant data.
- **Soft delete**: every tenant-scoped table has a `deletedAt`
  column. `PrismaService` extension auto-filters `deletedAt: null` on
  find queries and converts `delete()` into `update({ deletedAt: new Date() })`.
- **Audit triggers**: PostgreSQL triggers auto-log INSERT / UPDATE /
  DELETE into the `audit_logs` table (one row per change, with the
  `userId` + `tenantId` from the session).

---

## 8. Error Handling

### NestJS exception hierarchy

The service layer throws standard NestJS exceptions:

| Exception                       | HTTP | When to use                                            |
|---------------------------------|------|--------------------------------------------------------|
| `BadRequestException`           | 400  | Invalid input that bypassed the ValidationPipe         |
| `UnauthorizedException`         | 401  | Missing / invalid JWT, expired token                   |
| `ForbiddenException`            | 403  | RBAC check failed (role / permission denied)           |
| `NotFoundException`             | 404  | Resource not found (also: Prisma `P2025`)              |
| `ConflictException`             | 409  | Duplicate resource (also: Prisma `P2002`)              |
| `UnprocessableEntityException`  | 422  | Valid input but business rule violation                |
| `InternalServerErrorException`  | 500  | Unexpected error (also: unhandled Prisma errors)       |
| `ServiceUnavailableException`   | 503  | Dependency down (OpenAI, Redis)                        |

### Global filter

`AllExceptionsFilter` (`_shared/common/exceptions/all-exceptions.filter.ts`)
catches every exception thrown by any controller / service / guard and
formats it into the standard error envelope. It also:

- Logs the exception via `AppLoggerService` (with PII redaction).
- Stamps the `X-Request-Id` header from `req.id` into the response
  (`meta.requestId`) so logs and client telemetry can correlate.
- Prisma `PrismaClientKnownRequestError` instances are mapped to the
  appropriate HTTP status by `PrismaExceptionFilter`.

### PII redaction

`AppLoggerService` (Winston) redacts the following fields in every log
entry: `password`, `token`, `accessToken`, `refreshToken`, `apiKey`,
`Authorization`, `cookie`, `ssn`, `email` (partially — keeps the
domain), `phone` (keeps the country code).

---

## 9. Testing

### Unit tests (`*.spec.ts` next to source)

```bash
pnpm --filter backend test               # run once
pnpm --filter backend test:watch         # watch mode
pnpm --filter backend test:coverage      # V8 coverage report in coverage/
```

- Framework: Vitest.
- Mock helpers: `_shared/testing/` (`createMockPrismaService`,
  `createMockRedis`, mock OpenAI client).
- Pattern: each `*.service.spec.ts` mocks `PrismaService` + any
  cross-cutting dep, then exercises every public method of the
  service.

### E2E tests (`test/*.e2e.spec.ts`)

```bash
DATABASE_URL=postgres://... REDIS_URL=redis://... \
JWT_SECRET=$(openssl rand -hex 48) SESSION_SECRET=$(openssl rand -hex 48) \
pnpm --filter backend test:e2e
```

- Framework: Vitest + Supertest.
- Boots the full `AppModule` against a real PostgreSQL + Redis.
- Skipped automatically when `DATABASE_URL` / `REDIS_URL` /
  `JWT_SECRET` / `SESSION_SECRET` are unset (so CI can run unit tests
  without infra).

### Coverage targets

| Area                                        | Target |
|---------------------------------------------|--------|
| `_shared/common/` (filters, interceptors)   | ≥ 90 % |
| `_shared/security/` (JwtBlocklist, RateLimit) | ≥ 90 % |
| Feature services                            | ≥ 80 % |

### Test helpers (`backend/_shared/testing/`)

- `createMockPrismaService()` — returns a `PrismaService`-shaped object
  where every model delegate (`user`, `customer`, ...) has every
  method stubbed as a `vi.fn()`.
- `createMockRedis()` — returns an ioredis-shaped object with `get`,
  `set`, `del`, `expire`, `incr`, `pipeline`, etc., all stubbed.
- Mock OpenAI client — stubs `chat.completions.create` and
  `embeddings.create`.

---

## 10. Configuration

### Environment variables

All variables are validated at boot by
`_shared/config/configuration.schema.ts` (Zod). The app refuses to
start if any required variable is missing or malformed. See
`backend/.env.example` for the full list.

#### Key variables

| Variable                 | Description                              | Required |
|--------------------------|------------------------------------------|----------|
| `NODE_ENV`               | `development` \| `production` \| `test`  | yes      |
| `PORT`                   | HTTP port (default 3000)                 | no       |
| `DATABASE_URL`           | PostgreSQL connection string             | yes      |
| `REDIS_URL`              | Redis connection string                  | yes*     |
| `JWT_SECRET`             | JWT signing secret (≥ 32 chars)          | yes      |
| `JWT_EXPIRES_IN`         | Access-token TTL (default `1h`)          | no       |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token TTL (default `7d`)         | no       |
| `SESSION_SECRET`         | Cookie session secret (≥ 32 chars)       | yes      |
| `OPENAI_API_KEY`         | OpenAI API key (chat + embeddings)       | no**     |
| `OPENAI_MODEL`           | Chat completions model (default `gpt-4o`)| no       |
| `OPENAI_EMBEDDING_MODEL` | Embeddings model                         | no       |
| `VAPI_API_KEY`           | Vapi API key                             | no       |
| `VAPI_WEBHOOK_SECRET`    | Vapi webhook HMAC secret                 | no***    |
| `CORS_ORIGINS`           | Comma-separated allowed origins          | no       |
| `RATE_LIMIT_API_MAX`     | Max `/api/*` requests per 15 min         | no       |
| `RATE_LIMIT_AUTH_MAX`    | Max `/api/auth/*` requests per 15 min    | no       |

> \* `REDIS_URL` is marked optional in the Zod schema so unit tests
> can monkey-patch the module. It IS required in every non-test
> environment — `SecurityModule` throws at boot if it's unset.
>
> \*\* `OPENAI_API_KEY` is optional in the schema but the AI +
> knowledge feature modules throw at first use if it's missing.
>
> \*\*\* `VAPI_WEBHOOK_SECRET` is optional in the schema but the Vapi
> webhook signature verification fails CLOSED at runtime if it's unset
> in non-test environments — do NOT deploy without it.

### Configuration validation

- Zod schema in `_shared/config/configuration.schema.ts` validates
  every env var on startup.
- The app fails fast (`process.exit(1)`) if any required variable is
  missing or malformed.
- The `ConfigModule` exposes a typed `ConfigService` so feature code
  reads `configService.get<'OPENAI_MODEL'>('OPENAI_MODEL')` and gets
  full TypeScript autocompletion.

---

## 11. Security

### Defence in depth

| Layer          | Control                                                            |
|----------------|--------------------------------------------------------------------|
| Network        | HTTPS-only (HSTS via helmet); CORS allow-list; rate limiting       |
| HTTP headers   | Helmet (CSP, HSTS, COOP, COEP, X-Frame-Options, X-Content-Type-Options) |
| Body parsing   | 10 MB limit; `rawBody` enabled for webhook signature verification |
| Authentication | JWT (access + refresh); refresh-token rotation; Redis blocklist    |
| Authorization  | RBAC (roles + permissions); `PermissionsGuard` (Redis-cached)      |
| Tenancy        | `TenantMiddleware` + Prisma filter + PostgreSQL RLS                |
| Passwords      | bcrypt (12 rounds); policy (min 8 chars, upper, lower, number, symbol) |
| Secrets        | AWS Secrets Manager + External Secrets Operator (K8s); never in git |
| Webhooks       | HMAC-SHA256 signature verification (Vapi, WhatsApp, Twilio)        |
| Logging        | PII redaction (passwords, tokens, emails, phones)                  |
| Rate limiting  | IP-based global (100 / 15 min) + auth-endpoint (10 / 15 min)       |

### JWT blocklist

`JwtBlocklistService` (`_shared/security/jwt-blocklist.service.ts`)
stores revoked JWT IDs (JTIs) in Redis with a TTL equal to the
remaining token lifetime. `JwtAuthGuard` checks the blocklist on every
authenticated request — a revoked token is treated as invalid even
before its `exp` claim.

### Password policy

`PasswordPolicy` (`_shared/security/password.policy.ts`) enforces:
- Minimum 8 characters.
- At least one uppercase letter.
- At least one lowercase letter.
- At least one digit.
- At least one symbol.
- Not in the top-10k common-password list (loaded at boot).

### Webhook signature verification

Vapi / WhatsApp / Twilio webhooks are verified via HMAC-SHA256:

1. The raw request body is captured by `rawBody: true` in
   `NestFactory.create()` (see `main.ts`).
2. The webhook controller computes
   `HMAC_SHA256(rawBody, VAPI_WEBHOOK_SECRET)` and compares it
   (constant-time) to the `X-Vapi-Signature` header.
3. If verification fails, the controller returns 401 immediately —
   no business logic runs.

---

## 12. Observability

### Health checks

| Endpoint           | Description                                          |
|--------------------|------------------------------------------------------|
| `GET /health/live` | Liveness probe (always 200 if process is up)         |
| `GET /health/ready`| Readiness probe (200 only if PostgreSQL + Redis up)  |
| `GET /health`      | Alias for `/health/ready`                            |

### Metrics

| Endpoint       | Description                                              |
|----------------|----------------------------------------------------------|
| `GET /metrics` | Prometheus exposition format (text/plain; version 0.0.4) |

`MetricsInterceptor` records:

- `http_request_duration_seconds` (histogram, labels: `method`,
  `route`, `status`).
- `http_requests_total` (counter, labels: `method`, `route`, `status`).
- Default Node.js metrics (event loop, GC, heap).

RAG + voice metrics (`rag_query_duration_seconds`,
`voice_call_duration_seconds`, `tool_execution_total`) are emitted by
the respective modules.

### Logging

`AppLoggerService` (Winston-backed):

- **Format**: JSON in production, colourised pretty-print in dev.
- **Levels**: `error` > `warn` > `info` > `debug` > `verbose`
  (controlled by `LOG_LEVEL` env var).
- **Transports**: console (always), file (rotation in production).
- **PII redaction**: `password`, `token`, `accessToken`,
  `refreshToken`, `apiKey`, `Authorization`, `cookie`, `ssn`, `email`
  (partial), `phone` (partial).
- **Request ID**: every log line carries `requestId` (from
  `RequestIdMiddleware` → `req.id`) for log correlation across a
  single request.

### Request ID correlation

1. `RequestIdMiddleware` reads the `X-Request-Id` header (or
   generates a UUID v4 if absent).
2. Stamps it onto `req.id` and `req.headers['x-request-id']`.
3. Every downstream log line includes `requestId`.
4. `TransformInterceptor` + `AllExceptionsFilter` stamp
   `meta.requestId` into the response envelope.
5. The `X-Request-Id` response header is set by `app.use()` middleware
   so clients can correlate without parsing the body.

### Dashboards

Grafana dashboards (JSON in `deployment/grafana/dashboards/`):

| Dashboard                | Panels                                                        |
|--------------------------|---------------------------------------------------------------|
| API Overview             | Request rate, p50/p95/p99 latency, error rate, status codes   |
| Database                 | Connection pool, query duration, slow queries, RLS violations |
| Voice AI                 | Call rate, call duration, tool executions, webhook latency    |
| RAG                      | Ingestion rate, retrieval latency, recall/precision, hallucination rate |
| Business                 | Orders/day, customers/day, distributors active, AI cost/day  |

### Alerts

Prometheus alert rules (in `deployment/terraform/modules/eks/`):

- `APIErrorRateHigh` — error rate > 5% for 5 min.
- `APIp95LatencyHigh` — p95 latency > 2s for 5 min.
- `DatabaseConnectionsExhausted` — pool usage > 90% for 2 min.
- `RedisDown` — Redis unreachable for 1 min.
- `RagRetrievalLatencyHigh` — RAG retrieval p95 > 5s for 5 min.
- `VoiceCallFailureRateHigh` — voice call failure rate > 10% for 5 min.
- `CertExpiringSoon` — TLS cert expiring in < 14 days.

Alerts route to Alertmanager → Slack (`#dayjoy-alerts`) + PagerDuty
(for critical severity).

---

## 13. Build & Deploy

### Development

```bash
cd backend
pnpm install
pnpm start:dev          # http://localhost:3000 (hot reload via nest start --watch)
```

### Type checking

```bash
pnpm --filter backend exec tsc --noEmit -p tsconfig.check.json
```

### Production

```bash
pnpm --filter backend build           # nest build → dist/
pnpm --filter backend start:prod      # node dist/backend/main.js
```

### Docker

The backend ships as a Docker image built from the repo-root
`Dockerfile` (multi-stage: build with Node 20 + pnpm, run on a slim
image). The compose stack at the repo root (`docker-compose.yml`)
brings up:

- `backend` (this app, port 3000)
- `postgres` (PostgreSQL 15 + pgvector)
- `redis` (Redis 7)

```bash
docker compose up -d
docker compose logs -f backend
```

For the voice-AI subsystem, see `vapi/deployment/Dockerfile`.

### Kubernetes

Production manifests live in `deployment/kubernetes/`. Key resources:

- `Deployment` + `Service` for the backend (3 replicas, rolling update).
- `HorizontalPodAutoscaler` (CPU + memory targets).
- `PodDisruptionBudget` (min available = 2).
- `ExternalSecret` (syncs `JWT_SECRET`, `OPENAI_API_KEY`, etc. from
  AWS Secrets Manager).
- `NetworkPolicy` (allow ingress only from the nginx ingress
  controller namespace).

### Graceful shutdown

`app.enableShutdownHooks()` translates SIGTERM / SIGINT into
`app.close()`, which triggers `OnModuleDestroy` hooks:

- `PrismaService.$disconnect()`.
- `RedisModule`'s ioredis `quit()`.
- Any in-flight WebSocket connections drain.

The pod's `terminationGracePeriodSeconds` is set to 30 s in the K8s
manifest to give in-flight requests time to complete.

---

## 14. API Documentation

### Swagger UI (dev + staging only)

Mounted at **`/docs`** when `NODE_ENV !== 'production'`. Includes:

- Bearer-token auth (click **Authorize**, paste your JWT without the
  `Bearer ` prefix).
- Tags: `auth`, `users`, `customers`, `distributors`, `products`,
  `orders`, `ai`, `knowledge`, `analytics`, `admin`, `notifications`.
- Per-request duration display.

### OpenAPI spec

The OpenAPI 3 spec is generated from `@nestjs/swagger` decorators on
every controller + DTO. To export it as a JSON file:

```bash
NODE_ENV=development node -e "
  const { NestFactory } = require('@nestjs/core');
  const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
  const { AppModule } = require('./dist/backend/app.module');
  (async () => {
    const app = await NestFactory.create(AppModule);
    const config = new DocumentBuilder().setTitle('Dayjoy AI Enterprise API').setVersion('1.0.0').build();
    const doc = SwaggerModule.createDocument(app, config);
    require('fs').writeFileSync('openapi.json', JSON.stringify(doc, null, 2));
    await app.close();
  })();
"
```

The spec can then be imported into Postman / Insomnia / Stoplight.

---

## 15. Module Dependency Graph

```
                      ┌────────────────┐
                      │   AppModule    │
                      └───────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Shared infra     │  │ Feature modules  │  │ Cross-cutting    │
│ (_shared/)       │  │ (backend/*)      │  │ (../rag, ../vapi)│
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         │   @Global()         │                     │
         │   PrismaModule      │  imports Knowledge  │  imports Prisma +
         │   SharedAiModule    │  Module (one-way)   │  SharedAi (global)
         │   SecurityModule    │                     │
         │   LoggingModule     │  AiModule imports   │  VapiToolsModule
         │   HealthModule      │  KnowledgeModule    │  imports Knowledge +
         │   MetricsModule     │                     │  Products + Customers +
         │   CommonModule      │  (no circular deps  │  Distributors + Notif.
         │   ConfigModule      │   — verified)       │  (forwardRef, defensive)
         │   ApiModule         │                     │
         │   TestingModule     │                     │  RagModule imports
         │                     │                     │  Loaders + ContextBuilder +
         │                     │                     │  ResponsePipeline + Search +
         │                     │                     │  Memory + Evaluation + Security
         │                     │                     │  sub-modules
         └─────────────────────┴─────────────────────┘
```

### Circular dependency analysis (verified)

- `AiModule` → `KnowledgeModule` (one-way) — verified, no back-edge.
- `ToolsService` → `KnowledgeService` (one-way) — verified.
- `KnowledgeService` does NOT import any AI service.
- `VapiToolsModule` → backend feature modules (Knowledge / Products /
  Customers / Distributors / Notifications) — `forwardRef()` is used
  defensively by the vapi author in case any of those modules ever
  gain a back-reference; none exists today.
- `RagModule` sub-modules (`Loaders`, `ContextBuilder`,
  `ResponsePipeline`, `Search`, `Memory`, `Evaluation`, `Security`)
  are independently-importable — no inter-sub-module circular deps.

No `forwardRef` is required at the `AppModule` level. The DI graph
resolves cleanly.

---

## 16. References

| Document | Path |
|---|---|
| Backend README (developer quick-start) | `backend/README.md` |
| Backend wiring notes (Phase 8) | `backend/backend-notes.md` |
| API Standards | `docs/api/01_API_STANDARDS.md` |
| API Catalog | `docs/api/03_API_CATALOG.md` |
| Security Architecture | `docs/architecture/10_SECURITY_ARCHITECTURE.md` |
| RAG README | `rag/README.md` |
| RAG docs index | `rag/docs/README.md` |
| Vapi README | `vapi/docs/vapi-README.md` |
| Vapi architecture | `vapi/docs/vapi-architecture.md` |
| Vapi API documentation | `vapi/docs/vapi-api-documentation.md` |
| Database schema | `database/prisma/schema.prisma` |
| Database setup guide | `database/documentation/SETUP_GUIDE.md` |
| Deployment Docker compose | `deployment/docker/docker-compose.prod.yml` |
| Deployment Kubernetes manifests | `deployment/kubernetes/01-base-manifests.yaml` |
| Terraform (AWS infra) | `deployment/terraform/environments/production/main.tf` |

---

**Built with:** NestJS 10 · TypeScript 5 · Prisma 6 · PostgreSQL 15 ·
pgvector · Redis 7 · OpenAI · Winston · Prometheus · Vitest · Helmet ·
Swagger.
