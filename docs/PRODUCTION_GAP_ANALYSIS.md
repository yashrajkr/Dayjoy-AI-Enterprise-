# Dayjoy AI Enterprise — Production Gap Analysis

**Audit type:** Independent, read-only, fresh-pass verification
**Auditor:** Principal Software Architect
**Scope:** `/home/z/my-project/build-zip/`
**Methodology:** Every claim below is verified by reading the actual source code, migrations, and configuration. No previous audit reports were trusted.

---

## Executive Summary

This audit independently verifies 40 features across architecture, AI, RAG, channels, business logic, portals, infrastructure, and testing. The platform is a sophisticated NestJS monorepo with substantial real engineering (auth, RBAC, multi-tenancy, webhooks, monitoring, CI/CD, K8s, Terraform), but the **AI/RAG integration claim is materially overstated** and the **admin dashboard is entirely mock**. Several database migrations will fail on a clean run, and three notification providers reference npm packages that are not installed.

- Total features audited: **40**
- Complete: **14**
- Partial: **13**
- Broken: **6**
- Missing: **3**
- Mocked: **3**
- Not verifiable: **1**
- P0 issues: **7**
- P1 issues: **11**
- P2 issues: **9**
- P3 issues: **6**

**Headline finding:** ConversationsService — the single entry point used by the in-app chat, the website chat (non-streaming), and the API console — does **not** call RetrievalService, does **not** call DocumentPermissionsService, does **not** consult an abstain policy (no such file exists in the repo), and does **not** pass tools to OpenAI. The "v11 fixes" referenced in prior audits do not appear in the actual code. The RAG pipeline exists as a parallel subsystem reachable only through `KnowledgeService.query()` / `POST /api/knowledge/query` and the `/api/rag/search` endpoints — it is **never invoked on the chat path**. This means the AI assistant answers without knowledge grounding on every channel except the Vapi voice path (which goes through Vapi's own assistant-creation flow on the Vapi cloud, not through this backend's ConversationsService).

The admin dashboard (the primary operations UI) is entirely mock: every view (Knowledge, AI, Voice, Automation, Users, Audit, Provider Config, WhatsApp, Website, CRM, Analytics, System) reads from Zustand stores persisted to `localStorage`. None of the admin views make a single HTTP call to the backend. The dashboard is a UX prototype, not a working operations console.

The database migration chain has two latent failures: migration 019 creates an HNSW index on `rag_chunks` (a table that only exists in `_archived/` migrations and is never created in the active chain), and migration 020 calls `ALTER TYPE memory_type ADD VALUE` against a `VARCHAR(50)` column (no such enum exists). A fresh `docker compose up postgres` will apply the init scripts in alphabetical order and fail on these two migrations.

---

## 1. Architecture Overview

The platform is a pnpm/NestJS monorepo at the root with these sibling packages, each with its own `.module.ts`:

```
build-zip/
├── backend/                 # NestJS root app — Auth, Users, Employees, Customers,
│                            #   Distributors, Products, Orders, Notifications,
│                            #   Knowledge, AI, Analytics, Admin, WebsiteChat
│                            #   + _shared/{config,database,security,common,
│                            #              ai,health,metrics,logging,api,testing}
├── rag/                     # RAG subsystem — Loaders, Ingestion, Chunking,
│                            #   Embeddings, VectorStore, Retrieval, ContextBuilder,
│                            #   PromptAssembly, LLMGateway, ResponsePipeline,
│                            #   Search, ConversationMemory, Evaluation,
│                            #   Security (DocumentPermissions + RagSecurityGuard)
├── vapi/                    # Voice AI — Config, Assistants, Tools (8 tools),
│                            #   Webhooks, Flows, Memory, Analytics
├── whatsapp-ai/             # WhatsApp AI — Config, Client, Webhooks, Services
│                            #   (message processor + session memory)
├── apps/
│   ├── admin-dashboard/     # Next.js — MOCK (Zustand/localStorage only)
│   ├── customer-portal/     # Next.js — real API calls via TanStack Query
│   ├── distributor-portal/  # Next.js — API-first with mock fallback
│   ├── employee-portal/     # Next.js — API-first with mock fallback (calls
│   │                        #   /api/leads, /api/tasks, /api/tickets,
│   │                        #   /api/attendance — none exist in backend)
│   └── website-chat/        # Next.js — embeddable chat widget
├── database/                # 21 SQL migrations + Prisma schema (71 models)
├── monitoring/              # Prometheus + Grafana + Loki
├── automation/n8n/          # n8n workflow definitions + Helm + Terraform
├── deployment/              # Kubernetes (Helm + kustomizations) + Terraform
│                            #   modules for VPC, EKS, RDS, ElastiCache, S3,
│                            #   DNS, WAF, KMS
├── testing/                 # 107 .test.ts files (unit, integration, api, e2e,
│                            #   rag, voice, whatsapp, website, portals, security,
│                            #   database, ai-eval, performance, edge-cases)
└── packages/knowledge-base/ # 32 markdown source documents in 11 categories
```

`backend/app.module.ts` imports every sibling module — `RagModule`, `VapiModule`, `WhatsAppModule`, `EvaluationModule`, `RagSecurityModule` — plus 13 backend feature modules. The DI graph is correct. `main.ts` boots NestJS with helmet, compression, CORS allow-list, IP rate-limiting (100/15min on `/api/*`, 10/15min on `/api/auth/*`), global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform), Swagger on `/docs` (dev/staging only), and `enableShutdownHooks` for graceful Prisma + Redis teardown.

The global guard is `RolesGuard` (no-op unless `@Roles()` is set), not `JwtAuthGuard` — JWT auth is opt-in per controller via `@UseGuards(JwtAuthGuard)`. The rationale (documented in app.module.ts:145–157) is that the auth controller pre-dates the `@Public()` decorator. This is a defensible but unusual choice; it means a controller author who forgets `@UseGuards(JwtAuthGuard)` creates an unauthenticated endpoint by default.

---

## 2. Feature Inventory

| # | Feature | Status | Frontend | Backend | Database | Notes |
|---|---------|--------|----------|---------|----------|-------|
| 1 | Authentication | COMPLETE | Real (all portals) | JwtAuthGuard + bcrypt + refresh + reset + verify-email | 002_auth.sql complete | Solid |
| 2 | Authorization/RBAC | COMPLETE | n/a | PermissionsGuard on every business controller | roles/permissions/role_permissions/user_roles tables | Real |
| 3 | Multi-tenant | COMPLETE | n/a | tenantId filter on every service | tenant_id on every business table | Real |
| 4 | User management | COMPLETE | Real (admin uses mock store; employee portal real) | `api/users` full CRUD | users table | OK |
| 5 | Audit logging | PARTIAL | Mock store in admin | activity_logs/audit_logs/access_logs tables; admin endpoint exists | 011_audit.sql | Admin UI doesn't read from real API |
| 6 | Configuration | COMPLETE | n/a | configuration.ts + schema.ts (zod) | tenant_config table | Real |
| 7 | AI conversations | BROKEN | Real (employee/customer portals) | ConversationsService does NOT use RAG, tools, or abstain | conversations/messages tables | The v11 "RAG-grounded chat" claim is FALSE |
| 8 | AI tools | PARTIAL | n/a | 8 tools registered; listTools() returns name+description only (no parameters schema); no getToolDefinitions() | analytics_events (tool_execution) | Cannot drive OpenAI function-calling from ConversationsService |
| 9 | AI memory | COMPLETE | Real (admin uses mock store) | MemoryService with FACT/PREFERENCE/HISTORY/CONTEXT/SUMMARY | ai_memory table | Real |
| 10 | AI agents | COMPLETE | Mock store in admin | AiService CRUD over ai_agents | ai_agents table | Real backend |
| 11 | AI prompts | MOCKED | Mock prompt-store in admin | No backend module | n/a | Prompt management is localStorage only |
| 12 | Abstain policy | MISSING | n/a | No file exists (`find -name "*abstain*"` returns 0 results) | n/a | The "v11 abstain-policy.service.ts" referenced in prior audits does not exist |
| 13 | Document ingestion | COMPLETE | Mock upload in admin | IngestionService + Loaders (PDF/DOCX/MD/TXT/CSV/HTML) | rag_sources/rag_documents/rag_chunks in Prisma schema | Active migrations do NOT create rag_chunks table |
| 14 | Chunking | COMPLETE | n/a | ChunkingService (token-aware, gpt-tokenizer) | n/a | Real |
| 15 | Embeddings | COMPLETE | n/a | EmbeddingsService (OpenAI text-embedding-3-*) | embeddings table | Real |
| 16 | Vector search | COMPLETE | n/a | VectorStoreService ($queryRaw with Prisma.sql, parameterised) | HNSW index in 019 | 019 will fail — rag_chunks table not in active migrations |
| 17 | Retrieval | COMPLETE | n/a | RetrievalService (hybrid vector+keyword, RRF, cache) | n/a | Real, but never called from ConversationsService |
| 18 | Context assembly | COMPLETE | n/a | ContextBuilderService | n/a | Real, but never called from ConversationsService |
| 19 | Knowledge base admin | MOCKED | KnowledgeView uses useKnowledgeStore (Zustand+persist) | `/api/knowledge/*` real endpoints exist | rag_* tables | UI is 100% mock; backend is real |
| 20 | Vapi Voice AI | PARTIAL | Mock voice-session-store in admin | 8 tools with proper getToolDefinitions(); webhook verified; assistants created via Vapi cloud API | voice_sessions/voice_transcripts/voice_analytics | Solid backend; admin UI is mock |
| 21 | WhatsApp AI | PARTIAL | Mock whatsapp-view in admin | Webhook verified; message processor uses tools BUT buildToolDefinitions() produces empty parameters:{} — broken | whatsapp_sessions/messages/contacts | Tool-calling will receive empty args |
| 22 | Website AI | BROKEN | Real chat widget | WebsiteChatService proxies to ConversationsService (no RAG, no tools). Streaming endpoint calls OpenAI directly (no RAG, no tools). | web_sessions/web_events | The v11 "Website AI uses RAG" claim is FALSE |
| 23 | Customers | COMPLETE | Real (customer portal, employee portal) | CustomersService CRUD + addresses | customers + customer_addresses tables | Real |
| 24 | Distributors | COMPLETE | Real (distributor portal) | DistributorsService CRUD + performance | distributors table | Real |
| 25 | Products | COMPLETE | Real (customer portal) | ProductsService + CategoriesService + InventoryService | products/inventory/inventory_transactions/product_categories | Real |
| 26 | Orders | COMPLETE | Real (customer/distributor portals) | OrdersService with $transaction (atomic), inventory reserve/deduct, commissions, notifications | orders/order_items/shipments/distributor_commissions | Real, atomic (v8 fix verified) |
| 27 | Leads | PARTIAL | Real hooks in employee/distributor portals call /api/leads | No leads controller in NestJS backend (only in _express-reference/) | leads table exists in 004_customers.sql | Backend API missing |
| 28 | Support | PARTIAL | Real hooks in employee/customer portals call /api/tickets | No tickets controller in NestJS backend (only in _express-reference/) | support_tickets table exists in 004_customers.sql | Backend API missing |
| 29 | Notifications | BROKEN | n/a | Providers use `require('nodemailer')`, `require('twilio')`, `require('firebase-admin')` — none in package.json | notification_templates/notifications/notification_logs/notification_preferences | Runtime will throw "Cannot find module" when dispatching |
| 30 | Admin Dashboard | MOCKED | 100% Zustand/localStorage across all 13 views | Real backend exists for most features | n/a | Prototype-quality UI, not a working ops console |
| 31 | Customer Portal | COMPLETE | Real TanStack Query calls to /api | Real backend | Real | Works end-to-end |
| 32 | Distributor Portal | COMPLETE | API-first with mock fallback | Real backend | Real | Works end-to-end |
| 33 | Employee Portal | PARTIAL | API-first with mock fallback; calls /api/leads, /api/tasks, /api/tickets, /api/attendance | Only /api/users, /api/ai, /api/customers, /api/distributors, /api/knowledge exist; /api/leads, /api/tasks, /api/tickets, /api/attendance DO NOT | leads/support_tickets tables exist | Hooks silently fall back to mocks |
| 34 | Website Chat | PARTIAL | Real chat widget (chat-widget.tsx) | Backend exists but is not RAG-grounded | web_sessions/web_events | Chat works but answers are ungrounded |
| 35 | Docker | COMPLETE | n/a | docker-compose.yml (12 services) + docker-compose.prod.yml | n/a | Solid |
| 36 | Kubernetes | COMPLETE | n/a | Helm chart + base/staging/prod kustomizations + external-secrets + cert-manager | n/a | Production-shaped |
| 37 | Terraform | COMPLETE | n/a | 8 modules (vpc, eks, rds, elasticache, s3, dns, waf, kms) + staging/prod envs | n/a | Production-shaped |
| 38 | CI/CD | COMPLETE | n/a | 9-job pipeline: install→lint→typecheck→unit→integration→security→build→staging→prod | n/a | Has rollback, manual approval gate |
| 39 | Monitoring | COMPLETE | n/a | Prometheus + 5 Grafana dashboards + Loki + alert rules + alertmanager | n/a | Solid |
| 40 | Testing | PARTIAL | n/a | 107 .test.ts + 42 .spec.ts files | n/a | Wide coverage; many tests assert mock behaviour, not real integration |

---

## 3. Feature Potential Analysis

| Feature | Current Capability | Expected Capability | Gap | Severity |
|---------|-------------------|---------------------|-----|----------|
| AI conversations | Calls OpenAI with system prompt + memory + 10 prior turns; no tools, no RAG, no abstain | RAG-grounded, tool-augmented, abstain-checked replies with citations | Complete absence of RAG/tools/abstain on chat path | P0 |
| Abstain policy | Does not exist | Service that suppresses answers on out-of-domain or low-confidence queries | Missing entirely | P0 |
| AI tools → OpenAI wiring | ToolsService.listTools() returns name+description only; no parameter schema; ConversationsService never passes tools to OpenAI | OpenAI `tools:` parameter with full JSON schema per tool; tool_call response handling loop | No tool calling possible from chat path | P0 |
| DocumentPermissionsService | Implemented, unit-tested, exported by RagModule — but never invoked on the retrieval path | Called by RetrievalService (or ResponsePipeline) to drop inaccessible chunks before LLM sees them | Dead code; per-document RBAC is not enforced on RAG | P0 |
| RagSecurityGuard | Implemented — but never applied to any controller via @UseGuards | @UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard) on /api/rag/* controllers | Dead code | P1 |
| Website chat | Streams OpenAI replies; no RAG; no tools | RAG-grounded, tool-augmented replies matching the in-app chat | No grounding | P0 |
| WhatsApp tool calling | Tool-call loop exists but buildToolDefinitions() returns `parameters: { type:'object', properties:{}, additionalProperties:true }` for every tool — OpenAI cannot pass meaningful args | Per-tool JSON schema with named properties | Every tool call will fail validation (e.g. "query is required for search_knowledge") | P0 |
| Notification providers | Email/SMS/Push providers lazily `require()` packages that are not in package.json | Real provider implementations or graceful "not configured" skip | Runtime "Cannot find module" on first dispatch attempt | P0 |
| Admin dashboard | All 13 views use Zustand+localStorage; zero API calls | Each view fetches from /api/admin, /api/knowledge, /api/ai, etc. | UI is a prototype; ops cannot manage production from it | P1 |
| Employee portal | Calls /api/leads, /api/tasks, /api/tickets, /api/attendance — none exist | Backend modules for leads/tasks/tickets/attendance | Hooks silently fall back to mocks; functionality is fake | P1 |
| Database migrations | Active chain runs 001–021; rag_chunks table only in _archived/; migration 019 HNSW index on missing table; migration 020 ALTER TYPE on VARCHAR column | All 21 migrations run cleanly on a fresh DB; rag tables created before HNSW index; MemoryType enum exists before ALTER TYPE | Fresh install will fail on 019 and 020 | P0 |
| Prisma schema vs SQL | Prisma declares `enum MemoryType { FACT PREFERENCE HISTORY CONTEXT SUMMARY }` but SQL column is `VARCHAR(50)` | Either both enum or both VARCHAR | Prisma client will send enum values that the DB accepts as strings today, but migration 020 fails | P1 |
| Knowledge base admin UI | Upload button adds to localStorage; tick() simulates progress; exportCsv() serialises localStorage | POST /api/knowledge/ingest, GET /api/knowledge/documents, DELETE, reingest | UI never persists to backend | P1 |
| Voice AI admin UI | "New Call" / "End Call" use voice-session-store; no real Vapi call control | POST /api/vapi/calls, POST /api/vapi/calls/:id/end | UI does not control real calls | P2 |
| Automation admin UI | Workflow store with New/Edit/Test/Pause/Resume | n8n REST API or backend workflows API | UI does not drive real workflows | P2 |
| Audit logs admin UI | Export/Clear/Filter on audit-store (localStorage) | GET /api/admin/audit-logs, export endpoint | UI does not read real audit trail | P1 |
| Provider config admin UI | Configure button opens dialog writing to provider-config-store | POST /api/admin/config/:key | Config not persisted server-side | P1 |
| Lead management | Front-end hooks call /api/leads but no backend module | LeadController + LeadService | API missing | P1 |
| Support tickets | Front-end hooks call /api/tickets but no backend module | SupportTicketController + Service | API missing | P1 |
| Auth | Real JWT + bcrypt + refresh + reset + verify-email + rate-limit + JWT blocklist | Same | None | P4 |
| Orders atomicity | OrdersService.create() uses $transaction, inventoryService.reserveStock(tx), commission row, notification queue — all atomic | Same | None | P4 |
| Webhook signature verification | WhatsApp: HMAC-SHA256 + timingSafeEqual + 5min replay window + idempotency + audit row. Vapi: HMAC-SHA256(`${ts}.${body}`) + 5min skew + Redis SETNX idempotency + audit row | Same | None — production-grade | P4 |
| Monitoring | Prometheus + 5 Grafana dashboards (API, voice, business KPIs, database, RAG) + Loki + alert rules + alertmanager | Same | None | P4 |
| CI/CD | 9-job pipeline with security scan (gitleaks + semgrep + npm audit + CodeQL), integration tests on pgvector+redis, manual prod approval, rollback | Same | None — production-grade | P4 |
| Terraform | 8 modules covering VPC, EKS, RDS, ElastiCache, S3, DNS, WAF, KMS; staging+prod environments | Same | None | P4 |
| Kubernetes | Helm chart with backend+frontend+ingress+external-secret-store; staging+prod kustomizations; cert-manager | Same | None | P4 |

---

## 4. User Journey Analysis

### Customer journey

- **Login:** Real. `POST /api/auth/login` returns access + refresh tokens. Customer portal stores in localStorage.
- **Dashboard:** Real. TanStack Query fetches `/api/orders`, `/api/notifications`, `/api/products/recommendations`. Endpoints exist.
- **Browse products:** Real. `/api/products` (public? — actually requires JwtAuthGuard; customer portal passes JWT).
- **Place order:** Real. `POST /api/orders` runs atomic transaction with inventory reservation, commission row, notification queue.
- **AI assistant:** Real call to `/api/ai/conversations/:id/messages` — but the assistant reply is **not RAG-grounded and cannot call tools**. Customer asking "what's the return policy?" gets an ungrounded LLM hallucination, not a cited answer from `packages/knowledge-base/support/return-policy.md`.
- **Support tickets:** Customer portal calls `/api/tickets` — endpoint **does not exist**. Hook falls back to mock; ticket is never persisted.
- **Would fail:** Support ticket submission, AI assistant answer quality.

### Distributor journey

- **Login:** Real.
- **Dashboard:** API-first with mock fallback. `/api/distributors/:id` exists.
- **View commissions:** `/api/distributors/:id/commissions` — exists.
- **Place orders for customers:** `/api/orders` exists.
- **AI assistant:** Same broken path as customer.
- **Leads:** `/api/leads` — **does not exist**. Mock fallback.
- **Would fail:** Lead management, AI assistant answer quality.

### Employee journey

- **Login:** Real.
- **Dashboard:** `/api/users/me`, `/api/analytics/dashboard` — exist.
- **CRM (customers/distributors/leads):** Customers and distributors exist; `/api/leads` **does not exist**. Mock fallback.
- **Tasks:** `/api/tasks` — **does not exist**. Mock fallback.
- **Tickets:** `/api/tickets` — **does not exist**. Mock fallback.
- **Attendance:** `/api/attendance` — **does not exist**. Mock fallback.
- **AI assistant:** Same broken path.
- **Knowledge base:** `/api/knowledge/articles` exists.
- **Would fail:** Tasks, tickets, attendance, lead management — all silently fall back to mocks. Employee cannot do real work.

### Admin journey

- **Login:** Real (admin-dashboard/src/app/login/page.tsx calls /api/auth/login).
- **Dashboard view:** Mock data from admin-store.
- **Knowledge Base:** Upload/Export/Search/Filter/Delete/Reprocess — all use `useKnowledgeStore` (localStorage). Zero API calls.
- **AI Management:** Create Assistant/Configure/Test/Add Tool/Add Prompt/Edit Prompt/Test Prompt — all use `assistant-store`, `tool-store`, `prompt-store`, `memory-store` (localStorage). Zero API calls.
- **Voice AI:** New Call/End Call use `voice-session-store` (localStorage). Zero API calls.
- **Automation:** New Workflow/Edit/Test Run/Pause/Resume use `workflow-store` (localStorage). Zero API calls.
- **Users & Roles:** Add Admin/Edit/Delete use `admin-store` (localStorage). Zero API calls.
- **Audit Logs:** Export/Clear/Filter use `audit-store` (localStorage). Zero API calls.
- **Provider Config:** Configure button writes to `provider-config-store` (localStorage). Zero API calls.
- **Would fail:** Everything except login. The admin dashboard is a non-functional prototype against a real backend.

---

## 5. Button Audit

### Knowledge Base view (`knowledge-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| Upload Document | Yes — calls `useKnowledgeStore.upload()` | Mock | Adds to localStorage; tick() simulates progress at 800ms intervals |
| Export | Yes — calls `exportCsv()` | Mock | Serialises localStorage to CSV; downloads client-side |
| Search | Yes — local filter on `docs` array | Mock | Filter runs in-browser; no /api/knowledge/search call |
| Filter (category) | Yes — local filter | Mock | Same |
| Delete | Yes — calls `remove(id)` | Mock | Removes from localStorage |
| Reprocess | Yes — calls `reprocess(id)` | Mock | Sets status to 'processing' in localStorage |
| View detail | Yes — opens dialog | Mock | Reads from localStorage |

### AI Management view (`ai-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| Create Assistant | Yes — assistant-store | Mock | Persists to localStorage |
| Configure | Yes — assistant-store | Mock | Persists to localStorage |
| Test | Yes — assistant-store | Mock | Local echo |
| Add Tool | Yes — tool-store | Mock | Persists to localStorage |
| Add Prompt | Yes — prompt-store | Mock | Persists to localStorage |
| Edit Prompt | Yes — prompt-store | Mock | Persists to localStorage |
| Test Prompt | Yes — prompt-store | Mock | Local echo |

### Voice AI view (`voice-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| New Call | Yes — voice-session-store | Mock | Adds to localStorage; no Vapi call placed |
| End Call | Yes — voice-session-store | Mock | Updates localStorage row |

### Automation view (`automation-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| New Workflow | Yes — workflow-store | Mock | Persists to localStorage |
| Edit | Yes — workflow-store | Mock | Persists to localStorage |
| Test Run | Yes — workflow-store | Mock | Local echo |
| Pause/Resume | Yes — workflow-store | Mock | Persists to localStorage |

### Users view (`users-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| Add Admin | Yes — admin-store | Mock | Persists to localStorage |
| Edit | Yes — admin-store | Mock | Persists to localStorage |
| Delete | Yes — admin-store | Mock | Persists to localStorage |

### Audit Logs view (`audit-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| Export | Yes — audit-store | Mock | Serialises localStorage |
| Clear | Yes — audit-store | Mock | Empties localStorage |
| Filter | Yes — audit-store | Mock | In-browser filter |

### Provider Config view (`provider-config-view.tsx`)
| Button | Connected? | Works? | Notes |
|--------|-----------|--------|-------|
| Configure | Yes — provider-config-store | Mock | Opens dialog; writes to localStorage |

### CRM, Analytics, WhatsApp, Website, System views
All similarly use Zustand stores. **No view in the admin dashboard makes a single HTTP call to the backend.** This is confirmed by `grep -l "axios\|apiClient\|fetch(" apps/admin-dashboard/src/components/views/*.tsx` returning zero matches.

**This is a MOCK environment.** In production, every store action should call the corresponding `/api/*` endpoint. The current dashboard is suitable for UX walkthroughs and design review, not for operating the platform.

---

## 6. Security Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| SEC-01 | P0 | Notification providers `require()` packages not in package.json | `backend/notifications/providers/email.provider.ts:68` (`nodemailer`), `sms.provider.ts:64` (`twilio`), `push.provider.ts:94` (`firebase-admin`). None listed in `backend/package.json`. First dispatch will throw. |
| SEC-02 | P1 | `RagSecurityGuard` and `DocumentPermissionsService` are dead code | `grep -r "@UseGuards.*RagSecurity" backend/ rag/ vapi/ whatsapp-ai/ --include="*.controller.ts"` returns 0 matches. Document-level RBAC is not enforced anywhere on the API boundary. |
| SEC-03 | P1 | Global guard is `RolesGuard` (no-op), not `JwtAuthGuard` | `backend/app.module.ts:251`. Any controller author who forgets `@UseGuards(JwtAuthGuard)` exposes an unauthenticated endpoint. The `website-chat.controller.ts` does this correctly with `@Public()` + per-route `@UseGuards(JwtAuthGuard, PermissionsGuard)`. |
| SEC-04 | P1 | Website chat init endpoint is anonymous and creates rows in `conversations` + `web_sessions` | `website-chat.controller.ts:64,86,114,158,175` are `@Public()`. Rate-limited (10 init/min/IP, 30 msg/min/IP) via `RateLimitService` (Redis-backed). Acceptable for a public widget, but no CAPTCHA or proof-of-work. |
| SEC-05 | P3 | Admin dashboard api.ts defaults to port 8000 | `apps/admin-dashboard/src/lib/api.ts:42` — `process.env.NEXT_PUBLIC_API_URL \|\| "http://localhost:8000/api"`. Backend runs on port 3000 (`backend/main.ts:64`, `docker-compose.yml:61`). Default URL is wrong. |
| SEC-06 | P4 | Webhook signature verification is production-grade | WhatsApp: HMAC-SHA256, `crypto.timingSafeEqual`, fail-closed when app secret missing, Redis idempotency (`SETNX` 72h TTL), audit row in `webhook_events`. Vapi: HMAC-SHA256 of `${timestamp}.${rawBody}`, 5min replay window, same idempotency + audit pattern. Verified in `whatsapp-ai/webhooks/whatsapp-webhook.service.ts:135-190` and `vapi/webhooks/vapi-webhook-service.ts:94-159`. |
| SEC-07 | P4 | SQL injection: all `$queryRaw` uses parameterised template literals or `Prisma.sql` | `grep -rn 'queryRaw\|executeRaw' backend/ rag/ --include='*.ts'` shows 14 sites; all use tagged template literals with `${variable}` interpolation (Prisma parameterises these) or `Prisma.sql` for dynamic SQL. No string concatenation. |
| SEC-08 | P4 | No hardcoded secrets in source | `grep -rn 'sk-[a-zA-Z0-9]\{20,\}\|password.*=.*[...]` returns only the `password=[REDACTED]` redaction in the exceptions filter. Config is read from env. |
| SEC-09 | P3 | File upload validation: not verified | `KnowledgeController` has `POST /api/knowledge/ingest` (multiform upload) but I did not find MIME-type or size-limit validation in the controller; the IngestionService relies on per-loader content parsing. The Express body limit is 10mb (`main.ts:68`). |
| SEC-10 | P4 | JWT blocklist on logout | `JwtBlocklistService` (`_shared/security/jwt-blocklist.service.ts`) stores JTI hashes in Redis; `JwtStrategy` validates against the blocklist. |
| SEC-11 | P4 | Password policy | `PasswordPolicy` enforces bcrypt with 12 rounds (`auth.service.ts:170-194`). |
| SEC-12 | P3 | CORS allow-list is configurable but defaults to `http://localhost:3000` | `main.ts:86-115`. In production, `CORS_ORIGINS` must be set. |

---

## 7. Database Findings

### 7.1 Migration chain

21 active migrations in `database/migrations/001_initial.sql` through `021_fix_user_email_unique.sql`. The audit prompt references migrations 023 and 024 — **they do not exist**. The latest migration is 021.

### 7.2 Critical migration defects

**DB-01 (P0): Migration 019 will fail on a fresh database.** `database/migrations/019_add_hnsw_index.sql:11-15` executes:
```sql
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
ANALYZE rag_chunks;
```
But the `rag_chunks` table is **never created** in the active migration chain. It is only defined in `database/migrations/_archived/003_ai_tables.sql:198` and `_archived/004_rag_chunks_pgvector.sql:2`, both of which are explicitly archived and not applied. The Prisma schema declares `model RagChunk` mapped to `rag_chunks` (schema.prisma:857-875) but no SQL migration creates that table.

**Resolution options:** either unarchive a rag-tables migration, or add a new migration `022_create_rag_tables.sql` that creates `rag_sources`, `rag_documents`, `rag_chunks` (with `embedding vector(1536)` column), and `rag_embeddings` before 019 runs. Since migrations are numbered and applied alphabetically, you cannot insert 019.5; you would need to either fix 019 to be idempotent (`CREATE TABLE IF NOT EXISTS` then `CREATE INDEX`) or add a new migration that creates the tables and skip 019 entirely on fresh installs.

**DB-02 (P0): Migration 020 will fail on a fresh database.** `database/migrations/020_add_summary_memory_type.sql:6`:
```sql
ALTER TYPE memory_type ADD VALUE IF NOT EXISTS 'SUMMARY';
```
But the `memory_type` type **does not exist** as a Postgres enum. Migration `006_ai.sql:114` declares `ai_memory.type` as `VARCHAR(50) NOT NULL` (not an enum). The Prisma schema declares `enum MemoryType` (schema.prisma:162-168) but the SQL migration never created the enum. This is a schema/SQL divergence — Prisma will fail when querying against the actual VARCHAR column.

**Resolution:** Either drop migration 020 (the VARCHAR column accepts 'SUMMARY' without an enum constraint) or migrate the column to a real Postgres enum first.

### 7.3 Schema/SQL divergences

| Divergence | Severity | Notes |
|-----------|----------|-------|
| `MemoryType` enum in Prisma vs `VARCHAR(50)` in SQL | P1 | Prisma client may send enum values that work but `prisma migrate` will diverge |
| `rag_chunks`, `rag_documents`, `rag_sources`, `rag_embeddings` tables in Prisma but not in active SQL migrations | P0 | VectorStoreService/RetrievalService will fail at runtime |
| `tool_executions` table created in `006_ai.sql:138` but Prisma schema has no `ToolExecution` model (ToolsService persists via `analytics_events` instead) | P3 | Orphaned table |
| `voice_transcripts` and `voice_analytics` tables have no `tenant_id` column (006/007_channels.sql) but Prisma models `VoiceTranscript`/`VoiceAnalytics` also lack tenantId — consistent, but breaks multi-tenant isolation for voice transcripts | P2 | |
| `Permission` and `RolePermission` tables have no tenantId — by design (global permission catalogue) | P4 | OK |

### 7.4 Index coverage

All foreign keys have indexes (verified in 012_indexes.sql + per-migration `CREATE INDEX` statements). `tenant_id` is indexed on every business table. `rag_chunks` has HNSW on embedding (migration 019, conditional on table existing). `products` has GIN on `search_vector` tsvector with trigger (`003_products.sql:80-90`).

### 7.5 Multi-tenant isolation

`tenant_id` is on every business table except `Permission`, `RolePermission`, `VoiceTranscript`, `VoiceAnalytics`. `TenantMiddleware` (`_shared/common/middleware/tenant.middleware.ts`) stamps `app.current_tenant` on the request; `_shared/common/exceptions/all-exceptions.filter.ts:324` redacts `password=` strings from logs. RLS policies exist in `_archived/003_ai_tables.sql:281-295` but are not in active migrations.

---

## 8. AI/RAG Flow Verification

The audit prompt asks for an 8-step trace of the AI/RAG flow with the v11 fixes. Here is the actual code trace, with evidence.

### Step 1: User sends message → `ConversationsService.sendMessage()`

`backend/ai/conversations.service.ts:166` — `async sendMessage(id: string, dto: SendMessageDto, user: AuthUser)`.

### Step 2: Does it check abstain policy?

**NO.** The file `backend/ai/conversations.service.ts` contains zero references to `abstain`, `AbstainPolicy`, or any abstain-related service. A repository-wide `grep -rn "abstain\|abstainPolicy\|AbstainPolicy" backend/ rag/ vapi/ whatsapp-ai/ --include="*.ts"` returns **zero matches**. The abstain policy service referenced as the "v11 fix" does not exist in the codebase.

### Step 3: Does it call `RetrievalService.retrieve()`?

**NO.** `ConversationsService` injects only `PrismaService`, `MemoryService`, and `OPENAI_CLIENT` (constructor at line 48-52). It never imports or injects `RetrievalService`, `RetrievalPipelineService`, `ContextBuilderService`, `PromptAssemblyService`, or `ResponsePipelineService`. The system prompt is built from `agentConfig.systemPrompt` + memory lines (line 214, `augmentSystemPrompt`) — no retrieved context.

### Step 4: Does `RetrievalService` call `DocumentPermissionsService`?

**NO.** `rag/retriever/retrieval-service.ts` (565 lines) injects only `PrismaService`, `EmbeddingsService`, `VectorStoreService` (constructor at line 55-59). It calls `vectorStoreService.search()` and `$queryRaw` for the keyword leg — neither path filters by document permissions. `DocumentPermissionsService.filterAccessibleChunks()` is implemented (`rag/security/document-permissions.service.ts:252`) but is called only from `RagSecurityGuard.canActivate()` (line 108) — and `RagSecurityGuard` is **never applied to any controller** (verified: zero `@UseGuards(...RagSecurityGuard...)` matches across all `*.controller.ts` files).

### Step 5: Is retrieved context injected into the system prompt?

**NO.** `ConversationsService.augmentSystemPrompt()` (line 329-336) appends only memory lines (`- type: key = value`). No retrieved chunks. No citations.

### Step 6: Are tools passed to OpenAI?

**NO.** The `chat.completions.create()` call at `conversations.service.ts:238-243` passes only `model`, `messages`, `temperature`, `max_tokens`. No `tools` parameter. No `tool_choice`.

### Step 7: Are tool-call responses handled?

**NO.** The code reads `completion.choices[0]?.message?.content` (line 245) — there is no `if (msg.tool_calls)` branch. If the model returned a tool_call (which it cannot, since no tools were advertised), the assistant reply would be empty.

### Step 8: Is the abstain post-check applied?

**NO.** No post-check exists. The assistant content is persisted directly (line 249-258) and returned.

### Contrast: WhatsApp message processor

`whatsapp-ai/services/whatsapp-message-processor.service.ts:183-271` **does** implement a tool-call loop with `tools: toolDefinitions.length > 0 ? toolDefinitions : undefined` (line 207) and a `msg.tool_calls` branch (line 218). However:

- `buildToolDefinitions()` at line 496-512 produces `parameters: { type: 'object', properties: {}, additionalProperties: true }` for every tool — empty schema. OpenAI will not know what arguments to pass.
- The tool handlers (in `backend/ai/tools.service.ts`) validate args strictly: `search_knowledge` throws `BadRequestException('query is required')` if `args.query` is missing (line 192-194). With empty schema, OpenAI will pass empty args, and every tool call will fail validation.
- The WhatsApp processor also does NOT call RetrievalService. RAG grounding is absent on this channel too.

### Contrast: Vapi

`vapi/tools/vapi-tool-registry.service.ts:108-120` **does** implement `getToolDefinitions()` correctly — each tool's full `parameters` JSON schema is returned. This is consumed by `vapi-assistant.service.ts:97-114` when creating/updating Vapi assistants on the Vapi cloud (via `POST /assistant`). Tool execution on Vapi is delegated to the Vapi platform, which calls back to the `vapi-webhook-controller.ts` `function-call` endpoint. The Vapi path is properly wired — but it runs on Vapi's cloud, not on this backend's `ConversationsService`.

### Contrast: Website chat

`backend/website-chat/website-chat.service.ts:199-203` proxies `sendMessage` to `ConversationsService.sendMessage()` — so it inherits all the same gaps (no RAG, no tools). The streaming endpoint (`streamMessage`, line 230+) calls OpenAI directly with `stream: true` — also no RAG, no tools. The default web system prompt (line 22-28) says "Use the available tools when the visitor asks about products..." but **no tools are actually advertised to the model**, so the instruction is moot.

### Conclusion

The "v11 RAG integration" claimed by prior audits is **not present in the code**. The RAG pipeline is a complete, well-engineered subsystem (`RetrievalService`, `ContextBuilderService`, `PromptAssemblyService`, `ResponsePipelineService`, `SearchService`) that is wired into the DI container and exported by `RagModule` — but **no chat-path service consumes it**. The only consumers are:
- `KnowledgeService.query()` (the `/api/knowledge/query` endpoint) — explicitly invoked by the user, not by chat.
- `SearchService` (the `/api/rag/search` endpoint) — same.
- `ResponsePipelineService` — exported but I could not find a chat-path consumer.

This is the single biggest gap in the platform.

---

## 9. Infrastructure Findings

### 9.1 Docker

`docker-compose.yml` defines 12 services: postgres (pgvector/pgvector:pg16), redis, backend, voice-ai, whatsapp-ai, admin-dashboard, minio, n8n, qdrant, prometheus, grafana, loki, nginx. Healthchecks on postgres, redis, backend, minio, qdrant. Volume persistence for all stateful services. `docker-compose.prod.yml` exists separately. The compose file is solid for development.

**Note:** `qdrant` is defined as a service but the RAG code uses pgvector (`VectorStoreService` queries `rag_chunks` via Prisma). Qdrant appears unused — likely a leftover from an earlier architecture decision.

### 9.2 Kubernetes

`deployment/kubernetes/` contains:
- `01-base-manifests.yaml` — namespace, service accounts, configmaps
- `02-voice-ai-manifests.yaml`
- `03-external-secrets.yaml` — ExternalSecrets for secret rotation
- `04-cert-manager.yaml`
- `helm/dayjoyai/` — Helm chart with `backend.yaml`, `frontend.yaml`, `ingress.yaml`, `external-secret-store.yaml`, `_helpers.tpl`, `Chart.yaml`, `values.yaml`
- `staging/kustomization.yaml` + `production/kustomization.yaml`

Production-shaped. Includes external secrets, cert-manager, ingress, HPA (implied via Helm values).

### 9.3 Terraform

`deployment/terraform/` contains 8 modules: `vpc`, `eks`, `rds`, `elasticache`, `s3`, `dns`, `waf`, `kms`. Two environments: `staging/main.tf` and `production/main.tf`. Production-grade IaC.

### 9.4 CI/CD

`.github/workflows/ci-cd.yml` defines a 9-job pipeline:
1. Install (pnpm, frozen-lockfile)
2. Lint + format check
3. Type check (`tsc --noEmit`)
4. Unit tests (backend, apps, rag, vapi)
5. Integration tests (PostgreSQL pgvector + Redis services, applies migrations, runs Prisma generate, runs `testing/integration/`)
6. Security scan (gitleaks + Semgrep + npm audit + CodeQL)
7. Build (backend + 5 frontends + Docker push to ECR on main)
8. Deploy staging (EKS rollout + health check + rollback on failure)
9. Deploy production (manual approval gate, same rollout + health check + rollback)

Production-grade CI/CD. Note: integration tests apply migrations in alphabetical order (`for f in database/migrations/0*.sql`) — this will hit the DB-01 and DB-02 failures on migration 019 and 020 in CI as well.

### 9.5 Monitoring

`monitoring/` contains Prometheus (config, alert rules, alertmanager), Grafana (5 dashboards: api-overview, voice-ai, business-kpis, database, rag), and Loki (config + promtail). Prometheus scrapes backend `/metrics` (Prometheus format exposed by `MetricsController` + `MetricsInterceptor`). Solid observability stack.

---

## 10. Testing Findings

### 10.1 Test file count

- 118 `*.test.ts` files (107 under `testing/`, 11 under `apps/*/tests/`)
- 42 `*.spec.ts` files (mostly under `backend/` and `rag/`)
- Total: **160 test files**

### 10.2 Coverage by category

| Category | Files | Notes |
|----------|-------|-------|
| `testing/unit/` | 16 | Service-level unit tests with mocked Prisma |
| `testing/integration/` | 8 | End-to-end API flow tests with real DB |
| `testing/api/` | 12 | Per-module API contract tests |
| `testing/database/` | 7 | Schema, migrations, RLS, triggers, views, functions, performance |
| `testing/security/` | 7 | auth, rbac, csrf, xss, sql-injection, rate-limiting, authorization |
| `testing/rag/` | 5 | citation-accuracy, retrieval-accuracy, ingestion, hallucination-detection, evaluation |
| `testing/voice/` | 7 | greetings, product-questions, tool-calling, human-escalation, memory, lead-capture, appointment-booking |
| `testing/whatsapp/` | 5 | webhook, ai-conversation, opt-in, rich-features, messaging |
| `testing/website/` | 6 | chat-widget, embed, streaming, voice-input, admin-controls, guest-vs-logged-in |
| `testing/portals/` | 15 | 6 customer, 6 distributor, 3 admin, 5 employee |
| `testing/ai-eval/` | 5 | rag-precision, memory-accuracy, tool-selection, latency, response-accuracy |
| `testing/performance/` | 4 | load, soak, scalability, stress |
| `testing/edge-cases/` | 5 | customer, distributor, employee, admin, system |

### 10.3 What's tested vs not

**Well-tested:**
- Auth flow (login, register, refresh, reset, verify-email, logout, change-password)
- Orders atomic transaction with inventory reservation
- Webhook signature verification (WhatsApp + Vapi)
- RAG retrieval precision/recall (offline evaluation suite)
- Voice tool-calling flow

**Under-tested or not tested:**
- ConversationsService does NOT call RetrievalService — but the unit test `testing/unit/conversations.service.test.ts` doesn't assert RAG integration either (it tests the existing no-RAG behaviour, so the test passes but the feature is missing)
- Employee portal hooks call `/api/leads`, `/api/tasks`, `/api/tickets`, `/api/attendance` — no test asserts these endpoints exist
- Admin dashboard: zero tests assert that the dashboard calls real APIs (because it doesn't)
- Notification provider `require('nodemailer')` — no test exercises the actual dispatch path with the package installed

---

## 11. Issue Classification

### P0 — Production Blockers

| ID | Issue | Component | Evidence |
|----|-------|-----------|----------|
| P0-001 | ConversationsService does not call RetrievalService — chat is not RAG-grounded | backend/ai | `backend/ai/conversations.service.ts:166-261` — no RetrievalService injection or call |
| P0-002 | ConversationsService does not pass tools to OpenAI and does not handle tool_calls | backend/ai | `backend/ai/conversations.service.ts:238-243` — no `tools:` parameter |
| P0-003 | Abstain policy service does not exist | backend/ai, rag/abstain | `find . -name "*abstain*"` returns 0 results |
| P0-004 | DocumentPermissionsService is dead code — never called from retrieval path | rag/security | `rag/retriever/retrieval-service.ts` does not inject or call it; only `RagSecurityGuard` consumes it, and the guard is never applied |
| P0-005 | WhatsApp `buildToolDefinitions()` returns empty `parameters: { properties: {} }` — OpenAI cannot pass meaningful args | whatsapp-ai/services | `whatsapp-message-processor.service.ts:496-512` |
| P0-006 | Notification providers `require('nodemailer')`, `require('twilio')`, `require('firebase-admin')` — packages not in package.json | backend/notifications/providers | `email.provider.ts:68`, `sms.provider.ts:64`, `push.provider.ts:94`; `backend/package.json` has no such deps |
| P0-007 | Migration 019 creates HNSW index on `rag_chunks` table that no active migration creates | database/migrations | `019_add_hnsw_index.sql:11-15`; rag_chunks only in `_archived/003_ai_tables.sql` and `_archived/004_rag_chunks_pgvector.sql` |
| P0-008 | Migration 020 `ALTER TYPE memory_type ADD VALUE` — `memory_type` enum does not exist (column is VARCHAR(50)) | database/migrations | `020_add_summary_memory_type.sql:6`; `006_ai.sql:114` declares `type VARCHAR(50)` |

### P1 — Critical

| ID | Issue | Component | Evidence |
|----|-------|-----------|----------|
| P1-001 | Admin dashboard is 100% mock — all 13 views use Zustand/localStorage, zero API calls | apps/admin-dashboard | `grep -l "axios\|apiClient\|fetch(" apps/admin-dashboard/src/components/views/*.tsx` returns 0 matches; 11 store files in `src/store/` |
| P1-002 | Employee portal calls `/api/leads`, `/api/tasks`, `/api/tickets`, `/api/attendance` — none exist in backend | apps/employee-portal | `apps/employee-portal/src/hooks/use-{crm,tasks,tickets}.ts`; `find backend -name "leads*"` returns only `_express-reference/` |
| P1-003 | RagSecurityGuard never applied to any controller | rag/security, backend | `grep -rn "@UseGuards.*RagSecurity" --include="*.controller.ts"` returns 0 matches |
| P1-004 | Prisma `MemoryType` enum vs SQL `VARCHAR(50)` divergence | database | `schema.prisma:162-168` enum vs `006_ai.sql:114` VARCHAR |
| P1-005 | `ToolsService.listTools()` returns `{ name, description }` only — no parameter schema; no `getToolDefinitions()` method | backend/ai/tools.service.ts | `tools.service.ts:173-178` |
| P1-006 | Admin dashboard api.ts defaults to port 8000; backend is on port 3000 | apps/admin-dashboard/src/lib/api.ts | `api.ts:42` |
| P1-007 | Voice transcripts and voice analytics tables have no tenant_id — breaks multi-tenant isolation for voice data | database/migrations | `007_channels.sql:59-105` (voice_transcripts, voice_analytics lack tenant_id) |
| P1-008 | `tool_executions` table created but no Prisma model — orphaned table | database | `006_ai.sql:138` creates table; `schema.prisma` has no ToolExecution model (ToolsService persists to analytics_events instead) |
| P1-009 | Knowledge base admin UI never persists to backend (Upload/Delete/Reprocess all localStorage-only) | apps/admin-dashboard | `store/knowledge-store.ts:119-228` |
| P1-010 | Audit log admin UI never reads from backend | apps/admin-dashboard | `store/audit-store.ts` |
| P1-011 | Provider config admin UI never persists to backend | apps/admin-dashboard | `store/provider-config-store.ts` |

### P2 — High

| ID | Issue | Component | Evidence |
|----|-------|-----------|----------|
| P2-001 | Website chat streaming endpoint calls OpenAI directly without RAG or tools | backend/website-chat | `website-chat.service.ts:230-330` |
| P2-002 | Qdrant service defined in docker-compose but unused (RAG uses pgvector) | docker-compose.yml | `docker-compose.yml:174-188` |
| P2-003 | Voice AI admin UI does not control real Vapi calls | apps/admin-dashboard | `store/voice-session-store.ts` |
| P2-004 | Automation admin UI does not drive real n8n workflows | apps/admin-dashboard | `store/workflow-store.ts` |
| P2-005 | `_express-reference/` directory contains a full Express implementation that is not wired in | backend/_express-reference | 19 files; not imported by app.module.ts |
| P2-006 | Lead management backend missing (table exists, no controller) | backend | `004_customers.sql:92` creates leads table; no leads.controller.ts in backend (only _express-reference) |
| P2-007 | Support ticket backend missing (table exists, no controller) | backend | `004_customers.sql:222` creates support_tickets table; no tickets.controller.ts in backend |
| P2-008 | LLM rerank is stubbed ("returning as-is") | rag/retriever | `retrieval-service.ts:399-403` |
| P2-009 | Distributor portal uses API-first with mock fallback — silent mock fallback masks backend failures in production | apps/distributor-portal | `lib/services.ts:38-57` |

### P3 — Medium

| ID | Issue | Component | Evidence |
|----|-------|-----------|----------|
| P3-001 | File upload validation not verified (MIME / size / magic bytes) | backend/knowledge | `knowledge.controller.ts:123` (POST /ingest) |
| P3-002 | CORS allow-list defaults to `http://localhost:3000` — production must set CORS_ORIGINS | backend/main.ts | `main.ts:86-115` |
| P3-003 | RLS policies for rag_* tables only in `_archived/` — not active | database/migrations | `_archived/003_ai_tables.sql:281-295` |
| P3-004 | Admin dashboard has 11 store files — large surface area to migrate to real APIs | apps/admin-dashboard/src/store | 11 files |
| P3-005 | `N8N_ENCRYPTION_KEY` defaults to a hardcoded dev value | docker-compose.yml | `docker-compose.yml:165` |
| P3-006 | MinIO root credentials hardcoded (`dayjoy`/`dayjoy123`) in docker-compose | docker-compose.yml | `docker-compose.yml:141-142` |

### P4 — Low

| ID | Issue | Component | Evidence |
|----|-------|-----------|----------|
| P4-001 | Swagger UI exposes full API surface in dev/staging (intentional) | backend/main.ts:166-204 | OK for dev, disabled in prod |
| P4-002 | pnpm workspace package.json scripts reference `pnpm` but Node engine requires `>=18.0.0` and pnpm `>=8.0.0` — CI uses pnpm 9 | backend/package.json:23-26 | Minor version skew |
| P4-003 | The `Embedding` model in Prisma uses `Bytes` for `embedding` column — different from `RagChunk.embedding` which uses `Unsupported("vector(1536)")` | database/prisma/schema.prisma:877-888 | Two embedding storage strategies coexist |
| P4-004 | `_reference/` and `_archived/` directories bloat the repo | various | Cleanup candidate |
| P4-005 | Knowledge base has 32 markdown files but no automated ingestion script wired to IngestionService | packages/knowledge-base, scripts/production | `scripts/production/generate-embeddings.mjs` was referenced in the audit prompt but does not exist in the repo |

---

## 12. Remediation Order

The following is the recommended fix order, prioritised by production-blocking severity and dependency chain. Each item lists the files to touch and the verification step.

### Phase A — Unblock the AI core (P0-001 through P0-005)

1. **Create `rag/abstain/abstain-policy.service.ts`** (P0-003): a service that takes a query and a confidence score / retrieved chunks and returns `{ shouldAbstain: boolean, reason: string }`. Wire it into `RagModule` providers + exports.

2. **Rewire `ConversationsService.sendMessage()` to consume the RAG pipeline** (P0-001, P0-002, P0-004):
   - Inject `RetrievalService`, `ContextBuilderService`, `DocumentPermissionsService`, `ToolsService`, and the new `AbstainPolicyService`.
   - After persisting the user message, call `retrievalService.retrieve({ query: dto.content, tenantId: user.tenantId })`.
   - Call `documentPermissionsService.filterAccessibleChunks(user.userId, retrieved.map(c => c.chunkId))` to drop inaccessible chunks (P0-004).
   - Call `abstainPolicyService.shouldAbstain(query, filteredChunks)` — if true, persist a "I don't have enough information to answer that" reply and return (P0-003).
   - Inject the retrieved context into the system prompt via `contextBuilderService.buildContext(query, filteredChunks)`.
   - Build the OpenAI tool definitions by adding `getToolDefinitions()` to `ToolsService` that returns `{ type: 'function', function: { name, description, parameters } }` for each tool — define per-tool JSON schemas (P1-005).
   - Pass `tools: toolDefinitions` to `chat.completions.create()`.
   - Add a tool-call loop (copy the pattern from `whatsapp-message-processor.service.ts:201-271`) that handles `msg.tool_calls`, calls `toolsService.executeForConversation()`, and feeds results back for another round (max 5 rounds).
   - After the final reply, apply the abstain post-check: if the reply contains hallucination markers (no citation, low confidence), abstain.

3. **Fix `WhatsAppMessageProcessor.buildToolDefinitions()`** (P0-005): replace the empty-schema stub with a call to the new `ToolsService.getToolDefinitions()`.

4. **Wire `WebsiteChatService.sendMessage()` and `streamMessage()` to the new RAG-grounded ConversationsService** (P2-001): the streaming endpoint should either (a) call the RAG pipeline first, then stream the final OpenAI call, or (b) use the OpenAI streaming + tool-call hybrid (which requires SDK v5+).

5. **Apply `RagSecurityGuard` to `/api/rag/*` and `/api/knowledge/*` controllers** (P1-003): add `@UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard)` on `KnowledgeController` and the RAG search controller.

### Phase B — Unblock the database (P0-007, P0-008, P1-004)

6. **Add migration `022_create_rag_tables.sql`** that creates `rag_sources`, `rag_documents`, `rag_chunks` (with `embedding vector(1536)` column), and `rag_embeddings` tables. Mark migration 019 as idempotent or add `CREATE TABLE IF NOT EXISTS rag_chunks` to 022 so 019 succeeds on fresh installs.

7. **Fix migration 020**: either drop it (VARCHAR accepts 'SUMMARY' without an enum) or add a preceding migration that converts `ai_memory.type` from VARCHAR to a real Postgres enum.

8. **Reconcile Prisma `MemoryType` enum with SQL** (P1-004): pick one strategy (enum or VARCHAR) and align both sides.

### Phase C — Unblock notifications (P0-006)

9. **Add `nodemailer`, `twilio`, and `firebase-admin` to `backend/package.json`** as optional dependencies, OR rewrite the providers to use `fetch()` against provider REST APIs (SendGrid for email, Twilio REST for SMS, FCM REST for push). The lazy-`require()` pattern is fine — just make the packages installable.

### Phase D — Unblock the admin dashboard (P1-001, P1-009, P1-010, P1-011)

10. **Replace Zustand stores with real API calls** in the admin dashboard. Each store action becomes a TanStack Query mutation:
    - `knowledge-store` → `POST /api/knowledge/ingest`, `GET /api/knowledge/documents`, `DELETE /api/knowledge/documents/:id`, `POST /api/knowledge/sources/:id/reingest`
    - `assistant-store` → `POST /api/ai/agents`, `PUT /api/ai/agents/:id`, `GET /api/ai/agents`
    - `tool-store` → `GET /api/ai/tools`
    - `prompt-store` → no backend exists today; add `backend/ai/prompts/` module
    - `voice-session-store` → `POST /api/vapi/calls`, `POST /api/vapi/calls/:id/end`
    - `workflow-store` → n8n REST API (or add `backend/automation/` module)
    - `admin-store` → `GET /api/admin/users`, `POST /api/admin/users`, `PUT /api/admin/users/:id`, `DELETE /api/admin/users/:id`
    - `audit-store` → `GET /api/admin/audit-logs`, `DELETE /api/admin/audit-logs`
    - `provider-config-store` → `PUT /api/admin/config/:key`

11. **Fix `apps/admin-dashboard/src/lib/api.ts:42` default URL** from `localhost:8000` to `localhost:3000` (P1-006).

### Phase E — Unblock missing backend modules (P1-002, P2-006, P2-007)

12. **Create `backend/leads/` module** with `LeadController` + `LeadService` (CRUD + convert + notes). The Prisma `Lead` model and `leads` table already exist.

13. **Create `backend/tickets/` module** with `SupportTicketController` + `Service` (CRUD + assign + escalate). The Prisma `SupportTicket` model and `support_tickets` table already exist.

14. **Create `backend/tasks/` module** (no Prisma model — add one) or document that tasks are out of scope and remove the employee portal task UI.

15. **Create `backend/attendance/` module** (no Prisma model — add one) or remove the employee portal attendance UI.

### Phase F — Polish and hardening (P2, P3)

16. Remove `_express-reference/` directory (P2-005).
17. Remove `qdrant` from docker-compose.yml or wire it into VectorStoreService (P2-002).
18. Add tenant_id to `voice_transcripts` and `voice_analytics` tables (P1-007).
19. Add MIME-type and size validation to `KnowledgeController` upload (P3-001).
20. Replace hardcoded MinIO credentials and N8N_ENCRYPTION_KEY with env-var-only defaults (P3-005, P3-006).
21. Implement the LLM rerank or document it as a stub (P2-008).
22. Activate RLS policies for rag_* tables (P3-003).

### Phase G — Testing

23. Add integration tests that assert ConversationsService calls RetrievalService, DocumentPermissionsService, and AbstainPolicyService.
24. Add tests that assert the admin dashboard calls real APIs (Playwright e2e).
25. Add tests that the employee portal hooks fail loudly (not silently fall back to mocks) when backend endpoints are missing.

---

## Closing note on prior audit claims

This audit found that several "v11 fixes" referenced in the audit prompt do not exist in the codebase:

- **v11 fix: "ConversationsService calls RetrievalService"** — FALSE. `conversations.service.ts` does not import or inject `RetrievalService`.
- **v11 fix: "RetrievalService calls DocumentPermissionsService"** — FALSE. `retrieval-service.ts` does not inject `DocumentPermissionsService`.
- **v11 fix: "Abstain policy service at `rag/abstain/abstain-policy.service.ts`"** — FALSE. No such file exists.
- **v11 fix: "Migration 023 uses 'READY' status"** — N/A. Migration 023 does not exist. The 'READY' status is hardcoded in `retrieval-service.ts:304` (correct), but no migration creates the `rag_documents` table that the column lives on.
- **v11 fix: "Migration 024 creates RAG tables with vector(1536)"** — N/A. Migration 024 does not exist. The `rag_chunks.embedding` column with `vector(1536)` is declared in the Prisma schema (`schema.prisma:866`) but no active SQL migration creates the table.
- **v11 fix: "Website AI uses RAG"** — FALSE. `WebsiteChatService.sendMessage()` proxies to `ConversationsService.sendMessage()` which does not use RAG. The streaming endpoint calls OpenAI directly without RAG.
- **v11 fix: "Tools passed to OpenAI"** — FALSE for ConversationsService and WebsiteChatService. TRUE for Vapi (via `getToolDefinitions()`) and partially true for WhatsApp (the loop exists but `buildToolDefinitions()` returns empty schemas).
- **v11 fix: "Tool-call responses handled"** — FALSE for ConversationsService and WebsiteChatService. TRUE for WhatsApp and Vapi.
- **v11 fix: "Abstain post-check applied"** — FALSE. No abstain service exists.

The prior audit reports in this repository (e.g. `docs/P0_FIX_COMPLETION_REPORT.md`, `docs/DEEP_AUDIT_P0_FIX_REPORT.md`, `docs/AI_MANAGEMENT_FIX_COMPLETION_REPORT.md`) should be re-examined: they appear to claim fixes that were not actually applied to the code. The RAG subsystem itself is well-engineered and complete — the gap is purely in the integration between the chat path and the RAG path.

This audit was conducted by reading the actual source files in `/home/z/my-project/build-zip/`. No file was modified.
