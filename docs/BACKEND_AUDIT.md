# Backend Production-Readiness Audit

**Scope**: `/home/z/my-project/build-zip/backend/` (NestJS, TypeScript, Prisma 6, Redis, OpenAI)
**Date**: 2025 audit pass
**Auditor**: Principal Backend Architect (research-only — no files modified)

---

## Executive Summary

- **Overall readiness: 5.5/10** — A well-architected scaffold with thoughtful
  cross-cutting concerns (logging, metrics, error envelope, env validation),
  but several **critical correctness and security defects** that will cause
  data corruption and unauthorised access in production.
- **Critical gaps: 5** (see §"Critical gaps" below)
- **Production blockers:**
  1. **RBAC is silently disabled** on 7 of 13 feature controllers — any
     authenticated user can read/write orders, customers, products, users,
     employees, distributors, notifications.
  2. **Order creation is non-atomic** — `InventoryService.reserveStock` runs
     in its own transaction outside the parent `$transaction`, so partial
     failures orphan reserved stock.
  3. **Webhook signature verification is broken** — Vapi and WhatsApp
     controllers re-serialize the parsed body with `JSON.stringify` instead
     of using `req.rawBody`, defeating HMAC verification.
  4. **All notification providers are stubs** — Email / SMS / WhatsApp /
     Push providers `console.log` and return `success: true`. Password
     resets, order confirmations, and welcome emails never leave the pod.
  5. **No background job queue** — OpenAI calls, RAG ingestion, and
     notification dispatch all run synchronously in the request lifecycle.
     OpenAI outages will hang requests up to the 30 s timeout.

---

## 1. Architecture & Module Structure

### Findings

- **Module organization is clean and well-documented**.
  `app.module.ts:159-254` wires 8 shared infrastructure modules + 13 feature
  modules + 3 sibling-package modules (RAG / Vapi / WhatsApp) with explicit
  import ordering and a comprehensive docstring describing the request
  lifecycle (lines 119-158). Each shared module is `@Global()` (see
  `security.module.ts:19`, `redis.module.ts:21`) so feature modules don't
  need to re-import them — good practice.

- **No circular dependencies** — confirmed by Grepping for `forwardRef`.
  The only `forwardRef` usages are defensive in the sibling Vapi
  `VapiToolsModule` (per the docstring at `app.module.ts:69-76`). The DI
  graph resolves cleanly.

- **Module counts** (excluding `_express-reference/`):
  - 26 `*.module.ts` files (8 shared + 13 feature + 5 sibling)
  - 15 controllers (incl. health + metrics)
  - 25 services
  - 70 DTOs
  - This is a healthy, properly decomposed NestJS codebase.

- **`main.ts` (`backend/main.ts:1-231`)** configures every required
  cross-cutting concern:
  - **helmet** (line 72-82) with env-aware CSP
  - **compression** (line 83)
  - **CORS** with explicit allow-list + credentials (lines 95-115)
  - **express-rate-limit** on `/api/` (100/15min) and `/api/auth/`
    (10/15min) (lines 119-153)
  - **ValidationPipe** with `whitelist`, `forbidNonWhitelisted`,
    `transform` (lines 156-163)
  - **Swagger** at `/docs` in non-prod only (lines 166-204)
  - **Graceful shutdown** via `enableShutdownHooks()` + Prisma's own
    SIGTERM/SIGINT handlers (lines 210-212)
  - **rawBody** enabled (line 53) — but see §6 (webhooks don't use it)

- **Global filters / interceptors / guards** are registered correctly in
  execution order at `app.module.ts:223-253`: `AllExceptionsFilter` →
  `MetricsInterceptor` → `LoggingInterceptor` → `TimeoutInterceptor` →
  `TransformInterceptor` → `RolesGuard` (global APP_GUARD).

- **Request ID middleware** (`_shared/logging/request-id.middleware.ts`)
  honours inbound `x-request-id` and mirrors it back. The ID is consumed
  by `TransformInterceptor`, `AllExceptionsFilter`, and
  `RequestLoggingMiddleware` — full correlation across logs, responses,
  and metrics.

- **Tenant middleware** (`_shared/common/middleware/tenant.middleware.ts`)
  resolves `req.tenantId` from JWT or `X-Tenant-Id` header (admin-only
  impersonation path). **However**, the `SET LOCAL app.current_tenant`
  RLS hook documented at lines 23-39 is **not actually invoked anywhere**
  — services must rely on Prisma `where: { tenantId }` filters. A
  single missed `where` clause would leak cross-tenant data.

### Score: 7/10

Clean architecture, excellent documentation, proper lifecycle wiring.
Docked for: missing RLS enforcement, redundant `enableShutdownHooks`
double-wiring (line 211 + 212), and the `RolesGuard`-as-APP_GUARD design
that creates the RBAC hole documented in §2.

---

## 2. Authentication & Authorization

### Findings

- **JWT implementation** (`auth/auth.service.ts`, `auth/strategies/jwt.strategy.ts`)
  is **above industry baseline**:
  - **JTI blocklist** — `JwtBlocklistService` (`_shared/security/jwt-blocklist.service.ts`)
    stores revoked JTIs in Redis with TTL = remaining token lifetime.
    Multi-replica safe. Consulted on every authenticated request
    (`jwt.strategy.ts:46-51`).
  - **Refresh-token rotation** — `auth.service.ts:412-478` deletes the
    old session row, blocklists the old JTI, and issues a fresh JTI on
    every refresh. A stolen refresh token is therefore usable at most once.
  - **Session table** (`user_sessions`) keyed by `sha256(jti)` — even
    if Redis is flushed, refresh fails closed by requiring an existing
    session row (`auth.service.ts:439-441`).
  - **Per-token `jti`** generated via `randomBytes(16).toString('hex')`
    (line 847) — sufficient entropy.
  - **Both access and refresh tokens carry the same `jti`** — either
    can revoke the session.

- **Password hashing** (`_shared/security/password.policy.ts`):
  bcryptjs with 12 rounds (line 17, 49). Password strength validation
  enforces 8+ chars + 4 character classes (lines 25-43). DTOs enforce
  the same regex with `@Matches` (`register.dto.ts:19-20`) — defence in
  depth.

- **Brute-force protection** (`auth.service.ts:276-391`):
  - Per-email rate limit: 10 attempts / 15 min (line 46, 278-288)
  - Per-IP rate limit: 30 attempts / 15 min (line 48, 291-303)
  - **Account lockout** after 5 failed attempts — Redis key
    `auth:lockout:email:<email>` with 15-min TTL (lines 314-357)
  - **Existence hiding**: invalid email + invalid password return the
    same generic `Invalid email or password` (line 311, 358) — no email
    enumeration.
  - Success clears the failed-attempt counter (lines 362-371).

- **Password reset** (`auth.service.ts:555-685`):
  - 1-hour TTL tokens (line 37)
  - Always returns `{success: true}` — no email enumeration (line 563)
  - On success: revokes **all** active sessions for the user (line 663)
  - Token stored as opaque `randomBytes(32).toString('hex')` (line 110)
  - **NB**: token is stored in plaintext in `password_reset_tokens.token`
    column (line 586). Acceptable because tokens are 64 hex chars and
    TTL is 1 h, but hashing them (like `user_sessions.tokenHash`) would
    be better defence in depth.

- **🔴 CRITICAL — RBAC enforcement hole**:
  The global `APP_GUARD` is `RolesGuard` (`app.module.ts:250-253`),
  which only enforces `@Roles(...)` decorators
  (`_shared/common/guards/roles.guard.ts:9-27`). The fine-grained
  `PermissionsGuard` that enforces `@RequirePermissions(...)` is **only
  wired per-controller** and is missing from 7 of 13 feature controllers:

  | Controller | `@UseGuards(...)` | `@RequirePermissions(...)` present? | RBAC enforced? |
  |---|---|---|---|
  | `analytics.controller.ts:51` | `JwtAuthGuard, PermissionsGuard` | yes | ✅ |
  | `ai.controller.ts:40` | `JwtAuthGuard, PermissionsGuard` | yes | ✅ |
  | `admin.controller.ts:46` | `JwtAuthGuard, PermissionsGuard` | yes | ✅ |
  | `knowledge.controller.ts:57+` | `JwtAuthGuard, PermissionsGuard` | yes | ✅ |
  | `website-chat.controller.ts:192,211` | `JwtAuthGuard, PermissionsGuard` | yes | ✅ |
  | `orders.controller.ts:33` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |
  | `customers.controller.ts:25` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |
  | `products.controller.ts:36` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |
  | `users.controller.ts:24` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |
  | `employees.controller.ts:34` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |
  | `distributors.controller.ts:22` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |
  | `notifications.controller.ts:40` | `JwtAuthGuard` only | yes (decorator dead) | 🔴 NO |

  **Impact**: any authenticated user — including a brand-new
  self-registered `USER` role account — can `POST /api/orders`,
  `DELETE /api/users/:id`, `DELETE /api/products/:id`,
  `PUT /api/notifications/templates/:id`, etc. The
  `@RequirePermissions(...)` decorators set metadata but no guard reads
  it. The `app.module.ts:145-157` docstring acknowledges this design
  choice but mischaracterises it as safe — it is not.

- **`PermissionsGuard.canActivate`** (`_shared/security/permissions.guard.ts:58-120`)
  issues a Prisma `userRole.findMany({ include: { role: { include:
  { rolePermissions: { include: { permission: true }}}}}})` query on
  **every** permission-gated request (lines 85-97). With the JWT
  strategy also issuing a `user.findUnique` per request
  (`jwt.strategy.ts:55-66`), that's 2 DB round-trips per authenticated
  call before the handler even runs. Should be cached in Redis with a
  short TTL (e.g. 60 s) and invalidated on role change.

### Score: 4/10

JWT, refresh rotation, JTI blocklist, brute-force protection, and
password policy are excellent. But the RBAC enforcement hole on 7
controllers is a **production-blocking security defect** that drops the
score drastically.

---

## 3. API Design & Validation

### Findings

- **HTTP method usage is correct** across the controllers inspected:
  - `GET` for reads, `POST` for creates, `PUT`/`PATCH` for updates,
    `DELETE` for deletes (`orders.controller.ts:37-119`,
    `customers.controller.ts:29-105`, `products.controller.ts:48-150`).
  - `POST /api/orders/:id/cancel` and `POST /api/orders/:id/items` —
    correct use of action-style endpoints for non-CRUD operations.

- **Status codes**: `@HttpCode(HttpStatus.OK)` is used for `POST
  /api/auth/login` (`auth.controller.ts:82`) and `POST /api/auth/refresh`
  (line 95) — correct, since these don't create a resource.
  `POST /api/auth/register` correctly returns 201 (default). Order
  creation returns 201 (default).

- **Pagination** is consistent: every list endpoint uses the shared
  `_shared/api/pagination.dto.ts` `PaginationDto` with `page`, `limit`
  (capped at 100 — line 41), `search`, `sortBy`, `sortOrder`.
  Responses return `{ data, pagination: { page, limit, total,
  totalPages }}` (e.g. `orders.service.ts:120-124`,
  `customers.service.ts:147-155`). `PaginatedResponse.create`
  (`_shared/api/api-response.ts:121-139`) is the canonical builder.

- **DTOs use class-validator** pervasively. Spot-checked:
  - `register.dto.ts:37-64` — `@IsEmail`, `@MinLength(8)`,
    `@MaxLength(128)`, `@Matches(PASSWORD_PATTERN)`, `@IsOptional`
    everywhere appropriate.
  - `login.dto.ts:15-27` — same rigour.
  - `pagination.dto.ts:28-60` — `@IsInt`, `@Min`, `@Max`, `@Type(() => Number)`.
  - **Global `ValidationPipe`** registered in `main.ts:156-163` with
    `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
    — unknown fields are rejected, types are coerced. Good.

- **Error envelope** is consistent and well-defined
  (`_shared/api/api-response.ts`, `_shared/common/exceptions/all-exceptions.filter.ts`):
  ```json
  {
    "success": false,
    "error": { "code": "NOT_FOUND", "message": "...", "details": null },
    "meta": { "requestId": "...", "timestamp": "..." }
  }
  ```
  Status-to-code mapping (`all-exceptions.filter.ts:46-59`) is
  comprehensive and documented as part of the public API contract.
  Sensitive keys are recursively scrubbed from `details`
  (lines 297-313) — `password`, `token`, `apiKey`, `secret`,
  `authorization`, `accessToken`, `refreshToken`, `cookie`, `sessionId`.

- **Prisma errors are mapped** (`prisma-exception.filter.ts` — P2002 →
  409, P2025 → 404, P2003 → 400, P2014 → 400). Validated by
  `all-exceptions.filter.ts:187-209`.

- **Request ID propagation** is end-to-end:
  `RequestIdMiddleware` sets `req.id` →
  `LoggingInterceptor`/`RequestLoggingMiddleware` include it in logs →
  `AllExceptionsFilter` includes it in error `meta` →
  `TransformInterceptor` includes it in success `meta` →
  response `x-request-id` header mirrors it back to the client.

- **Structured logging**: `AppLoggerService`
  (`_shared/logging/logging.service.ts`) is Winston-backed, JSON in
  production, colorised in dev. PII redaction is recursive (lines
  91-111). Promoted to the application logger in `main.ts:59-60` so
  framework logs flow through Winston. ✅

- **Minor API-design issues**:
  - `GET /api/products/search` (`products.controller.ts:48-51`) doesn't
    use a DTO — `q` and `limit` are pulled directly off `@Query()`
    strings, bypassing validation. `limit` is unbounded.
  - `GET /api/website-chat/:sessionId/history`
    (`website-chat.controller.ts:157-169`) likewise pulls `page`/`limit`
    as raw strings — no `@IsInt` / `@Max` enforcement.
  - Inconsistent pagination shape: `orders.service.ts:120-124` returns
    `{ data, pagination: {...} }` while `customers.service.ts:147-155`
    returns `{ data, meta: {...} }`. Both will be wrapped by
    `TransformInterceptor` into the envelope, but the inner field name
    diverges (`pagination` vs `meta`).

### Score: 7/10

Solid, idiomatic NestJS REST design with strong validation and a
consistent error envelope. Docked for the unvalidated query-param
endpoints and the inconsistent pagination field name.

---

## 4. Database Layer

### Findings

- **`PrismaService`** (`_shared/database/prisma.service.ts`) is minimal
  (49 lines) — extends `PrismaClient`, calls `$connect` on init,
  `$disconnect` on destroy, and installs OS-signal handlers
  (lines 34-47). **No connection-pool tuning** — relies on Prisma 6's
  defaults (1 pool, `?connection_limit=10&pool_timeout=10s` if passed
  via URL). For a multi-replica K8s deployment this should be explicit.
- **No retry logic** for transient Prisma errors (P1001 connection
  lost, P1002 connection timed out, P2024 transaction timeout). A
  brief Postgres failover will surface as 500s to clients.
- **Graceful shutdown** is double-wired: `prismaService.enableShutdownHooks(app)`
  at `main.ts:211` registers SIGTERM/SIGINT handlers, then
  `app.enableShutdownHooks()` at line 212 does it again via NestJS.
  The first call's `process.on('SIGTERM', ...)` will run before the
  NestJS lifecycle hooks; the second will trigger `onModuleDestroy`
  via Nest's own signal listener. Works in practice but is redundant.

- **Transactions are used correctly for atomic multi-step operations**
  in `templates.service.ts:63-94`, `orders.service.ts:302-335` (update
  + audit log), `auth.service.ts:651-660` (password reset + token
  invalidation), `auth.service.ts:721-730` (email verify), and
  `inventory.service.ts:132-193` (stock update + transaction audit +
  audit log). Audit-log writes are consistently inside the
  transaction.

- **🔴 CRITICAL — Non-atomic order creation** (`orders.service.ts:181-284`):
  ```ts
  const order = await this.prisma.$transaction(async (tx) => {
    // 1. Reserve inventory for each item (throws on insufficient stock).
    for (const item of dto.items) {
      await this.inventoryService.reserveStock(  // ← uses this.prisma, NOT tx
        user.tenantId, item.productId, item.quantity, 'ORDER', orderNumber,
      );
    }
    // 2. Create the order + nested items.
    const created = await tx.order.create({...});
    ...
  });
  ```
  `InventoryService.reserveStock` (`inventory.service.ts:212-246`)
  opens its **own** `this.prisma.$transaction` — completely independent
  of the caller's `tx`. So:
  - If `tx.order.create` fails after `reserveStock` succeeds → reserved
    stock is committed but no order exists. **Stock leak.**
  - If `reserveStock` fails on the 3rd item → items 1 and 2 are
    reserved in their own (already-committed) transactions, the outer
    `$transaction` rolls back, but the orphaned reservations remain.

  The same anti-pattern occurs in `addItem` (line 460 — calls
  `reserveStock` BEFORE the `$transaction` block at line 468 begins),
  `removeItem` (line 511 — `releaseStock` outside the transaction),
  and `updateStatus` (lines 367-397 — `releaseStock`/`deductStock`
  looped AFTER the order update, each in its own transaction).

  This is the kind of bug that **will** cause inventory drift in
  production, especially under failure conditions (DB hiccups, OOM,
  partial pod restarts). Fix requires refactoring
  `InventoryService.reserveStock/releaseStock/deductStock` to accept
  an optional `tx` parameter and use it when called from within a
  transaction.

- **Raw SQL is parameterised** — every `$queryRaw`/`$executeRaw` uses
  Prisma's tagged-template syntax, which auto-parameterises. Verified
  at:
  - `analytics.service.ts:154-164` (date_trunc time-series)
  - `analytics.service.ts:218-225` (customer churn)
  - `knowledge.service.ts:611-613` (vector embedding update)
  - `knowledge.service.ts:639-653` (pgvector cosine similarity search)
  No string concatenation of user input into SQL. ✅

- **N+1 query patterns are mostly avoided** — services use `include`
  + `select` + `_count` to fetch related data in a single query
  (e.g. `orders.service.ts:106-117` includes `customer`, `distributor`,
  `_count.items`; `customers.service.ts:118-134` includes `_count.orders`
  and the latest order).
  - **However**, `customers.service.ts:158-181` `findOne` calls
    `getStats(id, currentUser)` *after* the main query, which issues
    another query against `customer.aggregate` — that's a serial
    waterfall that could be parallelised or merged.
  - `PermissionsGuard` (see §2) issues a 4-table join on every
    permission-gated request — should be cached.

- **`InventoryService.getLowStock`** (`inventory.service.ts:71-80`)
  has a logic bug: it queries `lowStockThreshold: { lte: threshold }`
  (line 75) — i.e. it returns products *whose threshold is at or below
  the supplied value*, not products whose *available quantity* is at
  or below the threshold. The subsequent `.filter` (line 79) does the
  real check client-side. The DB query should be
  `where: { quantity: { lte: lowStockThreshold }, tenantId }` or
  similar. Current implementation will miss low-stock products whose
  threshold is configured higher than the supplied argument.

### Score: 5/10

Good parameterisation, sensible transaction usage in most services,
and proper audit logging. But the **non-atomic order creation** is a
serious data-integrity defect, and the missing connection-pool /
retry configuration will hurt under load.

---

## 5. Performance & Scalability

### Findings

- **Redis is used** for:
  - JWT JTI blocklist (`jwt-blocklist.service.ts`)
  - Rate limiting (`rate-limit.service.ts` — sliding-window sorted set)
  - Account lockout (`auth.service.ts:315`)
  - WhatsApp webhook idempotency (`whatsapp-webhook.service.ts:38, 54-55`)
  - Vapi webhook idempotency (per `vapi-webhook-controller.ts:86` docstring)
  - Session token hash storage (in Postgres, not Redis, but
    blocklist lookup is Redis)

  The `RedisModule` (`_shared/security/redis.module.ts`) creates a
  single shared ioredis client with `maxRetriesPerRequest: 3`,
  `enableReadyCheck: true`, and exponential-backoff retry strategy
  (lines 35-46). ✅

- **No application-level caching** of frequently-read, rarely-changed
  data (e.g. `permissions`, `roles`, `notification templates`,
  `notification preferences`, `agent configurations`). Every request
  re-fetches from Postgres. The `redis.decorators.ts` file is just the
  `@InjectRedis()` parameter decorator — no `@Cacheable()` /
  `@CacheEvict()` abstractions.

- **🔴 No background job queue** — `package.json` does not include
  BullMQ, `@nestjs/bull`, or any queue abstraction. Confirmed by
  Grepping: zero `@Processor`, `@InjectQueue`, or `Queue` references
  in `backend/`. Everything is synchronous:
  - **OpenAI Chat Completions calls** (`ai/conversations.service.ts:238-243`)
    run inline in the request handler. A slow OpenAI response hangs
    the request up to the 30 s `TimeoutInterceptor` ceiling. No
    retry, no circuit breaker, no backpressure.
  - **RAG ingestion** (`knowledge.service.ts:587-619`) generates
    embeddings and writes them via raw SQL — synchronous, blocks the
    HTTP request. A 100-chunk document will take 5-15 s.
  - **Notification dispatch** (`notifications.service.ts:130`) runs
    synchronously with retry-with-backoff (lines 403-432, 100/200/400 ms
    backoff) — the request doesn't return until all retries complete.
    Worst case: 700 ms+ added latency on a `POST /api/orders` if the
    email provider is slow.

- **SSE streaming is implemented** for the website-chat endpoint
  (`website-chat.service.ts:230-349`, `website-chat.controller.ts:113-149`)
  using an async generator that writes to the Express `Response`
  directly. This is the only streaming endpoint in the backend.
  - `TimeoutInterceptor.isExempt` (line 72-82) correctly exempts
    `text/event-stream` requests.
  - **No WebSocket gateway** despite `@nestjs/platform-socket.io` and
    `@nestjs/websockets` being in `package.json` (lines 34, 38). The
    `InAppProvider` (`notifications/providers/in-app.provider.ts:42-57`)
    notes that "real-time push to the client (if any) would be
    triggered here via a websocket gateway" — but none exists. Clients
    must poll the inbox endpoint.

- **`/metrics` endpoint** (`_shared/metrics/metrics.controller.ts`) is
  a real Prometheus exposition:
  - Dedicated `promClient.Registry` (line 10) — not the global one, so
    other libs can't pollute it.
  - Default metrics collected (line 11).
  - Custom histograms: `http_request_duration_seconds`,
    `http_requests_total`, `rag_query_duration_seconds`,
    `voice_call_duration_seconds` (lines 18-50).
  - `MetricsInterceptor` (`metrics.interceptor.ts`) records latency +
    count on every request, labelled by method/route/status.
  - **However**, the `route` label uses `req.route.path` when available
    and falls back to the raw URL with query string stripped (lines
    58-68). For 404s and parameterised routes that don't match
    `req.route`, this can produce unbounded cardinality. Should use
    the matched NestJS route template, not Express's.

- **No connection pooling for OpenAI SDK** — `OpenAiProvider`
  (`_shared/ai/openai.provider.ts:24-35`) creates a single `new OpenAI({apiKey})`
  client. The SDK uses `fetch` under the hood with a default
  `maxRetries: 2`, but no `timeout` is configured. An OpenAI hiccup
  can hang the SDK's internal retry loop for ~30 s — exhausting the
  `TimeoutInterceptor` budget.

- **Pagination is offset-based** everywhere (`skip = (page - 1) * limit`).
  For large tables this degrades as `OFFSET` grows — Postgres has to
  scan and discard rows. Cursor-based pagination would be better for
  the high-volume tables (`messages`, `audit_logs`,
  `inventory_transactions`, `analytics_events`).

### Score: 5/10

Redis is used appropriately for the things that need it, and metrics
are properly wired. But the **complete absence of a background job
queue** is a structural problem — OpenAI calls, RAG ingestion, and
notification dispatch all block the request lifecycle. The missing
WebSocket gateway is a UX gap. No application-level caching means
every request pays the Postgres round-trip tax.

---

## 6. Security Hardening

### Findings

- **helmet** is configured (`main.ts:72-82`) with env-aware CSP.
  `crossOriginEmbedderPolicy: false` is set — sensible default since
  many third-party integrations break under strict COEP.

- **CORS** (`main.ts:95-115`) uses an explicit allow-list parsed from
  `CORS_ORIGINS` env var, supports credentials, and rejects unknown
  origins. ✅

- **Rate limiting** (`main.ts:119-153`): two tiers (global 100/15min,
  auth 10/15min). Uses `express-rate-limit` (IP-based). Note:
  `@nestjs/throttler` is in `package.json:37` but **not wired** —
  grep for `ThrottlerModule` / `ThrottlerGuard` returns zero matches.
  Either remove the dependency or replace `express-rate-limit` with it
  for consistency with the NestJS ecosystem.

- **Security headers middleware** (`_shared/common/middleware/security.middleware.ts`)
  sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `X-XSS-Protection: 0` (correct — the Auditor is deprecated),
  `Referrer-Policy: strict-origin-when-cross-origin`, and a strict
  `Permissions-Policy`. `Cache-Control: no-store` is applied to all
  `/api/*` routes. ✅

- **Input sanitisation (XSS)**: relies on `class-validator`
  `whitelist: true` + `forbidNonWhitelisted: true` to strip unknown
  fields. **No HTML sanitisation** — content stored via
  `notifications.templates.service.ts` or `knowledge.service.ts` is
  persisted as-is. If any client renders this HTML, it will execute
  injected scripts. The `cheerio` dependency (`package.json:41`)
  suggests HTML parsing is available but no sanitiser (DOMPurify,
  sanitize-html) is wired.

- **SQL injection**: see §4 — all `$queryRaw` / `$executeRaw` uses
  tagged templates, which Prisma parameterises. ✅

- **File upload validation**: **no file-upload endpoints found** in
  the backend controllers. The RAG ingestion endpoint accepts
  base64-encoded content via JSON (`knowledge/dto/knowledge.dto.ts`
  `IngestDocumentDto`), bounded by the 10 MB body limit
  (`main.ts:68-69`). No MIME-type validation, no magic-byte
  validation, no antivirus scan — a malicious base64 payload could
  trigger memory pressure.

- **🔴 CRITICAL — Webhook signature verification is broken**:
  - **Vapi** (`vapi/webhooks/vapi-webhook-controller.ts:62-82`):
    ```ts
    // Re-serialize the body for signature verification. ...
    const rawPayload = JSON.stringify(body);  // line 68
    const verified = await this.webhookService.verifySignature(
      rawPayload, signature, timestamp,
    );
    ```
    `main.ts:53` enables `rawBody: true`, so `req.rawBody` is
    available as a Buffer. But the controller discards it and
    re-serialises the parsed body. `JSON.stringify` does **not**
    guarantee byte-identical output to what Vapi sent — key ordering
    can differ, whitespace can differ, Unicode escaping can differ.
    The docstring at lines 62-67 acknowledges this and waves it away
    with "we control both ends" — but Vapi is a third-party service
    we do **not** control. Either:
    (a) signature verification fails on legitimate webhooks → silent
        webhook drops, or
    (b) signature verification passes because the re-serialized body
        happens to match → real risk of signature bypass if Meta/Vapi
        ever change serialization.

  - **WhatsApp** (`whatsapp-ai/webhooks/whatsapp-webhook.controller.ts:96-112`):
    identical bug — `JSON.stringify(body)` instead of `req.rawBody`.
    Meta explicitly documents that the signature is computed over the
    raw POST body. The WhatsApp service's own docstring
    (`whatsapp-webhook.service.ts:50, 126`) calls this out: "Meta
    signs the **raw bytes** of the POST body" — yet the controller
    re-serialises anyway.

  **Fix**: in both controllers, change to `const rawPayload =
  req.rawBody?.toString('utf8') ?? JSON.stringify(body);` and verify
  against the raw bytes. The `rawBody: true` flag in `main.ts:53`
  already provides this.

- **Secrets in code**: grepped for hardcoded API keys / passwords —
  none found in source. `OPENAI_API_KEY`, `JWT_SECRET`, etc. all
  come from env vars. The `OpenAiProvider` factory
  (`_shared/ai/openai.provider.ts:26-34`) fails fast at bootstrap if
  `OPENAI_API_KEY` is missing. The env schema
  (`_shared/config/configuration.schema.ts:16-34`) requires
  `JWT_SECRET` to be ≥32 chars and `DATABASE_URL` to be a valid URL.
  `REDIS_URL` is marked optional (line 30) — but `RedisModule` throws
  at runtime if it's missing (`redis.module.ts:28-33`). Schema and
  runtime are inconsistent.

- **`NODE_ENV === 'test'` bypass** in `whatsapp-webhook.service.ts:139-141`:
  signature verification is unconditionally skipped in test env. This
  is documented and intended, but if `NODE_ENV` is ever accidentally
  set to `test` in a production-like environment, webhooks become
  unauthenticated. Defence in depth: require an explicit
  `WEBHOOK_SIGNATURE_VERIFY=false` flag instead of overloading
  `NODE_ENV`.

- **`process.env` direct access** in non-config files: 8 occurrences
  outside `_shared/config/configuration.ts` (e.g.
  `auth.service.ts:55`, `ai/conversations.service.ts:230`,
  `website-chat/website-chat.service.ts:48-49, 284`,
  `_shared/ai/openai.provider.ts:27`,
  `_shared/common/exceptions/all-exceptions.filter.ts:265, 278`).
  These bypass the validated `ConfigService` — env-var typos won't be
  caught at startup. Minor, but worth consolidating.

### Score: 5/10

Solid baseline (helmet, CORS, rate limiting, env validation, no
hardcoded secrets). But the **broken webhook signature verification**
is a critical defect that either drops legitimate webhooks or exposes
the platform to forged webhook attacks.

---

## 7. Testing

### Findings

- **Test file count**: 24 `*.spec.ts` files (per `find backend -name
  "*.spec.ts" | wc -l`):
  - 21 unit-test files co-located with source (one per service + a few
    shared infra specs).
  - 1 e2e spec: `backend/test/app.e2e.spec.ts` — but it's
    **`describe.skipIf(!E2E_ENABLED)`** gated (lines 32-37) on
    `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SESSION_SECRET` all
    being set. So `pnpm test` doesn't run it.
  - 2 shared-infra specs: `all-exceptions.filter.spec.ts`,
    `transform.interceptor.spec.ts`.

- **Coverage**: `vitest.config.ts:38-49` configures `v8` coverage with
  sensible excludes (modules, main, DTOs, specs themselves). But the
  `test:coverage` script (`package.json:20`) isn't run by default.
  No coverage threshold is enforced.

- **Unit tests use mocked Prisma + Redis** — `_shared/testing/mock-prisma.service.ts`
  and `_shared/testing/mock-redis.ts` provide shared mocks. Verified
  in `auth.service.spec.ts:36-61` — `createMockPrismaWithSessions()`
  extends the base mock with auth-specific models. Tests are
  deterministic and don't need a real DB.

- **Integration tests with a real database**: only the gated e2e spec
  at `backend/test/app.e2e.spec.ts`. It boots the full `AppModule`
  against a real Postgres + Redis and exercises:
  - `/health/live`, `/health`
  - Auth flow: register → login → refresh → logout
  - Response envelope shape
  - Basic CRUD on `/api/customers`
  This is the **only** end-to-end coverage. No controller-level tests,
  no guard-level tests, no integration tests for the order
  transaction bug, no integration tests for the webhook signature
  verification.

- **Test coverage gaps**:
  - `JwtAuthGuard` / `PermissionsGuard` interaction — no test asserts
    that an endpoint with `@RequirePermissions('orders:read')` actually
    rejects a user without that permission. If such a test existed,
    the §2 RBAC hole would have been caught.
  - `OrdersService.create` transactional integrity — no test asserts
    that a failed `tx.order.create` rolls back the inventory
    reservation. If such a test existed, the §4 atomicity bug would
    have been caught.
  - Webhook signature verification — no test asserts that a
    tampered-payload webhook is rejected by the *controller* (the
    service has its own unit test, but the controller's
    `JSON.stringify(body)` substitution is what breaks the contract).
  - No load / soak tests in `backend/` — `vapi/tests/vapi-load-tests.ts`
    exists for the sibling Vapi package, but the core backend has
    zero performance tests.

- **The vitest config** (`vitest.config.ts:31-37`) explicitly includes
  the sibling `../rag/loaders`, `../rag/ingestion`,
  `../rag/embeddings`, `../rag/vector-store` spec files — good for
  monorepo cohesion. SWC is configured with `emitDecoratorMetadata:
  true` (lines 21-23) so NestJS DI works in tests.

### Score: 6/10

Good unit-test discipline (one spec per service, shared mocks,
co-located files). The e2e spec is well-structured but gated behind
env vars. Major gaps: no tests for the RBAC enforcement contract, no
tests for transactional integrity, no tests for webhook signature
verification at the controller boundary.

---

## 8. Production Readiness Gaps

### Concrete gaps

1. **RBAC enforcement on 7 controllers** (see §2) — `orders`,
   `customers`, `products`, `users`, `employees`, `distributors`,
   `notifications` controllers declare `@RequirePermissions(...)`
   decorators but don't wire `PermissionsGuard` into `@UseGuards(...)`.
   Fix: either (a) add `PermissionsGuard` to each controller's
   `@UseGuards(JwtAuthGuard, PermissionsGuard)`, or (b) register
   `PermissionsGuard` as a second global `APP_GUARD` alongside
   `RolesGuard`.

2. **Non-atomic order creation** (see §4) — `InventoryService`'s
   `reserveStock` / `releaseStock` / `deductStock` open their own
   transactions instead of participating in the caller's. Fix:
   refactor to accept an optional `Prisma.TransactionClient` parameter
   and use it when provided.

3. **Webhook signature verification** (see §6) — both Vapi and
   WhatsApp controllers re-serialize the parsed body via
   `JSON.stringify(body)` instead of using `req.rawBody`. Fix:
   `const rawPayload = req.rawBody?.toString('utf8') ?? JSON.stringify(body);`

4. **Notification providers are stubs** (see Executive Summary) —
   `_shared/notifications/providers/{email,sms,whatsapp,push}.provider.ts`
   each `console.log` and return `success: true`. Replace with real
   SendGrid/SES + Twilio + Meta Cloud API + Firebase Admin SDK
   implementations before going live. **Password reset, email
   verification, order confirmation, and welcome emails currently
   never leave the pod.**

5. **No background job queue** (see §5) — OpenAI calls, RAG
   ingestion, and notification dispatch are synchronous. Introduce
   BullMQ (`@nestjs/bullmq`) backed by the existing Redis for:
   - Order-event notification dispatch
   - RAG document ingestion / chunking / embedding
   - Password-reset / welcome-email sending
   - Analytics event aggregation

6. **No WebSocket gateway** — `@nestjs/platform-socket.io` and
   `@nestjs/websockets` are in `package.json` but unused. Real-time
   notification delivery, live order updates, and admin dashboards
   will require polling. Implement a `NotificationsGateway` that
   pushes to authenticated user rooms.

7. **No Prisma connection-pool tuning** — rely on URL parameters or
   explicit `PrismaClientOptions` for `connection_limit`,
   `pool_timeout`, `statement_timeout`. For K8s deployments with
   multiple replicas, this matters.

8. **No retry / circuit breaker for OpenAI** — wrap `openai.chat.completions.create`
   with a timeout (e.g. 15 s) and a circuit breaker (e.g. `opossum`
   or `cockatiel`) so an OpenAI outage degrades gracefully instead
   of hanging requests.

9. **No Postgres RLS enforcement** — the `TenantMiddleware` documents
   the `SET LOCAL app.current_tenant` pattern
   (`_shared/common/middleware/tenant.middleware.ts:23-39`) but no
   service actually invokes it. A single missed `where: { tenantId }`
   in any service leaks cross-tenant data. Either enforce RLS at the
   DB level (and propagate the tenant via `SET LOCAL` in every
   transaction) or add a lint rule / integration test that asserts
   every tenant-scoped query includes `tenantId`.

10. **No coverage threshold** — `pnpm test:coverage` exists but
    doesn't gate CI. Set a minimum (e.g. 70 % lines, 60 % branches)
    and enforce it.

11. **`InventoryService.getLowStock`** query is semantically wrong
    (see §4) — queries by `lowStockThreshold` value, not by available
    quantity vs threshold.

12. **Inconsistent pagination response shape** (see §3) — some
    services return `{ data, pagination }`, others `{ data, meta }`.

13. **`@nestjs/throttler` dependency is dead weight** — either wire
    it as the global `APP_GUARD` (replacing `express-rate-limit`) or
    remove it from `package.json`.

14. **No request body size limit on `IngestDocumentDto`** beyond the
    global 10 MB. A malicious large base64 payload can OOM the pod.

15. **No graceful degradation for Redis outage** — `JwtBlocklistService`
    fails open (`jwt-blocklist.service.ts:67-72`), `RateLimitService`
    fails open (`rate-limit.service.ts:72-84`). Documented and
    intentional, but means a Redis outage = no rate limiting + no
    token revocation. Consider failing closed for blocklist checks
    on sensitive endpoints (admin, password reset).

### Stubs / mocks that need real implementation

| File | Stub | Replacement |
|---|---|---|
| `notifications/providers/email.provider.ts` | `console.log` + return success | nodemailer / SendGrid SDK |
| `notifications/providers/sms.provider.ts` | `console.log` + return success | Twilio SDK |
| `notifications/providers/whatsapp.provider.ts` | `console.log` + return success | Meta Cloud API (already used by `whatsapp-ai/` inbound) |
| `notifications/providers/push.provider.ts` | `console.log` + return success | Firebase Admin SDK |
| `_express-reference/**` | entire directory is the old Express scaffold — "TODO: Implement" everywhere | should be deleted; the NestJS modules supersede it |

### What would fail under load

1. **Order creation** — the non-atomic transaction bug means inventory
   drift accumulates over time. Under failure conditions (DB hiccup,
   pod restart mid-request) you'll see "phantom reservations" where
   stock is reserved against non-existent orders.
2. **OpenAI calls** — synchronous, no timeout, no circuit breaker. A
   slow OpenAI response backs up the Node event loop's HTTP server,
   exhausting the connection limit. The 30 s `TimeoutInterceptor`
   helps but doesn't free the underlying OpenAI SDK call.
3. **Notification dispatch** — synchronous, with 700 ms+ worst-case
   retry backoff. A `POST /api/orders` that triggers an
   `order.created` notification waits for the email provider before
   returning 201.
4. **`PermissionsGuard` DB query per request** — at 1000 req/s this
   is 1000 extra Prisma queries/s just for RBAC. Should be cached.
5. **Offset pagination on `messages`, `audit_logs`,
   `inventory_transactions`, `analytics_events`** — `OFFSET 10000`
   on a million-row table is ~50 ms; `OFFSET 100000` is ~500 ms.
6. **No connection pooling for OpenAI** — every request opens a new
   HTTP/2 stream. Under burst load this can hit the SDK's internal
   limits.
7. **`/metrics` route cardinality** — the `route` label falls back to
   the raw URL for unmatched routes, which can blow up Prometheus
   cardinality if a scanner hits thousands of distinct 404 paths.

---

## Critical gaps (must fix before production)

1. **RBAC enforcement hole** — `PermissionsGuard` not wired on 7
   controllers (`orders`, `customers`, `products`, `users`,
   `employees`, `distributors`, `notifications`). Any authenticated
   user has full CRUD on these resources. *Evidence:
   `orders.controller.ts:33`, `customers.controller.ts:25`,
   `products.controller.ts:36`, `users.controller.ts:24`,
   `employees.controller.ts:34`, `distributors.controller.ts:22`,
   `notifications.controller.ts:40` — each declares only
   `@UseGuards(JwtAuthGuard)`.*

2. **Non-atomic order creation** — `OrdersService.create` wraps
   `reserveStock` in a `$transaction` but `reserveStock` opens its
   own transaction. Stock leaks on partial failure. *Evidence:
   `orders.service.ts:181-191` calls `this.inventoryService.reserveStock`
   (which uses `this.prisma.$transaction` at `inventory.service.ts:212`)
   instead of `tx.inventory.update`.*

3. **Webhook signature verification bypass** — Vapi and WhatsApp
   controllers re-serialize the parsed body via `JSON.stringify(body)`
   instead of using `req.rawBody`. *Evidence:
   `vapi/webhooks/vapi-webhook-controller.ts:68`,
   `whatsapp-ai/webhooks/whatsapp-webhook.controller.ts:103`. `main.ts:53`
   enables `rawBody: true` but it's not consumed.*

4. **Notification providers are stubs** — Email / SMS / WhatsApp /
   Push providers `console.log` and return success. Password resets,
   order confirmations, and welcome emails never reach users.
   *Evidence: `notifications/providers/email.provider.ts:23-33`,
   `sms.provider.ts:19-27`, `whatsapp.provider.ts:19-27`,
   `push.provider.ts:19-29`.*

5. **No background job queue** — synchronous OpenAI / RAG / notification
   work blocks request handlers. No BullMQ / `@nestjs/bull` dependency.
   *Evidence: `package.json:27-63` has no queue lib; grep for
   `@Processor` / `@InjectQueue` returns zero matches.*

---

## Recommendations (should fix)

1. **Cache `PermissionsGuard` results in Redis** — key by `userId`,
   TTL 60 s, invalidate on `AdminService.updateUserRole`.
2. **Add Prisma connection-pool tuning** — explicit `connection_limit`,
   `pool_timeout`, `statement_timeout` via env vars.
3. **Add OpenAI timeout + circuit breaker** — 15 s timeout, 5-failure
   circuit open for 60 s.
4. **Implement WebSocket gateway for notifications** —
   `@WebSocketGateway({ auth: 'jwt' })` pushing to user rooms.
5. **Switch high-volume list endpoints to cursor pagination** —
   `messages`, `audit_logs`, `inventory_transactions`,
   `analytics_events`.
6. **Add HTML sanitiser** for notification templates / RAG content —
   `sanitize-html` or DOMPurify.
7. **Add MIME / magic-byte validation** for `IngestDocumentDto`
   content.
8. **Add integration tests for transactional integrity** — verify
   that a failed `tx.order.create` rolls back inventory reservation.
9. **Add controller-level tests for RBAC** — verify that a user
   without `orders:read` gets 403 on `GET /api/orders`.
10. **Enforce Postgres RLS** or add a lint rule that every
    tenant-scoped Prisma query includes `tenantId`.
11. **Remove `_express-reference/`** — the entire directory is the
    pre-NestJS scaffold with "TODO: Implement" everywhere. Confusing
    and a maintenance liability.
12. **Consolidate `process.env` access** through `ConfigService` —
    8 direct accesses outside `_shared/config/configuration.ts`.
13. **Use `req.rawBody`** for webhook signature verification — fix
    the Vapi + WhatsApp controllers (already a critical gap, but
    also a recommendation to add a regression test).
14. **Add coverage threshold** to `vitest.config.ts` — 70 % lines,
    60 % branches, fail CI on regression.
15. **Wire `@nestjs/throttler` or remove it** — dead-weight dependency
    is confusing.

---

## What's already good

1. **JWT implementation is excellent** — JTI blocklist, refresh-token
   rotation, session table with `sha256(jti)` hashing, brute-force
   protection with account lockout, existence-hiding error messages.
   *Evidence: `auth/auth.service.ts:412-478, 276-391`,
   `_shared/security/jwt-blocklist.service.ts`.*

2. **Password policy is strong** — bcrypt 12 rounds, 4-character-class
   strength validation enforced in both DTO and service layer.
   *Evidence: `_shared/security/password.policy.ts`.*

3. **Error envelope is consistent and well-documented** —
   `AllExceptionsFilter` handles every exception type (HttpException,
   Prisma errors, native Error, non-Error throws), recursively
   redacts sensitive fields, and includes `requestId` + `timestamp`
   in every response. *Evidence:
   `_shared/common/exceptions/all-exceptions.filter.ts`.*

4. **Structured logging with PII redaction** — Winston-backed,
   JSON in production, colorised in dev, recursive redaction of
   `password` / `token` / `apiKey` / `secret` / `authorization` /
   `accessToken` / `refreshToken` / `cookie`. Promoted to the
   application logger so framework logs flow through Winston.
   *Evidence: `_shared/logging/logging.service.ts`.*

5. **Request ID propagation** is end-to-end — middleware sets it,
   interceptors / filters / loggers consume it, response header
   mirrors it. *Evidence: `_shared/logging/request-id.middleware.ts`,
   consumed by `TransformInterceptor`, `AllExceptionsFilter`,
   `LoggingInterceptor`, `RequestLoggingMiddleware`.*

6. **Metrics endpoint is properly isolated** — dedicated
   `promClient.Registry` (not the global one), custom business
   histograms (`rag_query_duration_seconds`,
   `voice_call_duration_seconds`), `MetricsInterceptor` records
   latency + count on every request. *Evidence:
   `_shared/metrics/metrics.controller.ts`,
   `_shared/metrics/metrics.interceptor.ts`.*

7. **Health endpoints are correctly split** — `/health/live` for
   liveness (no external deps), `/health/ready` for readiness
   (Postgres + Redis ping), `/health` as alias. *Evidence:
   `_shared/health/health.controller.ts`.*

8. **Env-var validation at startup** — Zod schema in
   `_shared/config/configuration.schema.ts`, enforced by
   `ConfigModule`'s `validate` callback (`config.module.ts:11-19`).
   Misconfigured env vars fail fast at bootstrap.

9. **Audit logging is pervasive** — every write operation in
   `OrdersService`, `InventoryService`, `CustomersService`,
   `TemplatesService`, `AdminService` writes an `audit_log` row
   with old/new values, actor, action, and resource. Properly
   included inside the same transaction as the mutation.

10. **Tenant scoping in services** — every Prisma query in the
    feature services includes `where: { tenantId: user.tenantId }`.
    The `TenantMiddleware` provides admin-only tenant impersonation
    via `X-Tenant-Id` header. *Evidence:
    `_shared/common/middleware/tenant.middleware.ts`,
    `orders.service.ts:630-647`, `customers.service.ts:95-116`.*

11. **Module documentation is exceptional** — `app.module.ts:119-158`
    documents the request lifecycle; every shared module / service /
    guard has a comprehensive docstring explaining design decisions
    and trade-offs. This is rare and valuable.

12. **SSE streaming for website chat** — async-generator-based
    streaming with proper SSE event formatting, error events
    mid-stream, and `X-Accel-Buffering: no` to disable nginx
    buffering. *Evidence:
    `website-chat/website-chat.service.ts:230-349`,
    `website-chat/website-chat.controller.ts:113-149`.*

13. **Soft-delete discipline** — `AiService.remove` flips `status`
    to `archived` (`ai.service.ts:98-105`) instead of hard-deleting,
    preserving referential integrity for `Conversation` /
    `Message` / `AiMemory` rows. Same pattern in
    `ConversationsService.deleteConversation` (line 311-318).

14. **Defence-in-depth password validation** — DTO enforces the
    regex (`register.dto.ts:44`), service re-validates via
    `PasswordPolicy.validate` (`auth.service.ts:179-182`).
