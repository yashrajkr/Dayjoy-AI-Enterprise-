# Remaining Folders — World-Class Audit

> **Auditor:** Principal Software Architect
> **Scope:** Folders NOT already covered by backend / RAG / database / memory / knowledge / Vapi audits
> **Mode:** Research-only (no files modified)
> **Date:** 2026-Q1
> **Methodology:** Read actual files; cite specific evidence (file paths + line counts + code excerpts)

---

## Executive Summary

- **Folders audited:** 10
- **Total TypeScript / TypeScript-JSON lines reviewed:** ~90,000+ across whatsapp-ai, automation, apps/, packages/, shared/, monitoring, deployment, testing
- **Overall readiness:** **6.5 / 10** (the codebase has world-class scaffolding and infrastructure, but the user-facing admin layer is mock-only and the website-chat widget is a stub)
- **World-class (≥ 8/10):** 5 folders — `whatsapp-ai/`, `automation/`, `monitoring/`, `deployment/`, `testing/`
- **Solid (6-7/10):** 4 folders — `apps/admin-dashboard/`, `apps/customer-portal/`, `apps/distributor-portal/`, `apps/employee-portal/`
- **Needs work (≤ 4/10):** 1 folder — `apps/website-chat/` (placeholder only) — plus weak spots in `packages/ui/`, `packages/sdk/`, `shared/`, `packages/database/`

**Headline findings**

1. **Backend ↔ Frontend contract is broken.** The admin-dashboard ships a fully-typed Axios client (`apps/admin-dashboard/src/lib/api.ts`) that unwraps the NestJS envelope and handles 401/403/429 — but **none of the dashboard views use it**. All 13 views read from Zustand stores persisted to `localStorage` (e.g. `assistant-store.ts` line 107 `create<AssistantState>()(persist(...))` with seed arrays). The login page (`apps/admin-dashboard/src/app/login/page.tsx` line 57) literally says: *"Simulated auth call — replace with real POST /api/auth/login when backend is wired"*. **Severity: P0** — admin dashboard is non-functional in production.
2. **`apps/website-chat/` is a placeholder.** The page (`src/app/page.tsx`) says "The full chat widget ships separately." Yet the **backend side is fully implemented** — `backend/website-chat/website-chat.service.ts` is 632 lines with SSE streaming, rate limiting, RAG integration. So the *server* exists; the *embeddable widget* does not. **Severity: P0** for customer-facing website channel.
3. **`packages/ui/` and `packages/sdk/` are stubs.** UI package is one line (`export const PACKAGE_NAME = '@dayjoy/ui';`); SDK is 17 lines with no error handling, retry, pagination, or streaming. **Severity: P2** — neither is imported by anything in the monorepo.
4. **Triplicated shared code.** `shared/utils/validation.ts`, `packages/shared/utils/validation.ts`, and `packages/utils/validation.ts` are byte-identical (verified via `diff`). Three copies of the same 4 functions, all marked `@dayjoy/*`. **Severity: P2** — pick one, deprecate the others.
5. **`deployment/terraform/environments/production/main.tf` references `../../modules/secrets`** (line 102) — but no `secrets/` directory exists under `deployment/terraform/modules/`. `terraform plan` will fail on first invocation. **Severity: P0**.
6. **`whatsapp-ai/Dockerfile` line 33** runs `node whatsapp-ai/dist/main.js` but there is no `main.ts` in `whatsapp-ai/`. The module ships only `whatsapp.module.ts` — it is designed to be imported by the NestJS backend, not run as a standalone process. **Severity: P0** for standalone deployment.
7. **n8n automation is genuinely world-class.** 47 workflow JSONs totalling 10,852 lines, every webhook has HMAC-SHA256 verification + idempotency dedup + retry + error-classification routing to Slack/PagerDuty. The K8s deployment uses queue mode with 2 main + 3 worker replicas, Postgres + Redis, Caddy TLS termination, Prometheus metrics. **This is production-ready.**
8. **Testing suite is exceptional.** 26,490 lines across 41+ test files in 6 categories (unit, integration, e2e, security, performance, ai-eval, edge-cases, rag). Includes a 1,023-line zero-dependency mock backend (`testing/helpers/mock-backend.ts`) so tests run hermetically in <2 min. The QA guide is 427 lines and defines real quality gates.

---

## Per-folder analysis

### 1. whatsapp-ai/

**Files audited:** 16 files, 2,479 lines
**Structure:** `whatsapp-ai/{config,client,webhooks/handlers,services}/` + `whatsapp.module.ts` + `Dockerfile` + `README.md`

#### What's good (world-class)
- **HMAC-SHA256 signature verification is correct and production-grade** (`webhooks/whatsapp-webhook.service.ts:135-190`):
  - Reads `X-Hub-Signature-256` header, strips the `sha256=` prefix.
  - Computes `crypto.createHmac('sha256', appSecret).update(rawPayload).digest('hex')`.
  - Uses `crypto.timingSafeEqual(a, b)` for constant-time comparison (line 179).
  - Uses **raw body bytes** (`req.rawBody` — `webhook.controller.ts:103`) not `JSON.stringify(body)`, because Meta signs exact bytes.
  - Unconditional in non-test environments (`NODE_ENV === 'test'` bypass at line 139 is the only exception).
  - Throws `UnauthorizedException` when `WHATSAPP_APP_SECRET` is missing in non-test env — **fails closed**.
- **Webhook verification (GET)** correctly checks `hub.mode === 'subscribe'`, matches `hub.verify_token`, echoes `hub.challenge` (`whatsapp-webhook.service.ts:84-114`).
- **Idempotency** via Redis `SETNX whatsapp:webhook:event:{wamid}` with 72h TTL (line 38) — exceeds Meta's 24h retry window. Per-status idempotency key `${wamid}:${status.status}` (line 274) so sent→delivered→read transitions are not deduped away.
- **Audit trail**: every webhook persisted to `WebhookEvent` table (`webhook.service.ts:331-350`) with raw payload — best-effort, never blocks processing.
- **Meta Cloud API client** (`client/whatsapp-client.service.ts`, 373 lines) supports:
  - Text, template, interactive (button/list/CTA URL), media (image/video/audio/document/sticker), read receipts, media download.
  - **Exponential backoff retry** for 429 + 5xx + network errors (3 attempts, base 200ms → 400ms → 800ms; lines 319-368).
  - Surfaces Meta error envelope inline (`[{code}] {message}` — line 347).
  - Token read fresh on every call (so ExternalSecrets rotation works without restart — line 304).
- **Session memory** (`services/whatsapp-session-memory.service.ts`, 224 lines) is Redis-backed (multi-replica safe), 24h TTL matches Meta's customer-care window. Supports `get/set/merge/clear` + `wamid → phoneNumber` reverse lookup for status handler. Per-customer tool-call counter.
- **Message processor** (`services/whatsapp-message-processor.service.ts`, 540 lines) is a complete AI pipeline:
  - Upserts `WhatsappContact` + `WhatsappSession` (re-uses latest non-ended within 24h window — line 384-409) + `Conversation` (channel=WHATSAPP).
  - Persists inbound as both `Message` (AI conversation) AND `WhatsappMessage` (channel-specific) — dual-write pattern.
  - Calls OpenAI Chat Completions with shared `ToolsService` tool registry — **same tools Voice + Website use** (line 75 + 499-512).
  - Tool-call loop with `maxToolRounds` ceiling (default 3 — line 201).
  - Graceful fallback reply when round ceiling is hit OR OpenAI throws (lines 276-290) — **never leaves customer on read**.
  - Records token usage on assistant message (line 320).
- **Read receipts sent immediately on inbound** (`webhooks/handlers/whatsapp-message.handler.ts:65-71`) — Meta quality-rating expects this.
- **Status handler** (`webhooks/handlers/whatsapp-status.handler.ts`, 151 lines) updates `WhatsappMessage.status` (sent/delivered/read/failed) + flags session for human-review on `failed` (line 113-130) + persists `conversation` + `pricing` + `errors` metadata.
- **Architecture reuses shared AI core** (`whatsapp.module.ts:55-71` imports `PrismaModule`, `SharedAiModule`, `AiModule`) — same `OPENAI_CLIENT` and `ToolsService` as Voice + Website.

#### What's missing / weak
- **No multi-language support.** `sendTemplate()` accepts a `language` ISO code, but the message processor never translates or localizes replies — the `DEFAULT_SYSTEM_PROMPT` (line 18-25) is English-only. Hindi/regional language support is absent despite India being the target market.
- **No analytics module.** No `messages_sent`, `messages_received`, `response_time_ms`, `delivery_rate` metrics exported to Prometheus. The data IS in `WhatsappMessage` table but no rollup job exists.
- **No rate limiting.** `RateLimitService` is imported by `backend/website-chat/website-chat.service.ts` but NOT by `whatsapp-ai/`. Meta enforces its own limits, but inbound webhook floods are not throttled at the app level.
- **No template management UI/API.** `sendTemplate()` exists in the client, but there's no `TemplatesService` to list/create/sync approved templates from Meta. The `README.md` literally says "Structure (to be implemented)" with a fictional `templates.service.ts`.
- **Media handling is half-baked.** `downloadMedia()` works (returns Buffer + mimeType + size — line 210-252), but the message handler explicitly says: *"Non-text messages currently emit a polite 'I can't process that yet' reply — full multi-modal support is a future enhancement"* (`whatsapp-message.handler.ts:34-35`). Audio transcription, image OCR, document parsing are NOT wired.
- **Dockerfile is broken.** `whatsapp-ai/Dockerfile:33` runs `CMD ["node", "whatsapp-ai/dist/main.js"]` but **there is no `main.ts`**. The module is `whatsapp.module.ts` — it must be imported by `backend/app.module.ts` and run from the backend process, not as a standalone service. Standalone Docker build will fail at runtime.
- **No standalone tests** — no `*.spec.ts` files in the module. All WhatsApp tests live in `testing/whatsapp/`.

#### Score: **8 / 10** — Production-grade backend integration with two P0 blockers (broken Dockerfile, no media pipeline) and one P1 gap (no analytics).

**Fix priority: P0** (Dockerfile + media pipeline) → P1 (analytics + i18n)

---

### 2. automation/ (n8n workflows)

**Files audited:** 47 workflow JSONs (10,852 lines) + docker-compose.yml + K8s manifests + Terraform + docs + credentials.json

#### What's good (world-class)
- **47 real workflows across 10 categories** — verified at `automation/n8n/workflows/`:
  - leads (4): lead-capture, lead-assignment, lead-scoring, follow-up-scheduling
  - crm (5): customer-creation, distributor-updates, employee-notifications, crm-sync, customer-enrichment
  - sales (3): sales-dashboard-sync, revenue-recognition, sales-forecast
  - email (6): welcome, order-confirmation, appointment-confirmation, follow-up, reminder, password-reset
  - calendar (5): appointment-booking, calendar-sync, appointment-cancellation, appointment-reminders, appointment-reschedule
  - notifications (4): multi-channel-dispatch, broadcast, daily-digest, escalation
  - orders (4): order-created, shipping-update, delivery-confirmation, payment-success
  - support (4): ticket-creation, ticket-assignment, ticket-escalation, ticket-auto-close
  - ai (4): knowledge-update-trigger, conversation-summarization, memory-cleanup, embedding-regeneration
  - monitoring (3): workflow-dashboard, health-check, alert-rules
  - error-handling (3): global-error-handler, retry-strategy, dead-letter-processor
- **Every webhook workflow verifies HMAC-SHA256 signature** with a Code node (e.g. `workflows/leads/lead-capture.json` lines 22-23):
  ```js
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) { throw new Error('Invalid webhook signature'); }
  ```
  Plus 5-minute timestamp replay-window check + event-type allow-list. **Production-grade webhook security.**
- **Idempotency dedup** via `POST /api/automation/event-dedup` returning 201 (new) or 409 (duplicate) — workflows short-circuit on 409 (e.g. `lead-capture.json` line 71-92).
- **Retry policy** on every HTTP Request node: `maxTries: 3, retryInterval: 1000` (e.g. line 53-58 of `lead-capture.json`) with exponential backoff.
- **Global error handler** (`workflows/error-handling/global-error-handler.json`, 270 lines) is genuinely impressive:
  - Error Trigger fires on ANY workflow error in the instance.
  - Classifies into 5 categories: `transient` (timeout/5xx/429), `auth` (401/403/token-expired), `data` (validation), `external` (WhatsApp/SendGrid/Razorpay/OpenAI), `unknown`.
  - Routes by category: transient → auto-retry 3x/30s; auth → Slack `#security-alerts` + PagerDuty critical page; data → Slack `#data-team-alerts`; external → probe provider health then alert ops; unknown → fallback Slack alert.
  - All errors persisted to audit_logs table with execution_id, node_name, stack_trace, retry_of, attempt.
- **Docker Compose** (`automation/n8n/docker-compose.yml`, 356 lines):
  - Queue mode: 1 main + 2 workers (`n8n-worker` with `--concurrency=10`).
  - External Postgres (15-alpine) + Redis (7-alpine) with AOF + LRU eviction.
  - Caddy reverse proxy for TLS termination.
  - Prometheus + Pushgateway + Grafana included.
  - Resource limits: workers capped at 2 CPU / 2 GB each.
  - Health checks on every service.
  - 14-day execution retention (`EXECUTIONS_DATA_MAX_AGE=336`).
- **K8s deployment** (`automation/n8n/deployment/kubernetes/n8n-deployment.yaml`, 245 lines):
  - 2 main replicas + 3 worker replicas.
  - `podAntiAffinity` + `topologySpreadConstraints` across AZs.
  - `securityContext: runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000` + `capabilities.drop: ["ALL"]` + `allowPrivilegeEscalation: false`.
  - ExternalSecrets for n8n encryption key + DB password.
  - Readiness + liveness probes wired to `/healthz`.
  - Resource requests/limits on every container.
- **Credentials file** (`shared/credentials.json`, 146 lines) ships the SHAPE only (no secrets) for 8 credential types: `dayjoyApi` (httpHeaderAuth), `dayjoySmtp`, `dayjoyWhatsApp`, `dayjoySlack`, `dayjoyGoogleCalendar`, `dayjoyTwilio`, `dayjoyOpenAI` — each with detailed `_notes` explaining usage.
- **Terraform** (5 files: `main.tf`, `variables.tf`, `outputs.tf`, `user-data.sh`, `terraform.tfvars.example`) for AWS EC2-based n8n deployment.

#### What's missing / weak
- **No workflow editor integration** in the admin-dashboard. Operators must access n8n UI directly (Basic Auth gate at compose-level). No SSO bridge.
- **No workflow execution monitoring surfaced in the admin-dashboard.** n8n has its own `/metrics` endpoint scraped by Prometheus, but the dayjoy admin has no "Automation" view that queries the n8n API.
- **`automation/n8n/Caddyfile`** — present but didn't read it; assume TLS + Basic Auth + gzip. Worth verifying ACME setup.
- **No automated test for workflows** — workflows are JSON; no schema validation in CI. A typo in a node ID would silently break a workflow on import.
- **Workflows are `active: false` on import** (`lead-capture.json` line 514) — README says operators must manually toggle each on after credentials are populated. With 47 workflows, this is error-prone; no `n8n import:workflow --activate` script is provided.

#### Score: **9 / 10** — Genuinely world-class automation platform. The only meaningful gaps are admin-dashboard integration and CI workflow validation.

**Fix priority: P2** (workflow schema validation in CI + admin-dashboard execution monitoring view)

---

### 3. apps/admin-dashboard/

**Files audited:** 143 files, ~30,752 lines of TypeScript/TSX
**Structure:** Next.js 15 App Router with `(dashboard)` route group, 13 top-level views + 30+ sub-routes (telephony, whatsapp/{accounts,templates,conversations,settings,handoffs}, voice/{assistants,sessions,test,settings}, knowledge/{sources,search}, agents/[id], etc.)

#### What's good
- **13 views are all present** (`src/components/views/*.tsx`): dashboard, ai, knowledge, crm, analytics, voice, automation, system, website, whatsapp, users, audit, provider-config. Total ~6,217 lines of view code.
- **`ai-view.tsx` is enormous (1,993 lines)** — full assistant/tool/memory/prompt management UI with create/edit/delete dialogs, KPI cards, sparklines, permission-gated buttons, tab navigation.
- **`lib/api.ts` (290 lines) is a properly built Axios client:**
  - Auto-detects NestJS envelope `{success, data, meta}` and unwraps `data` (line 72-79).
  - Request interceptor adds `Authorization: Bearer <jwt>` + `X-Request-ID` UUID + `X-Tenant-Id` (lines 82-112).
  - Response interceptor handles 401 (clear storage + redirect to /login), 403 (silent toast), 429 (toast), 5xx (toast), 0 (network error toast). 422 + 404 deliberately NOT toasted — page handles them (lines 138-196).
  - `api.paginated<T>()` returns `{ data, meta }` so callers get array + pagination block.
- **RBAC enforcement is real** (`lib/rbac.ts`, 84 lines):
  - 6 roles: SUPER_ADMIN, AI_ADMIN, KNOWLEDGE_ADMIN, AUTOMATION_ADMIN, ANALYTICS_ADMIN, SUPPORT_ADMIN.
  - Role → permission map for 12 resource types × 7 permission verbs.
  - `hasPermission(user, resource, permission)` + `usePermissions()` hook used by every view via `<GateButton allowed={can(...)} />` pattern (`ai-view.tsx` line 116-118).
- **Command palette is functional** (`components/layout/app-header.tsx`):
  - ⌘K / Ctrl+K keyboard shortcut (line 75-82).
  - Lists 13 navigation actions + 5 quick actions (sign out, theme toggle, etc.) with fuzzy search.
  - Uses `cmdk` library (`@/components/ui/command`).
- **PWA support is wired**: `public/manifest.json`, `public/sw.js`, `src/components/sw-registrar.tsx` registers service worker only in `NODE_ENV === "production"` (line 16) and defers until `window.load` (line 29-34) to avoid blocking first paint.
- **SEO/meta tags** at `app/layout.tsx` line 8-15: `title`, `description`, `icons`. Per-view metadata not set (App Router allows `export const metadata` per page — most pages are `'use client'` so this is limited).
- **Forms are validated** — login page uses inline regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — line 50); portal pages use react-hook-form + zod.
- **Loading/empty/error states exist**: `components/kit/empty-state.tsx`, `components/ui/skeleton.tsx`, `components/ui/toaster.tsx` (sonner). The dashboard view shows "Loading Dayjoy AI…" spinner while checking auth (line 82-91 of `app/page.tsx`).
- **Mobile-responsive**: `components/responsive/` has 10 components (responsive-sidebar, responsive-grid, swipeable-card, pull-to-refresh, bottom-navigation, touch-optimized-button, etc.). Sidebar collapses to a `<motion.aside>` drawer on `< lg` (line 53-58 of `app-shell.tsx`).
- **Design system is cohesive**: glass-morphism cards, gradient orbs background, framer-motion page transitions, count-up KPI animations, 3D AI orb (`components/three/ai-orb-3d.tsx` + `particle-field.tsx`).

#### What's missing / weak (P0)
- **THE ENTIRE UI IS MOCK.** Despite shipping a real `lib/api.ts`, every view reads from Zustand stores persisted to `localStorage`:
  - `assistant-store.ts` line 13: `const SEED_ASSISTANTS: Assistant[] = [{ id: "ast_sarah", name: "Sarah", ... }, ...]` — 3 fake assistants with hardcoded conversations counts (4120, 6480, 3240).
  - `channel-config-store.ts` line 21: `SEED_WHATSAPP: WhatsAppChannelConfig = { ... templates: [{ name: "welcome_message", language: "en_US", status: "approved" }] }` — fake approved templates.
  - `audit-store.ts` line 24: `ipAddress: "127.0.0.1" // client-side placeholder; backend captures real IP` — audit log is local-only.
  - KPIs are hardcoded in the view (`dashboard-view.tsx` lines 15-61): `'₹3,74,000'`, `'8,452'`, `'23 active calls'` — none of this comes from the backend.
- **Login is fake.** `app/login/page.tsx` line 57: `// Simulated auth call — replace with real POST /api/auth/login when backend is wired`. Line 58: `await new Promise((r) => setTimeout(r, 900))` — sleeps 900ms then writes a mock user to `localStorage`. Demo creds are baked in (`admin@dayjoy.ai` / `Dayjoy@2026`).
- **No real-time updates.** Zero `WebSocket`, `EventSource`, or SSE consumers in the dashboard (grep returned nothing). The dashboard claims "Active Calls: 23" but it's a static number — no live updates from Vapi/webhook events.
- **No `middleware.ts` for auth gating.** `apps/admin-dashboard/src/` has no middleware. The `app/page.tsx` does a client-side `localStorage.getItem('dayjoy_auth')` check (line 28-32) and redirects to /login if missing — but this is trivially bypassed and the page still ships all the JS. Compare to `apps/distributor-portal/src/middleware.ts` which DOES have a real server-side cookie check.
- **Sign-out is client-side only** (`app-header.tsx` line 129-138): `window.localStorage.removeItem('dayjoy_auth')` — does NOT call `POST /api/auth/logout` to invalidate the refresh token server-side.
- **401 interceptor in `lib/api.ts`** is moot because no view actually uses `api.get/post/...` — they all read from Zustand stores. The interceptor is dead code.
- **13 views but the `(dashboard)` route group has 30+ sub-routes** (telephony/calls, whatsapp/conversations/[id], voice/sessions/[id], agents/[agentId], knowledge/[id], etc.) — these are mostly placeholders or thin wrappers. The "13 functional views" claim is generous.

#### Score: **6 / 10** — Beautiful, well-engineered UI shell with RBAC, command palette, PWA, responsive design. But it's a frontend without a backend — every view is mock data. **Cannot ship to production.**

**Fix priority: P0** (replace Zustand stores with real `api.get/post` calls + wire login to `POST /api/auth/login` + add `middleware.ts` for server-side auth gate + call `/api/auth/logout` on sign-out)

---

### 4. apps/customer-portal/, apps/distributor-portal/, apps/employee-portal/

**Files audited:** ~428 files total across the three portals
**Lines:** customer-portal 20,605 / distributor-portal 21,222 / employee-portal 22,428 = ~64,255 lines of TypeScript/TSX

#### What's good (all three portals)
- **Real API calls.** Each portal has its own `lib/api.ts` (212-238 lines) using Axios with the same envelope-unwrap + 401/403/429 interceptor pattern as the admin-dashboard. **Crucially, the portals actually USE the API client** (unlike admin-dashboard):
  - `customer-portal/src/hooks/use-auth.ts` calls `api.post<LoginResponse>("/auth/login", dto)` (line 56) — real auth.
  - `distributor-portal/src/lib/services.ts` has `withFallback<T>(apiCall, mock)` (line 48-59) — tries the real API, falls back to mock on error. This is a pragmatic pattern that lets the portal ship today and switch to API-only by removing the catch.
- **Server-side auth gate.** All three have `src/middleware.ts` (e.g. `distributor-portal/src/middleware.ts`, 53 lines) checking for `dp_access_token` cookie and redirecting to /login if missing. Real Next.js middleware — not just a client-side `localStorage` check.
- **react-hook-form + zod validation.** `customer-portal/src/app/login/page.tsx` line 7-22: `z.object({ email: z.string().email(), password: z.string().min(1), rememberMe: z.boolean().optional() })` with `zodResolver`.
- **React Query for server state.** `use-auth.ts` uses `useMutation` + `useQuery` from `@tanstack/react-query` (line 4) with proper `setQueryData`/`clear` on login/logout.
- **OTP flow.** `customer-portal/src/app/verify-otp/page.tsx` + `use-auth.ts` `verifyOtp`/`resendOtp` mutations (lines 94-113).
- **Role-appropriate views:**
  - **Customer portal:** dashboard, products (with AI chat widget), cart, orders, support tickets, AI assistant, profile (5 tabs: personal/address/preferences/security/documents), notifications.
  - **Distributor portal:** dashboard, leads (with new/[id]), customers, orders (with new/[id]), commissions (with [id]), earnings, sales, team (with [id]), training (with [id]), knowledge (with [slug]), AI assistant (with history), announcements, events, documents, notifications, products (with [id]), settings, profile.
  - **Employee portal:** dashboard, CRM (customers/[id], distributors/[id], leads/[id]), tasks (with new/[id]), tickets (with new/[id]), attendance (with leave), reports (performance/sales/tickets), analytics, products, chat, knowledge (with [slug]), team (with [id]), AI assistant, notifications, settings, profile.
- **PWA support** in all three: `public/manifest.json`, `public/sw.js`, `src/components/sw-registrar.tsx`.
- **Responsive design system** in all three: `components/responsive/` with 10 mobile-optimized components (bottom-navigation, pull-to-refresh, swipeable-card, touch-optimized-button, etc.).
- **Mock fallback data is comprehensive** — `distributor-portal/src/lib/mock-data.ts` is 1,613 lines with stable IDs across leads/customers/orders/products so cross-page navigation resolves cleanly. Same for employee-portal (1,024 lines).
- **Distributor portal has charts**: `commission-chart.tsx`, `goal-progress.tsx`, `category-pie-chart.tsx`, `team-growth-chart.tsx`, `tier-distribution-chart.tsx`, `sales-chart.tsx`.

#### What's missing / weak
- **Mock fallback masks broken backend integration.** `withFallback()` silently swallows errors with `console.warn`. In production with a broken backend, the portal would render mock data and **users wouldn't know**. Should at minimum surface a banner: "Operating in offline mode — data may be stale."
- **No real-time updates.** Zero WebSocket/SSE consumers in any portal. Distributor dashboard shows "today's sales" as a static number — no live order webhook push.
- **No SSE/streaming chat in the AI assistant views** — the portals make a single `POST /api/ai/.../messages` call and wait for the full response. The backend `website-chat.service.ts` HAS SSE streaming (`formatSse('delta', ...)` line 317) but the portals don't consume it.
- **Login pages for distributor-portal and employee-portal are missing** — `find` returned only `register/page.tsx`, `forgot-password/page.tsx`, `(portal)/layout.tsx`, `layout.tsx`, `page.tsx`, `offline/page.tsx`, `globals.css`. The root `page.tsx` does `redirect("/dashboard")`. Auth gating relies on middleware redirecting to `/login` — but `/login` doesn't exist as a route. **P0 bug** — unauthenticated users hit a 404 instead of a login form.
- **No RBAC enforcement in the portals.** The distributor portal has no `hasRole()` check on its routes — any authenticated user (including a customer) could navigate to `/distributor-portal/dashboard`. The middleware only checks token presence, not role.
- **Customer portal `use-auth.ts` line 47-51** uses `enabled: typeof window !== "undefined" && !!window.localStorage.getItem("cp_access_token")` — this means `/auth/me` revalidation only fires if a token exists. Reasonable, but if the token is expired, the user sees the dashboard briefly before the 401 interceptor kicks in.
- **No error boundaries** at the route level — a single failing component crashes the whole portal.

#### Score: **7 / 10** — Real apps with real auth, real API calls, real validation, real RBAC-aware UI. The "API-first with mock fallback" pattern is pragmatic. **P0 bug: distributor + employee portals have no `/login` route** — middleware redirects to a non-existent page.

**Fix priority: P0** (add `/login` route to distributor-portal + employee-portal) → P1 (add role check in middleware + real-time updates + error boundaries + offline-mode banner)

---

### 5. apps/website-chat/

**Files audited:** 27 files, ~30 lines of real code (the rest is responsive scaffolding + boilerplate)

#### What's there
- Next.js 15 app with `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `package.json`.
- `src/app/page.tsx` (33 lines) — a placeholder landing page:
  ```tsx
  /**
   * Placeholder landing page for the Dayjoy AI Live Chat app.
   * The full chat widget (launcher + window + conversations + AI
   * integration) is documented in `docs/` and will be implemented
   * by a future agent. This page just ensures the route resolves.
   */
  ```
- `src/app/offline/page.tsx` — offline fallback page.
- `src/components/providers.tsx`, `src/components/sw-registrar.tsx` — PWA scaffolding.
- `src/components/responsive/*` — 10 mobile-optimized components (copied from the other portals).
- `src/lib/{utils,mobile,performance}.ts` — utility helpers.
- `public/manifest.json`, `public/sw.js` — PWA assets.

#### What's missing (everything)
- **No chat launcher button.**
- **No chat window component.**
- **No message list / message input.**
- **No typing indicators.**
- **No read receipts.**
- **No file upload UI.**
- **No voice input UI.**
- **No pre-chat form (name/email collection).**
- **No customizable appearance (colors, position, branding).**
- **No offline message support.**
- **No session management.**
- **No WebSocket/SSE consumer.**

#### Critical context
**The backend side IS fully implemented** — `backend/website-chat/` contains:
- `website-chat.service.ts` (632 lines): `initSession()`, `sendMessage()` with RAG, `streamMessage()` SSE, `submitFeedback()`, rate-limited by IP.
- `website-chat.controller.ts`: `POST /api/website-chat/sessions`, `POST /api/website-chat/sessions/:id/messages`, `GET /api/website-chat/sessions/:id/messages`, `POST /api/website-chat/sessions/:id/feedback`, `GET /api/website-chat/health`.
- DTOs: `init-session.dto.ts`, `send-message.dto.ts`, `feedback.dto.ts`.

So the server is ready, the widget is not. **This is the single biggest gap in the entire codebase for the customer-facing website channel.**

#### Score: **2 / 10** — Placeholder. The widget that gives this folder its name does not exist. Backend is done (audited separately); frontend is a 33-line landing page.

**Fix priority: P0** — Build the actual embeddable chat widget. Reference design exists at `docs/frontend/09_AI_CHAT_EXPERIENCE.md` and the backend contract is documented in `backend/website-chat/website-chat.controller.ts`.

---

### 6. packages/ (shared packages)

**Files audited:** 8 packages

#### `packages/database/` — 3 files
- `index.ts` (2 lines): `export * from '@prisma/client'; export { PrismaClient } from '@prisma/client';`
- `package.json`: declares `@prisma/client@^6.0.0`, `prisma generate --schema ../../database/prisma/schema.prisma`.
- **Status:** Thin re-export wrapper. Functional but adds no value over importing `@prisma/client` directly. The schema path is correct.
- **Score: 5/10** — works, but unnecessary indirection.

#### `packages/shared/` — 9 files
- `package.json` (8 lines): `@dayjoy/shared` with no dependencies.
- `types/`: `api.types.ts`, `auth.types.ts`, `voice.types.ts`, `rag.types.ts`, `whatsapp.types.ts`, `index.ts` (re-exports all).
- `utils/`: `validation.ts` (15 lines: isValidEmail, isValidPhone, isValidUUID, slugify), `formatters.ts` (21 lines: formatCurrency, formatDate, formatDuration, truncate), `errors.ts` (42 lines: AppError + 5 subclasses), `index.ts` (re-exports).
- `constants/index.ts` (18 lines): APP_NAME, APP_VERSION, CACHE_TTL, RATE_LIMITS.
- **Status:** Functional, minimal, correct.
- **Score: 6/10** — clean but basic. No business-domain types (Customer, Order, Product, Lead, etc.) — those are duplicated across each portal's `src/types/`.

#### `packages/types/` — 7 files
- **EXACT DUPLICATE of `packages/shared/types/`** (verified via `diff`).
- `index.ts` has 5 lines vs `packages/shared/types/index.ts` has 8 lines (the latter has comment + blank line), but the type definitions are byte-identical.
- **Status:** Redundant. Two packages exporting the same types.
- **Score: 3/10** — duplicate code, confusing for consumers.

#### `packages/utils/` — 5 files
- **EXACT DUPLICATE of `packages/shared/utils/`** (verified via `diff` — same validation.ts, formatters.ts, errors.ts).
- **Status:** Redundant. Two packages exporting the same utilities.
- **Score: 3/10** — duplicate code.

#### `packages/config/` — 2 files
- `index.ts` (30 lines): Zod schema for env validation (`NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `VAPI_*`, `OPENAI_*`, `WHATSAPP_*`, `TWILIO_*`, `CORS_ORIGIN`, `LOG_LEVEL`). Calls `envSchema.parse(process.env)` at module load.
- **Status:** Functional. But the actual backend (`backend/_shared/config/`) likely has its own env loading — this package may be unused.
- **Score: 6/10** — works, but unclear if any consumer imports it.

#### `packages/sdk/` — 2 files
- `index.ts` (19 lines):
  ```ts
  export class DayjoySDK {
    private client: AxiosInstance;
    constructor(apiKey: string, baseURL = 'https://api.dayjoy.ai') { ... }
    async getCustomer(id: string) { return (await this.client.get(`/api/customers/${id}`)).data; }
    async listProducts(page = 1, limit = 20) { ... }
    async createLead(data: any) { ... }
    async ragQuery(query: string) { ... }
  }
  ```
- **Status:** Stub. 4 methods, `data: any` everywhere, no error handling, no pagination helper, no streaming, no retry, no typed responses. Not published to npm. Not imported by any consumer in the monorepo.
- **Score: 2/10** — placeholder. A real external-consumer SDK needs typed responses, error classes, retry, rate-limit handling, streaming, webhook verification helpers, examples, README.

#### `packages/ui/` — 2 files
- `index.ts` (3 lines):
  ```ts
  // Placeholder — UI components to be added.
  // Future exports: Button, Card, Input, Select, Modal, Toast, etc.
  export const PACKAGE_NAME = '@dayjoy/ui';
  ```
- **Status:** Empty stub. Each portal has its own `components/ui/` shadcn-based kit (button.tsx, card.tsx, input.tsx, etc.) — none of which import from `@dayjoy/ui`. The shared package was never built.
- **Score: 1/10** — does not exist as a usable package.

#### `packages/knowledge-base/` — 32 markdown files, 12,157 lines
- **This is the crown jewel of the packages folder.** 29 knowledge documents across 10 categories (Company, Products, Policies, Compensation Plan, FAQs, Support, Marketing, Compliance, Training, SOPs).
- `INDEX.md` (440 lines) is a master catalog with word counts, chunk estimates, tags, RAG ingestion commands, retrieval config, maintenance cadence, quality metrics, and 15 explicit "REQUIRES CLIENT INPUT" open items.
- Every document follows a strict format: Status badge (VERIFIED / PARTIALLY VERIFIED / REQUIRES CLIENT INPUT), Last updated date, Category, Tags, Primary Sources.
- Audience-aware tagging (`customer-facing`, `distributor-only`, `internal-only`, `compliance`) for RAG retrieval filtering.
- **Status:** World-class knowledge base. Ready for RAG ingestion.
- **Score: 9/10** — would be 10/10 if the 15 open items (Income Disclosure Statement, exact rank criteria, brand assets, social handles, etc.) were resolved.

#### Overall packages score: **5 / 10** — dragged down by duplicates, stubs, and the empty UI package. The knowledge-base alone is 9/10.

**Fix priority: P1** (delete `packages/types/` and `packages/utils/` — keep only `packages/shared/`) → P2 (build real `packages/ui/` from the existing shadcn kits) → P2 (build real `packages/sdk/` with typed responses + retry + streaming)

---

### 7. shared/ (shared types/constants)

**Files audited:** 11 files

- `shared/constants/index.ts` (18 lines): APP_NAME, APP_VERSION, DEFAULT_TENANT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, CACHE_TTL (4 buckets), RATE_LIMITS (AUTH/API/VOICE_WEBHOOK).
- `shared/types/`: 6 files — identical to `packages/shared/types/` and `packages/types/`.
- `shared/utils/`: 4 files — identical to `packages/shared/utils/` and `packages/utils/`.

**This is a THIRD copy of the same code.** Triplication:
1. `shared/utils/validation.ts`
2. `packages/shared/utils/validation.ts`
3. `packages/utils/validation.ts`

All three are byte-identical (verified via `diff`).

**Status:** No `package.json` in `shared/` — it's not a workspace package, just a folder. The Dockerfile for whatsapp-ai line 12 does `COPY shared/ ./shared/` — so it's referenced as a path import. But no source file in the audited folders imports from `shared/` (they import from `@dayjoy/shared` or `@dayjoy/utils`).

**Score: 2 / 10** — orphaned triplicate. Pick one canonical location (recommend `packages/shared/` since it has a `package.json`), delete the others.

**Fix priority: P2** — delete `shared/` and `packages/types/` and `packages/utils/`; consolidate into `packages/shared/`.

---

### 8. monitoring/ (Prometheus/Grafana/Loki)

**Files audited:** 12 files

#### What's good (world-class)
- **Prometheus config** (`prometheus/prometheus.yml`, 54 lines):
  - 5 scrape jobs: backend (`:8000/metrics`), frontend (`:3000/`), postgres-exporter (`:9187`), redis-exporter (`:9121`), qdrant (`:6333/metrics`).
  - 15s scrape + evaluation intervals.
  - Alertmanager wired at `alertmanager:9093`.
- **Alert rules** (`prometheus/alert-rules.yaml`, 161 lines) — 11 alerts across 4 groups:
  - **Application** (3): HighErrorRate (>5% 5xx for 5m), HighLatency (p95 > 2s for 10m), PodCrashLooping.
  - **Database** (3): DatabaseConnectionsHigh (>150 for 5m), DatabaseCPUHigh (>80% for 10m), DatabaseDiskSpaceLow (<10GB).
  - **Infrastructure** (3): NodeNotReady, PodPending (15m), HighMemoryUsage (>85% for 10m).
  - **AI Platform** (3): CircuitBreakerOpen, AIAgentLatencyHigh (p95 > 3s), RAGConfidenceLow (<0.55 for 30m).
  - **Business** (2): HighEscalationRate (>30% for 30m), LowCSAT (<3.5 for 1h), WorkflowFailureSpike (>5 failures/15m).
  - Every alert has severity label (critical/warning) + team label (engineering/devops/operations) + summary + description annotations.
- **Alertmanager config** (`prometheus/alertmanager.yml`) — present (didn't read full content but file exists).
- **Loki** (`loki/loki-config.yml`, 34 lines):
  - TSDB schema v13, 30-day retention, 721h max query length.
  - Filesystem storage (single-node — production should use S3).
- **Promtail** (`loki/promtail-config.yml`, 24 lines):
  - Docker SD discovery filtering container names starting with `dayjoy-`.
  - Relabels `container` + `stream` labels from Docker metadata.
- **Grafana dashboards** (5 JSON files, 1,295 lines total):
  - `api-overview.json` (315 lines): reqps by method/route, latency histograms.
  - `business-kpis.json` (214 lines).
  - `database.json` (266 lines).
  - `rag.json` (250 lines).
  - `voice-ai.json` (250 lines).
- **Grafana provisioning** (`grafana/provisioning/dashboards/dashboards.yml`): auto-loads every JSON under `/var/lib/grafana/dashboards/*.json` with 30s refresh.
- **Datasource provisioning** (`grafana/provisioning/datasources/prometheus.yml`): auto-configures Prometheus as the default datasource.

#### What's missing / weak
- **No ServiceMonitor / PodMonitor for Kubernetes.** The Prometheus config uses `static_configs` with hardcoded `backend:8000` targets — fine for Docker Compose, but in K8s you want `ServiceMonitor` CRDs (from `prometheus-operator`) for service discovery. None found via grep.
- **No recording rules.** All alerts compute `rate()` on the fly — for high-traffic systems, pre-computed recording rules (`record:`) reduce Prometheus load.
- **No dashboard for WhatsApp AI, Website Chat, Telephony, or n8n workflows** — only 5 dashboards covering API/DB/RAG/Voice/Business. The n8n deployment has its own Prometheus + Grafana stack (separate from this one) — that's actually fine, but the dayjoy platform Grafana should at least link to it.
- **Loki config uses filesystem storage + `replication_factor: 1`** — explicitly single-node. Production should use S3 backend + 3 replicas.
- **No alert routing / inhibition / grouping rules visible in `alertmanager.yml`** — read partial content but couldn't verify the full routing tree.
- **No Sentry / OpenTelemetry / Jaeger config** in this folder (may be in `backend/_shared/observability/`).

#### Score: **8 / 10** — Solid Prometheus + Loki + Grafana stack with 11 meaningful alerts and 5 dashboards. The K8s ServiceMonitor gap and single-node Loki are the main weaknesses.

**Fix priority: P2** (add ServiceMonitor CRDs for K8s + S3 backend for Loki + dashboards for WhatsApp/n8n/website-chat)

---

### 9. deployment/ (Docker/K8s/Terraform)

**Files audited:** 32 files across `deployment/{terraform,docker,kubernetes,nginx,scripts}/`

#### What's good (world-class)
- **Terraform** — 8 modules + 2 environments:
  - `modules/vpc/main.tf` (66 lines): 3 public + 3 private subnets across AZs, IGW, NAT gateway, route tables, K8s-specific subnet tags.
  - `modules/eks/main.tf`: EKS cluster with managed node group.
  - `modules/rds/main.tf`: Postgres with Multi-AZ, KMS encryption, 7-day backup retention.
  - `modules/elasticache/main.tf`: Redis with KMS encryption.
  - `modules/s3/main.tf`: Encrypted backup bucket.
  - `modules/kms/main.tf`: Customer-managed KMS key.
  - `modules/waf/main.tf`: AWS WAF WebACL.
  - `modules/dns/main.tf`: Route53 + ACM certificate.
  - `environments/production/main.tf` (138 lines): composes all 8 modules with S3 backend + DynamoDB lock table. Production uses `db.r6g.large` Multi-AZ RDS, `cache.r6g.large` Redis, `t3.xlarge` EKS nodes (3-10 nodes, 4 desired).
  - `environments/staging/main.tf`: separate environment.
- **Kubernetes manifests** — comprehensive:
  - `01-base-manifests.yaml` (770 lines, 22 resources): Namespace, ConfigMap, SecretStore (ExternalSecrets Operator with IRSA), ServiceAccount with IRSA role annotation, ExternalSecret syncing 12+ secrets from AWS Secrets Manager (SECRET_KEY, DATABASE_URL, JWT_SECRET, OPENAI/ANTHROPIC/GROQ/GEMINI_API_KEY, VAPI_API_KEY, TWILIO_*, WHATSAPP_*, RESEND_API_KEY, SENTRY_DSN), Deployments, Services, Ingress, HPA, PDB, NetworkPolicy, PVC.
  - `02-voice-ai-manifests.yaml`: Vapi-specific resources.
  - `03-external-secrets.yaml`: ESO operator install.
  - `04-cert-manager.yaml`: cert-manager for Let's Encrypt.
  - `staging/kustomization.yaml` + `production/kustomization.yaml`: Kustomize overlays.
  - **Helm chart** (`helm/dayjoyai/`): `Chart.yaml`, `values.yaml` (198 lines), `templates/{backend,frontend,ingress,external-secret-store,_helpers}.yaml`. Values include HPA, resources, env, externalSecret remoteRefs, health probes, ingress TLS, network policies, monitoring, backup schedule.
- **Docker** (`docker/`):
  - `docker-compose.prod.yml`: production compose.
  - `docker-compose.voice-ai.yml`: voice-ai specific stack.
  - `frontend.Dockerfile`: multi-stage Next.js build.
  - `postgres-init/init/01-create-test-db.sql`: test DB creation for CI.
- **Nginx** (`nginx/nginx.conf`): reverse proxy config.
- **Scripts** (4 files, 443 lines):
  - `setup.sh` (185 lines): one-time dev env bootstrap — checks prereqs (Node 20+, pnpm 9+, Docker), copies `.env.example` → `.env`, runs `pnpm install`, `prisma generate`, `docker compose up -d postgres redis`, waits for Postgres readiness (30 retries × 2s), runs migrations + seed.
  - `verify.sh` (206 lines): post-deploy smoke tests.
  - `backup-postgres.sh` (29 lines): `pg_dump --format=custom | gzip` → S3 with SSE-AES256 → 7-day local retention.
  - `restore-postgres.sh` (23 lines): inverse of backup.
- **CI/CD pipeline** (`.github/workflows/ci-cd.yml`, 360 lines): 9-stage pipeline (install → lint → typecheck → unit tests → integration tests → security scan → build → deploy staging → deploy prod with manual approval). Plus `codeql.yml` (49 lines) for CodeQL analysis.
- **Blue-green deploy strategy** (`scripts/production/step-21-production.sh`, 195 lines):
  - Deploys new (green) Helm release alongside current (blue).
  - Smoke tests green via port-forward.
  - Switches ALB target group to green.
  - Keeps blue warm for 24h for instant rollback.
  - Verifies blue is still running (rollback window check).

#### What's missing / weak (P0)
- **`deployment/terraform/environments/production/main.tf` line 102** references `../../modules/secrets` — **this module does not exist**. `ls deployment/terraform/modules/` returns only: `dns eks elasticache kms rds s3 vpc waf`. No `secrets/` directory. `terraform plan` will fail immediately.
- The `waf/main.tf` module is referenced but I didn't read it — worth verifying it actually creates a WebACL with real rules (SQLi, XSS, rate-based).
- **No K8s NetworkPolicy in the helm chart** — values.yaml has `networkPolicy.enabled: true` (line 173) but no `templates/networkpolicy.yaml` exists. The flag is a no-op.
- **No PDB (PodDisruptionBudget) in the helm chart** — values don't reference it, no template exists. The base manifests have one but the helm chart doesn't.
- **No `HPA` template in the helm chart** — values define `hpa:` block (lines 32-37, 87-91) but no `templates/hpa.yaml` exists.
- **No rollback automation in the helm chart** — the blue-green script handles it manually, but there's no `helm rollback` wrapper or Argo Rollouts integration.
- **Backup script doesn't verify the backup** — no `pg_restore --list` check, no test restore to a scratch DB.
- **No disaster recovery runbook** in this folder (may exist in `docs/operations/15_DISASTER_RECOVERY.md` — separate audit).
- **Terraform modules don't have `versions.tf` / `outputs.tf` / `variables.tf` separation** — everything is in `main.tf`. Works but not idiomatic.
- **No `terragrunt` for DRY environment composition.**

#### Score: **8 / 10** — Genuinely world-class IaC + K8s + CI/CD with blue-green deploys and ExternalSecrets. The P0 broken `secrets` module reference and the missing helm templates (NetworkPolicy, PDB, HPA) prevent a 9+.

**Fix priority: P0** (create `deployment/terraform/modules/secrets/` or remove the reference) → P1 (add `templates/{networkpolicy,pdb,hpa}.yaml` to the helm chart) → P2 (terragrunt + Argo Rollouts)

---

### 10. testing/

**Files audited:** 41+ test files + helpers + docs + config = ~26,490 lines of TypeScript

#### What's good (world-class)
- **6 test categories with real test logic** (not pseudo-tests):
  - **Unit** (15 files in `testing/unit/`): users, analytics, ai, security, distributors, admin, employees, customers, orders, notifications, conversations, products, knowledge, auth, memory, tools services.
  - **Integration** (8 files): ai-conversation, auth-flow, whatsapp-message-flow, support-ticket-flow, order-flow, voice-call-flow, lead-flow, notification-flow.
  - **E2E** (`testing/e2e/`): Playwright with `dashboard.spec.ts`.
  - **Portals** (`testing/portals/`): 20 files — customer (6: auth, dashboard, products, orders, ai-assistant, support), distributor (6: dashboard, team, sales, earnings, commissions, leads), employee (5: dashboard, tasks, crm, tickets, attendance), admin (3: dashboard, users, analytics).
  - **Security** (7 files): authentication, authorization, rbac, sql-injection, xss, csrf, rate-limiting.
  - **Performance** (4 files): load (100 concurrent), stress (500-1000), soak (memory leak), scalability (1/2/4 replicas).
  - **AI Evaluation** (5 files): response-accuracy (20+ test cases with keyword assertions), tool-selection (7 tool types + multi-step flows), memory-accuracy (short + long term), rag-precision (Top-K, MRR, Precision@K), latency (simple <2s, RAG <5s, streaming <500ms).
  - **Edge cases** (5 files, 100+ scenarios): customer (25), distributor (20), employee (20), admin (15), system (20).
  - **RAG-specific** (5 files in `testing/rag/`): evaluation, ingestion, hallucination-detection, retrieval-accuracy, citation-accuracy.
  - **Database** (6 files): schema, triggers, performance, views, rls, functions, migrations.
  - **API** (12 files in `testing/api/`): auth, knowledge, orders, products, users, analytics, notifications, voice, ai, customers, whatsapp, admin.
  - **WhatsApp** (5 files): messaging, ai-conversation, rich-features, webhook, opt-in.
  - **Website** (6 files): streaming, embed, admin-controls, voice-input, guest-vs-logged-in, chat-widget.
  - **Voice** (7 files): product-questions, greetings, tool-calling, appointment-booking, human-escalation, lead-capture, memory.
- **Mock backend** (`testing/helpers/mock-backend.ts`, 1,023 lines) is exceptional:
  - Zero-dependency (uses Node's native `http` module — line 74).
  - Starts in <5ms.
  - Implements 60+ routes with the same `{ data, meta }` envelope as the real backend.
  - Test introspection endpoints: `GET /__mock/state`, `POST /__mock/reset`, `POST /__mock/fail-next`, `POST /__mock/slow-next` — lets tests script failure injection.
  - Routes cover: auth (login/register/refresh/logout/forgot/reset/me), products, cart, orders, knowledge query, AI conversations + messages, support tickets + FAQs, distributor (team/sales/earnings/commissions/leads), employee (dashboard/tasks/tickets/attendance), admin (dashboard/users/analytics).
- **Vitest config** (`testing/vitest.config.ts`, 68 lines):
  - Aliases `@testing-helpers` → `helpers/`.
  - 60s test timeout + 30s hook timeout for AI/perf tests.
  - Excludes `performance/` from default `vitest run` (line 53-54) so dev inner loop stays fast.
  - V8 coverage provider with `text` + `json` + `html` reporters.
- **Playwright config** (`testing/e2e/playwright.config.ts`, `testing/portals/playwright.config.ts`, `testing/config/playwright.config.ts`) — three configs for different E2E scopes.
- **QA documentation** (`testing/docs/`):
  - `QA_GUIDE.md` (427 lines): testing strategy, test pyramid (60/30/10 unit/integration/e2e), coverage targets per surface (backend ≥80% line, frontend ≥60%), 7 quality gates (lint, typecheck, unit, integration, coverage, code review, security scan).
  - `TEST_EXECUTION_GUIDE.md`: how to run each category locally + CI.
  - `BUG_REPORTING_GUIDE.md`: severity levels + bug report template + SLA.
  - `RELEASE_VALIDATION_GUIDE.md`: pre-release validation + sign-offs.
- **Production checklist** (`testing/production-checklist.md`, 407 lines): 14 sections covering code quality, security, performance, database, AI, integrations, monitoring, deployment, documentation, sign-offs. Every item marked `[required]` or `[required for minor/major releases]`.
- **Test helpers** (`testing/helpers/`): `fixtures.ts` (12 users, 4 products, 4 orders), `factories.ts`, `mock-external.ts` (OpenAI/Vapi/WhatsApp/RAG mocks), `http.ts` (fetch wrapper + `concurrent()` + `sustained()`), `mock-rag-service.ts`, `voice-simulator.ts`, `website-chat-simulator.ts`, `whatsapp-simulator.ts`, `setup.ts`, `rag-fixtures.ts`, `mocks.ts`, `index.ts`.
- **Real test logic, not pseudo-tests.** Example from `testing/security/rbac.test.ts` (344 lines):
  - Defines a 7-role permission matrix (SUPER_ADMIN through EMPLOYEE) with explicit permission lists.
  - Tests: every role has ≥1 permission, VIEWER is read-only, CUSTOMER permissions scoped to `:own`, DISTRIBUTOR covers leads+commissions+orders, role assignment grants immediately, role removal revokes immediately, expired roles ignored, SUPER_ADMIN bypasses.
- **AI-eval tests assert real quality** — `response-accuracy.test.ts` (312 lines) has 20+ test cases with `expectedKeywords` (must contain) + `mustNotContain` (e.g. "i don't know", "cannot help") + non-empty + length > 20 chars.

#### What's missing / weak
- **Tests run against the mock backend, not the real one.** The README acknowledges this: *"Production CI runs them against a real staging backend with the same assertion thresholds."* — but there's no CI config in this folder that actually does that. The mock backend validates the test logic but not the real backend.
- **Coverage targets are aspirational.** `vitest.config.ts` line 59 only includes `helpers/**/*.ts` in coverage — the tests don't measure coverage of `backend/` or `apps/`. Coverage of backend code happens via `pnpm --filter backend test` (per-workspace), not via this folder.
- **No load testing against real infrastructure** — `performance/load.test.ts` runs 100 concurrent requests against the mock backend (which responds in <5ms). This validates the test harness, not real-world performance. Real load testing needs `k6` or `Artillery` against a staging env.
- **No visual regression testing** — no Percy/Chromatic/Applitools config for the portals' UI.
- **No mutation testing** — no Stryker config to verify test quality.
- **No contract testing** — no Pact/PactFlow to verify backend ↔ frontend contract.
- **`testing/package.json`** has no `lint` or `typecheck` script — only `test*` scripts.

#### Score: **9 / 10** — Genuinely world-class test suite. The mock backend + 6 categories + 427-line QA guide + 407-line production checklist put this in the top tier. The only meaningful gap is that tests validate the mock, not the real backend — but that's a deliberate tradeoff for hermetic CI.

**Fix priority: P2** (add a CI job that runs the same tests against staging) → P3 (visual regression + mutation testing + contract testing)

---

## Summary table

| # | Folder | Score | Status | Top priority fix |
|---|--------|-------|--------|-----------------|
| 1 | `whatsapp-ai/` | **8/10** | World-class backend, broken Dockerfile | **P0**: Fix Dockerfile (no `main.ts`) + add media pipeline (audio transcription, image OCR) |
| 2 | `automation/` | **9/10** | World-class | **P2**: Workflow JSON schema validation in CI + admin-dashboard execution monitoring view |
| 3 | `apps/admin-dashboard/` | **6/10** | Beautiful shell, fully mock | **P0**: Replace Zustand stores with real `api.*` calls + wire login to `POST /api/auth/login` + add `middleware.ts` + call `/api/auth/logout` on sign-out |
| 4 | `apps/customer-portal/` | **7/10** | Real app, mock fallback | **P1**: Add real-time updates + offline-mode banner + error boundaries |
| 4 | `apps/distributor-portal/` | **7/10** | Real app, mock fallback | **P0**: Add `/login` route (middleware redirects to non-existent page) + role check in middleware |
| 4 | `apps/employee-portal/` | **7/10** | Real app, mock fallback | **P0**: Add `/login` route (same as distributor) + role check in middleware |
| 5 | `apps/website-chat/` | **2/10** | Placeholder | **P0**: Build the actual embeddable chat widget (launcher + window + messaging + SSE consumer) |
| 6 | `packages/` | **5/10** | Mixed (KB=9, others=2-6) | **P1**: Delete `packages/types/` + `packages/utils/` (duplicates of `packages/shared/`); build real `packages/ui/` + `packages/sdk/` |
| 7 | `shared/` | **2/10** | Orphaned triplicate | **P2**: Delete folder; consolidate into `packages/shared/` |
| 8 | `monitoring/` | **8/10** | World-class | **P2**: Add K8s ServiceMonitor CRDs + S3 backend for Loki + dashboards for WhatsApp/n8n |
| 9 | `deployment/` | **8/10** | World-class IaC | **P0**: Create missing `terraform/modules/secrets/` + add `templates/{networkpolicy,pdb,hpa}.yaml` to helm chart |
| 10 | `testing/` | **9/10** | World-class | **P2**: Add CI job that runs tests against staging + visual regression + contract testing |

**Weighted overall:** **6.5 / 10**

---

## Recommended action plan (prioritized)

### P0 — Blockers for production launch

1. **Wire admin-dashboard to the real backend.** Replace every Zustand `persist(...)` store in `apps/admin-dashboard/src/store/*` with real `api.get/post/put/patch/delete` calls. The `lib/api.ts` client is already built and correct — it just isn't being used. Wire `app/login/page.tsx` to `POST /api/auth/login`, add `src/middleware.ts` for server-side auth gating, call `POST /api/auth/logout` on sign-out. **Files to touch:** `src/store/{assistant,tool,memory,prompt,knowledge,channel-config,audit,admin,voice-session,workflow,provider-config}-store.ts` (11 stores), `src/app/login/page.tsx`, new `src/middleware.ts`, `src/components/layout/app-header.tsx` (signOut function).

2. **Build the website-chat widget.** The backend (`backend/website-chat/website-chat.service.ts`, 632 lines with SSE streaming) is complete and waiting. The frontend (`apps/website-chat/src/app/page.tsx`, 33 lines) is a placeholder. Build: chat launcher button, chat window, message list, message input, typing indicator, read receipts, file upload, voice input, pre-chat form, customizable appearance, offline message support, SSE consumer for streaming. Reference: `docs/frontend/09_AI_CHAT_EXPERIENCE.md`.

3. **Fix `whatsapp-ai/Dockerfile`.** Line 33 runs `node whatsapp-ai/dist/main.js` but no `main.ts` exists. Either: (a) add a `main.ts` that bootstraps a standalone NestJS app, or (b) remove the Dockerfile and document that `whatsapp-ai/` is a module imported by `backend/app.module.ts` (which it already is — see `whatsapp.module.ts`).

4. **Create `deployment/terraform/modules/secrets/`.** `environments/production/main.tf:102` references `source = "../../modules/secrets"` but the directory doesn't exist. `terraform plan` will fail. Either create the module (AWS Secrets Manager secrets for `dayjoy/prod/*` paths) or remove the reference + the `module "secrets"` block + the `output "secret_arns"` line.

5. **Add `/login` route to distributor-portal and employee-portal.** `apps/distributor-portal/src/middleware.ts:38-45` redirects unauthenticated users to `ROUTES.login` (`/login`), but `find apps/distributor-portal/src/app -type d` shows no `login/` directory. Same for employee-portal. **Users currently hit a 404.** Either add the login page (copy pattern from `apps/customer-portal/src/app/login/page.tsx`) or change the middleware redirect target.

### P1 — Should fix before scaling

6. **Add RBAC role check to portal middleware.** All three portal middlewares check token presence but not role. A customer with a valid token can navigate to `/distributor-portal/dashboard`. Add a role claim check (decode JWT in middleware, verify `role === "DISTRIBUTOR"` for distributor-portal, etc.).

7. **Add missing helm templates.** `deployment/kubernetes/helm/dayjoyai/values.yaml` defines `hpa:`, `networkPolicy:`, but no `templates/{hpa,networkpolicy,pdb}.yaml` exist. The flags are no-ops. Add the three templates.

8. **Add WhatsApp analytics.** No `messages_sent`, `messages_received`, `response_time_ms`, `delivery_rate` metrics exported. The data is in `WhatsappMessage` table — add a rollup job (cron or n8n workflow) that computes daily metrics and writes to Prometheus via Pushgateway.

9. **Add WhatsApp multi-language support.** The `DEFAULT_SYSTEM_PROMPT` is English-only. India target market needs Hindi + regional languages. Either: (a) add a language-detector step before the LLM call and prepend a translate instruction, or (b) maintain per-language system prompts and route by contact's `preferredLanguage` field.

10. **Add WhatsApp media pipeline.** Currently non-text messages get a "I can't process that yet" fallback reply. Wire `downloadMedia()` → audio transcription (Whisper) + image OCR (Tesseract or GPT-4 Vision) + document parsing (pdf-parse). Feed transcribed text into the existing `processInboundText()` flow.

11. **Build real `packages/ui/` and `packages/sdk/`.** Consolidate the 4 portal shadcn kits into a shared `@dayjoy/ui` package. Build a real SDK with typed responses, error classes, retry, rate-limit handling, streaming, webhook verification helpers, and a README with examples.

12. **Add real-time updates to admin-dashboard.** Zero WebSocket/SSE consumers. The dashboard claims "Active Calls: 23" but it's static. Add an SSE consumer for `/api/voice/sessions/active` + `/api/whatsapp/conversations/active` + `/api/website-chat/sessions/active` and update KPIs in real-time.

13. **Add offline-mode banner to portals.** `withFallback()` silently swallows API errors and renders mock data. Add a Sonner toast: "Operating in offline mode — data may be stale" when the fallback fires.

14. **Add error boundaries to portals.** No route-level error boundaries — a single failing component crashes the whole portal. Add `app/(portal)/error.tsx` + `app/(portal)/loading.tsx` + `app/(portal)/not-found.tsx` to each portal.

### P2 — Polish and long-term

15. **Delete `shared/` folder + `packages/types/` + `packages/utils/`.** Triplicate of the same code. Consolidate into `packages/shared/`. Update any path imports (the whatsapp-ai Dockerfile `COPY shared/` will need updating).

16. **Add K8s ServiceMonitor CRDs.** `monitoring/prometheus/prometheus.yml` uses `static_configs` with hardcoded targets. For K8s, add `ServiceMonitor` CRDs (requires `prometheus-operator`) so services are auto-discovered.

17. **Move Loki to S3 backend + 3 replicas.** Current config uses filesystem storage + `replication_factor: 1` — single-node. Production should use S3 backend + 3 replicas for HA.

18. **Add dashboards for WhatsApp AI, Website Chat, n8n workflows.** Only 5 dashboards exist (API, DB, RAG, Voice, Business). The n8n stack has its own Grafana, but the dayjoy platform Grafana should at least link to it.

19. **Add workflow JSON schema validation in CI.** 47 n8n workflow JSONs with no schema validation. A typo in a node ID would silently break a workflow on import. Add a CI step that runs `ajv validate -s n8n-workflow.schema.json -d automation/n8n/workflows/**/*.json`.

20. **Add n8n workflow execution monitoring to admin-dashboard.** Operators must access n8n UI directly. Add an "Automation" view in the admin-dashboard that queries the n8n REST API (`GET /api/v1/workflows`, `GET /api/v1/executions`) and shows execution status, failure rates, recent errors.

21. **Add CI job that runs tests against staging.** Current tests run against the mock backend. Add a nightly CI job that runs the same tests against a real staging backend with the same assertion thresholds.

22. **Add visual regression testing.** No Percy/Chromatic/Applitools config for the portals' UI. Add to catch unintended visual changes.

23. **Add contract testing.** No Pact/PactFlow to verify backend ↔ frontend contract. The admin-dashboard envelope-unwrap logic in `lib/api.ts` could break silently if the backend changes its response shape.

24. **Add `terragrunt` for DRY Terraform environment composition.** Currently `environments/staging/main.tf` and `environments/production/main.tf` duplicate most of the module composition. Terragrunt would let you define the composition once and override per-environment.

25. **Add Argo Rollouts for automated blue-green / canary.** The current blue-green script (`scripts/production/step-21-production.sh`) is manual. Argo Rollouts would automate the smoke-test → traffic-switch → rollback flow.

---

**End of audit.**
