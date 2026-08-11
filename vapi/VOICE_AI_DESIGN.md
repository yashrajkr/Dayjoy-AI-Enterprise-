# Dayjoy Voice AI (Vapi) — Design Document

> **Status:** Production-ready  •  **Owner:** Voice AI Platform Team  •  **Phase:** 10
>
> Companion documents:
> - Architecture deep-dive: [`docs/architecture/05_VOICE_AI_ARCHITECTURE.md`](../docs/architecture/05_VOICE_AI_ARCHITECTURE.md)
> - AI design summary: [`docs/ai/AI_DESIGN_SUMMARY.md`](../docs/ai/AI_DESIGN_SUMMARY.md)
> - Conversation design: [`docs/conversation-design/`](../docs/conversation-design/)
> - Tool design: [`docs/tool-design/`](../docs/tool-design/)
> - Backend design: [`backend/BACKEND_DESIGN.md`](../backend/BACKEND_DESIGN.md)
> - Module README: [`vapi/README.md`](./README.md) + [`vapi/docs/vapi-README.md`](./docs/vapi-README.md)

---

## 1. Overview

The Dayjoy Voice AI system uses [Vapi.ai](https://vapi.ai) to handle inbound
and outbound voice calls. It integrates with the NestJS backend, the
RAG knowledge base, and the PostgreSQL database to provide intelligent
voice-based customer service.

Customers call a Dayjoy phone number → Vapi answers, streams audio to
OpenAI for transcription + LLM reasoning → the LLM can call our tools
(function calling) to look up products, search the knowledge base,
create leads, book appointments, or escalate to a human → results are
spoken back to the caller and persisted to the Dayjoy database for
analytics + audit.

### Goals

- **Sub-5-second turn latency** from caller-end-of-utterance to assistant voice.
- **≥80% AI accuracy** on knowledge-base queries (no escalation).
- **Tenant isolation** — every call, transcript, and analytics row is scoped to a tenant.
- **Unconditional webhook signature verification** in production (no bypass).
- **Production-grade observability** — Prometheus metrics, Grafana dashboards, runbooks.

### Non-goals

- Replacing the WhatsApp / web chat assistant — Voice AI is one channel among several.
- General-purpose telephony (no IVR menus, no call queues beyond human handoff).
- On-device speech processing (we delegate STT + TTS to Vapi).

---

## 2. Architecture

```
Customer Call
       │
       ▼
Vapi (telephony + STT + TTS + LLM)
       │  Signed webhook events
       ▼
Backend Webhook (/api/voice/webhook)
       │
       ▼
Signature Verification (HMAC-SHA256, unconditional)
       │
       ▼
Event Router (call-started, call-ended, transcript, function-call)
       │
       ├──▶ Memory Layer (Redis session state + customer profile cache)
       │
       ├──▶ Tool Execution (8 tools with real backend integration)
       │         │
       │         ├──▶ RAG Search (knowledge base)
       │         ├──▶ ProductsService / CustomersService / DistributorsService
       │         └──▶ Prisma (leads, appointments, support tickets)
       │
       ├──▶ Flow Manager (7 conversation flows + LLM intent classifier)
       │
       └──▶ Analytics (call logger + tool tracker + AI metrics)
       │
       ▼
Response to Vapi
       │
       ▼
Customer (TTS)
```

### High-level sequence (inbound call)

1. Customer dials Dayjoy number → Vapi answers + streams audio to OpenAI.
2. Vapi fires `call-start` webhook → `VapiCallStartedHandler` creates
   `VoiceSession` + Redis session memory + (optional) `Conversation` row.
3. Vapi speaks the assistant's first message → Vapi fires `transcript`
   webhook (role=assistant) → `VapiTranscriptHandler` persists a
   `VoiceTranscript` row.
4. Customer speaks → Vapi transcribes → `transcript` webhook
   (role=user) → handler persists transcript + runs intent detection.
5. LLM decides to call a tool → Vapi fires `function-call` webhook →
   `VapiFunctionCallHandler` resolves session, executes tool via the
   registry, persists `AnalyticsEvent`, returns result synchronously.
6. Vapi speaks the response to the customer.
7. Steps 4–6 repeat until call ends.
8. Customer hangs up → Vapi fires `call-end` webhook →
   `VapiCallEndedHandler` updates `VoiceSession.status=ENDED`,
   creates `VoiceAnalytics` row, closes `Conversation`, extracts
   long-term memory, clears Redis session memory.

### Outbound call

1. Admin clicks "Call customer" in the dashboard → `POST /api/voice/calls`.
2. `VapiController.initiateCall()` calls `VapiClientService.createCall()`
   + immediately persists a `VoiceSession` row (status=ACTIVE,
   direction=OUTBOUND).
3. Vapi dials customer → rest is the same as inbound (from step 2).

---

## 3. Components

### 3.1 Vapi Client (`vapi/config/`)

| File | Role |
|------|------|
| `vapi-config.ts` | Env-based config (`VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, …) + validation. |
| `vapi-client-service.ts` | Wraps `@vapi-ai/sdk` `VapiClient` — assistant CRUD, call CRUD, webhook signature helper. Retry with exponential backoff. Degrades gracefully when `VAPI_API_KEY` is unset. |
| `vapi-assistant-config.ts` | The default assistant template (`VAPI_ASSISTANT_CONFIG`) — first message, model, voice, transcription model. |
| `vapi-config.module.ts` | Wires the `VapiClientService` + the `VAPI_CONFIG` token. |
| `vapi-database-schema.prisma` | Voice-specific Prisma models (`VoiceSession`, `VoiceTranscript`, `VoiceAnalytics`). |

### 3.2 Assistants (`vapi/assistants/`)

| File | Role |
|------|------|
| `vapi-assistant.service.ts` | Dual-track CRUD: writes to both Vapi (via `VapiClientService`) and the local `ai_agents` table. Assembles the system prompt (default = concatenation of the four prompt constants) + the tool list (default = all 8 registered tools). Soft-deletes (status=inactive). |
| `vapi-assistant.controller.ts` | REST CRUD at `/api/voice/assistants` (separate from the top-level `VapiController` to keep the auth boundary clear). |
| `create-assistant.dto.ts` | `class-validator` DTOs. |
| `vapi-assistant.service.spec.ts` | Unit tests for the service (mocked Vapi client + Prisma). |
| `vapi-master-system-prompt.md` | Markdown copy of the master prompt (the `.ts` version in `vapi/prompts/` is canonical). |

### 3.3 Prompts (`vapi/prompts/`)

| File | Role |
|------|------|
| `master-system-prompt.ts` | `MASTER_SYSTEM_PROMPT` — Sarah's identity, tone, hard rules. |
| `dayjoy-knowledge-prompt.ts` | `DAYJOY_KNOWLEDGE_PROMPT` — company knowledge (products, policies, compensation plan). |
| `rag-integration-prompt.ts` | `RAG_INTEGRATION_PROMPT` — instructions on when + how to call `search_knowledge`. |
| `escalation-protocols.ts` | `ESCALATION_PROTOCOLS` — when + how to escalate to a human. |
| `index.ts` | `buildDefaultSystemPrompt()` — concatenates the four constants into the single string sent to Vapi. |

### 3.4 Tools (`vapi/tools/`)

8 tools, each with real backend integration (no mocks in production):

| # | Tool name | Backend service | Purpose |
|---|-----------|-----------------|---------|
| 1 | `search_knowledge` | `KnowledgeService` (RAG) | Search the knowledge base; returns synthesised answer + citations. |
| 2 | `search_products` | `ProductsService` | Search the product catalog by name/SKU/category; returns up to 10 products. |
| 3 | `customer_lookup` | `CustomersService` | Look up a customer by phone/email; returns profile + lifetime stats. |
| 4 | `distributor_lookup` | `DistributorsService` | Look up a distributor by code/phone/email; returns tier + commission. |
| 5 | `create_lead` | `PrismaService` (creates `Lead`) | Capture a lead from a voice call; auto-links to existing customer. |
| 6 | `book_appointment` | `PrismaService` (creates `Appointment`) | Schedule an appointment; validates future date. |
| 7 | `create_support_ticket` | `PrismaService` (creates `SupportTicket` + `Interaction`) | Open a support ticket; persists contact info as an `Interaction` row. |
| 8 | `human_transfer` | `PrismaService` + `NotificationsService` | Escalate to a human — updates VoiceSession.status=TRANSFERRING, sends IN_APP notification to support team, writes audit Interaction. |

| File | Role |
|------|------|
| `vapi-tool-interface.ts` | `VapiTool` interface + `ToolContext` + `ToolResult`. |
| `vapi-tool-registry.service.ts` | Central registry — `execute(name, args, ctx)`, `has(name)`, `listTools()`, `getToolDefinitions()` (for Vapi's `tools` array on assistant creation). |
| `vapi-tools.module.ts` | Wires the 8 tools + the registry. Imports the backend modules each tool injects (`KnowledgeModule`, `ProductsModule`, `CustomersModule`, `DistributorsModule`, `NotificationsModule`). |
| `vapi-tools.spec.ts` | Real unit tests for all 8 tools — happy path + validation + error. |

Every tool implements:
```typescript
execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult>
```
The `ToolResult` includes a `speak` field — the natural-language text the
assistant reads aloud — separate from `data` (the machine-readable
payload the LLM can reason over).

### 3.5 Webhooks (`vapi/webhooks/`)

| File | Role |
|------|------|
| `vapi-webhook-controller.ts` | `POST /api/voice/webhook` — single HTTP entry point. `@Public()` (no JWT) but signature-verified. Reads `x-vapi-signature` + `x-vapi-timestamp` headers. |
| `vapi-webhook-service.ts` | Signature verification + idempotency (Redis SETNX) + audit (WebhookEvent row) + routing to typed handlers. |
| `vapi-call-started-handler.ts` | Creates `VoiceSession`, initialises Redis session memory, identifies caller via `VapiCustomerProfile.findByPhone`, creates `Conversation` row, builds personalised welcome message. |
| `vapi-call-ended-handler.ts` | Updates `VoiceSession.status=ENDED`, creates `VoiceAnalytics` row, closes `Conversation`, extracts long-term memory, clears Redis session. |
| `vapi-transcript-handler.ts` | Persists `VoiceTranscript` row per utterance; mirrors to `Message` table; runs lightweight intent detection on user turns; scans for escalation phrases. |
| `vapi-function-call-handler.ts` | Resolves session from Redis, executes the named tool via the registry, persists `AnalyticsEvent` (eventType=`tool_execution`), increments session tool-call counter. Returns synchronously (Vapi blocks waiting). |
| `vapi-webhooks.module.ts` | Wires the controller + service + 4 handlers. Imports `VapiMemoryModule` + `VapiAnalyticsModule`. |

### 3.6 Conversation Flows (`vapi/flows/`)

7 flows + a manager:

| Flow | Trigger | Steps |
|------|---------|-------|
| `VapiCustomerSupportFlow` | complaint, order issue, return, refund | greeting → gather_issue → lookup → propose → confirm → close |
| `VapiProductInquiryFlow` | product question, price, availability | greeting → gather_product_interest → search_product → present_product → handle_questions → close |
| `VapiDistributorSupportFlow` | commission, rank, downline, payout | greeting → verify_distributor → lookup → resolve → close |
| `VapiBusinessPlanFlow` | join, opportunity, compensation, starter kit | greeting → explain_opportunity → qualify_interest → gather_lead_info → schedule_appointment → close |
| `VapiAppointmentBookingFlow` | schedule, appointment, call back | collect_date_time → book → confirm |
| `VapiLeadCollectionFlow` | leave contact, more info, follow up | collect_info → create_lead → close |
| `VapiHumanEscalationFlow` | human, agent, manager, supervisor | summarise → transfer |

| File | Role |
|------|------|
| `vapi-flow-types.ts` | `FlowType` enum, `FlowState`, `FlowContext`, `FlowResponse`, `VapiFlow` interface, `IntentResult`. |
| `vapi-conversation-flow-manager.ts` | Intent detection (active-flow prior → heuristic fast path → LLM classifier fallback), flow state persistence (Redis), per-turn `processFlow()` orchestration. |
| `vapi-flows.module.ts` | Wires the manager + 7 flows. Imports `VapiMemoryModule`. |

Each flow is a stateless `@Injectable` — per-session state lives in
Redis session memory under `flowState`, not inside the flow class. This
makes the flows safe to share across concurrent calls.

### 3.7 Memory (`vapi/memory/`)

Three tiers:

1. **Session memory** (Redis, 24h TTL) — `VapiSessionMemory`.
   - Key layout: `vapi:session:{sessionId}` (JSON blob) +
     `vapi:call:{callId}:sessionId` (reverse lookup).
   - Critical for multi-replica deployments — Vapi's load balancer
     does not pin a call to one pod.
2. **Customer profile** (Postgres + Redis cache, 1h TTL) — `VapiCustomerProfile`.
   - Loads `Customer` + recent orders + `AiMemory` (FACT/PREFERENCE).
3. **Long-term memory** (Postgres `AiMemory`) — written via `VapiCustomerProfile.remember()`.
   - Extracted at call-end by `VapiCallEndedHandler`.

| File | Role |
|------|------|
| `vapi-memory-types.ts` | `SessionMemory`, `CustomerProfile`, `MemoryItem`, `MemoryContext`. |
| `vapi-session-memory.ts` | Redis-backed session blob: `init`, `get/set/merge`, `incrementToolCalls` (atomic), `getSessionIdByCallId`, `clear`. |
| `vapi-customer-profile.ts` | DB + Redis cache: `getProfile`, `findByPhone`, `remember` (writes `AiMemory`). |
| `vapi-memory-service.ts` | Orchestrator — delegates to the two above + exposes `getLongTermMemories`, `getRecentMessages`, `buildMemoryContext` (composite payload for the LLM). |
| `vapi-memory.module.ts` | Wires the three services. |

### 3.8 Analytics (`vapi/analytics/`)

| File | Role |
|------|------|
| `vapi-call-logger.ts` | Persists per-call `VoiceAnalytics` rows; aggregate `getCallStatistics()` (totalCalls, completion rate, handoff rate, avg duration, total cost). |
| `vapi-tool-usage-tracker.ts` | Aggregates `AnalyticsEvent` rows (`eventType=tool_execution`) into per-tool stats: execution count, success rate, avg latency, failing tools (<80% success). |
| `vapi-ai-metrics.ts` | AI-quality metrics — `recordAccuracy`, `recordCSAT`, `recordSentiment`, `markHallucination`. Aggregate `getOverallStatistics()` for the dashboard. |
| `vapi-analytics-dashboard.ts` | Composite dashboard payload — `{ calls, tools, ai, health }`. `health.status` = healthy / degraded / unhealthy. Generates operational recommendations. |
| `vapi-analytics.controller.ts` | REST endpoints under `/api/voice/analytics` — `dashboard`, `calls`, `calls/:sessionId`, `tools`, `ai`, `report`, `export` (JSON/CSV). |
| `vapi-analytics.module.ts` | Wires the 4 services + controller. |

---

## 4. Data Flow

### 4.1 Inbound Call Flow

1. Customer calls Vapi number.
2. Vapi sends `call-start` webhook.
3. Backend creates `VoiceSession` + `Conversation` records + Redis session memory.
4. Vapi answers + greets customer (assistant's first message).
5. Customer speaks → Vapi transcribes → sends `transcript` webhook.
6. Backend saves `VoiceTranscript` + `Message`.
7. Vapi's LLM decides to call a tool → sends `function-call` webhook.
8. Backend executes tool → returns result (synchronous — Vapi blocks waiting).
9. Vapi speaks response to customer.
10. Call ends → Vapi sends `call-end` webhook.
11. Backend creates `VoiceAnalytics` record, closes `Conversation`, extracts long-term memory, clears Redis session.

### 4.2 Outbound Call Flow

1. Admin initiates call via `POST /api/voice/calls`.
2. Backend calls `VapiClientService.createCall()` and immediately persists
   a `VoiceSession` (status=ACTIVE, direction=OUTBOUND) so the call is
   visible in the dashboard before the `call-start` webhook arrives.
3. Vapi dials customer → rest is identical to inbound (from step 2).

### 4.3 Function-call flow (synchronous)

```
Vapi (LLM decides tool) ──▶ function-call webhook ──▶ VapiFunctionCallHandler
                                                            │
                                                            ├─▶ sessionMemory.getByCallId(callId)
                                                            ├─▶ toolRegistry.execute(name, args, ctx)
                                                            ├─▶ prisma.analyticsEvent.create(...)
                                                            ├─▶ sessionMemory.incrementToolCalls(sessionId)
                                                            │
                                                            ▼
                                                       JSON result
                                                            │
                                          ◀─── HTTP 200 ────┘
Vapi ◀── speaks `result.speak` to customer
```

Latency budget: **5 seconds** end-to-end (Vapi's default timeout).
The `toolRegistry.execute` call is the dominant cost — RAG queries
typically take 200-500ms; product / customer / distributor lookups
<100ms; DB writes (lead/appointment/ticket) <50ms.

---

## 5. Security

### 5.1 Webhook Signature Verification

- **Algorithm:** HMAC-SHA256 using `VAPI_WEBHOOK_SECRET`.
- **Input:** `${timestamp}.${rawBody}` (Vapi convention).
- **Comparison:** `crypto.timingSafeEqual` (constant-time — prevents
  timing side-channel attacks). Length checked first because
  `timingSafeEqual` throws on unequal-length buffers.
- **Replay protection:** timestamps whose skew from the server clock
  exceeds 5 minutes are rejected.
- **UNCONDITIONAL in production** — no `NODE_ENV=development` bypass.
  The ONLY escape hatch is `NODE_ENV === 'test'` (used by the unit
  suite).
- **Failure mode:** `UnauthorizedException` when the secret is not
  configured (fail-closed). `false` from `verifySignature` when the
  signature doesn't match (controller returns 401).
- **Audit:** every webhook (verified or not) is logged; verified
  webhooks are persisted to `WebhookEvent` with raw payload +
  signature for forensic review.

### 5.2 API Authentication

- **JWT Bearer token** required on all REST endpoints (except the webhook).
- **RBAC permissions:**
  - `voice:read` — GET endpoints
  - `voice:create` — POST `/api/voice/calls`, POST `/api/voice/assistants`
  - `voice:update` — POST `/api/voice/calls/:id/end`, assistant updates
- **Rate limiting** — per-user rate limit on the REST API (configured
  at the gateway level).

### 5.3 Data Security

- **PII redaction in logs** — phone numbers and emails are masked in
  log output (e.g. `+1555***4567`).
- **Call recordings** — encrypted at rest by Vapi (managed by Vapi's
  Twilio backend). Recording URLs are time-limited signed links.
- **Tenant isolation** — every Prisma query is scoped by `tenantId`
  pulled from the JWT claim (REST API) or the resolved tenant from the
  inbound phone number (webhook).
- **No plaintext secrets** in K8s manifests — `ExternalSecrets` pulls
  `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` from the cloud secret store.

---

## 6. Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAPI_API_KEY` | ✅ | — | Vapi.ai API key. |
| `VAPI_WEBHOOK_SECRET` | ✅ | — | HMAC secret for webhook signature verification. |
| `VAPI_ASSISTANT_ID` | ❌ | — | Default Vapi assistant ID (used when caller doesn't specify one). |
| `VAPI_WEBHOOK_URL` | ✅ | — | Public URL Vapi should POST webhooks to (`https://api.dayjoy.ai/api/voice/webhook`). |
| `VAPI_VOICE_ID` | ❌ | `rachel` | TTS voice ID. |
| `VAPI_MODEL` | ❌ | `gpt-4o` | LLM model name. |
| `VAPI_DEFAULT_TENANT_ID` | ❌ | `default` | Fallback tenant when caller can't be identified. |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key (LLM + embeddings for intent detection + RAG). |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string. |
| `REDIS_URL` | ✅ | — | Redis connection string (session memory + idempotency). |
| `JWT_SECRET` | ✅ | — | JWT signing secret (REST API auth). |

See [`vapi/deployment/vapi-environment-config.env`](./deployment/vapi-environment-config.env)
for the complete reference.

### Vapi Dashboard Configuration

1. **Webhook URL:** `https://api.dayjoy.ai/api/voice/webhook`
2. **Webhook events:** `call.started`, `call.ended`, `call.transcript`,
   `function-call`.
3. **Phone number:** purchased in Vapi dashboard.
4. **Assistant:** created via `POST /api/voice/assistants` (recommended) or
   directly in the Vapi dashboard.
5. **Webhook secret:** generate a random 32+ byte secret, set as
   `VAPI_WEBHOOK_SECRET` in your env + in the Vapi dashboard.

---

## 7. Testing

### Test Types

1. **Unit tests** — each tool, flow, memory service. Dependencies
   mocked at the constructor boundary. Run with `vitest`.
2. **Integration tests** — webhook processing, tool execution.
3. **E2E tests** — full call lifecycle simulation (start → tool →
   transcript → end).
4. **Load tests** — 100 concurrent calls + tools + memory ops.
5. **RAG integration tests** — `search_knowledge` with mocked
   `KnowledgeService`.

### Test Files (`vapi/tests/`)

| File | Coverage |
|------|----------|
| `vapi-test-setup.ts` | Shared mocks + helpers (`createTestModule`, `createMockOpenAI`, `createMockVapiClient`, `computeValidVapiSignature`, …). |
| `vapi-tool-tests.ts` | All 8 tools — happy path + validation + error + voice formatting. |
| `vapi-flow-tests.ts` | All 7 flows + flow manager — intent detection + state transitions + escalation triggers. |
| `vapi-memory-tests.ts` | Session memory + customer profile + memory service — full CRUD + cache lifecycle. |
| `vapi-webhook-tests.ts` | Signature verification (valid/invalid/replay/test-bypass/dev-no-bypass) + event routing + idempotency. |
| `vapi-e2e-tests.ts` | Full call lifecycle: start → tool → transcript → end-to-end. |
| `vapi-load-tests.ts` | 100 concurrent calls + tools + memory ops (race conditions, idempotency). |
| `vapi-rag-integration-tests.ts` | `search_knowledge` + citations + escalation + topK + tenant scoping + error paths. |
| `vapi-voice-test-cases.ts` | 12 canonical voice scenarios (table-driven) — intent + response shape. |

Plus the in-place spec: `vapi/tools/vapi-tools.spec.ts` and
`vapi/assistants/vapi-assistant.service.spec.ts`.

### Running

```bash
# All Vapi tests
pnpm vitest run vapi/

# Specific suite
pnpm vitest run vapi/tests/vapi-tool-tests.ts
pnpm vitest run vapi/tests/vapi-webhook-tests.ts
pnpm vitest run vapi/tests/vapi-e2e-tests.ts
pnpm vitest run vapi/tests/vapi-load-tests.ts
```

---

## 8. Deployment

### Docker

- `vapi/deployment/Dockerfile` — multi-stage build (build → runtime).
- `vapi/deployment/vapi-docker-config.yml` — Docker Compose for
  local / staging (backend + Postgres + Redis + the voice worker).

### Kubernetes

- `vapi/deployment/vapi-kubernetes-manifests.yml` — Deployment,
  Service, HPA (autoscaling on CPU + request count), PDB (min
  available 2), Ingress, NetworkPolicy, ServiceMonitor (Prometheus).
- Uses **ExternalSecrets** — no plaintext secrets in manifests.
- 3 replicas minimum (rolling update strategy).

### Production Checklist

`vapi/deployment/vapi-production-checklist.md` — 200+ checkboxes covering:
- Secrets management
- Database migrations
- Redis setup + persistence
- Vapi dashboard configuration (phone number, webhook URL, assistant)
- DNS + TLS
- Monitoring (Prometheus scrape, Grafana dashboards, alert rules)
- Runbook documentation
- Load test pass
- Security review (signature verification, RBAC, tenant isolation)
- Backup + disaster recovery

---

## 9. Monitoring

### Metrics (Prometheus)

| Metric | Type | Labels |
|--------|------|--------|
| `voice_calls_total` | counter | `tenant_id`, `outcome`, `direction` |
| `voice_call_duration_seconds` | histogram | `tenant_id` |
| `voice_tool_calls_total` | counter | `tenant_id`, `tool_name`, `success` |
| `voice_tool_latency_seconds` | histogram | `tenant_id`, `tool_name` |
| `voice_ai_accuracy_score` | gauge | `tenant_id` |
| `voice_customer_satisfaction` | gauge | `tenant_id` |
| `voice_webhook_signature_failures_total` | counter | (no labels) |
| `voice_escalation_total` | counter | `tenant_id`, `department` |

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High call failure rate | `rate(voice_calls_total{outcome="FAILED"}[5m]) / rate(voice_calls_total[5m]) > 0.10` | critical |
| High response latency | `histogram_quantile(0.95, voice_tool_latency_seconds) > 5` | warning |
| Low AI accuracy | `voice_ai_accuracy_score < 80` | warning |
| Webhook signature failures | `increase(voice_webhook_signature_failures_total[5m]) > 0` | critical |
| Escalation queue overflow | `voice_escalation_total[5m] > 50` | warning |

### Dashboards (Grafana)

- **Voice AI Overview** — call volume, success rate, active calls, top issues.
- **Call Analytics** — duration distribution, outcome breakdown, cost trend.
- **Tool Usage** — per-tool execution count, success rate, latency heatmap.
- **AI Performance** — accuracy trend, CSAT trend, hallucination rate.

See [`vapi/docs/vapi-monitoring-checklist.md`](./docs/vapi-monitoring-checklist.md)
for the full setup guide.

---

## 10. Documentation

| Doc | Audience | Purpose |
|-----|----------|---------|
| `vapi/README.md` | Developers | Quickstart + folder structure + setup. |
| `vapi/docs/vapi-README.md` | Developers | Comprehensive module README (418 lines). |
| `vapi/docs/vapi-api-documentation.md` | API consumers | REST endpoint reference (request/response shapes, examples). |
| `vapi/docs/vapi-user-guide.md` | Operators | How to operate the voice AI (assistants, calls, analytics). |
| `vapi/docs/vapi-runbooks.md` | On-call | Step-by-step runbooks for common incidents. |
| `vapi/docs/vapi-troubleshooting-guide.md` | Everyone | Common issues + solutions. |
| `vapi/docs/vapi-architecture.md` | Architects | Architecture deep-dive with sequence diagrams. |
| `vapi/docs/vapi-monitoring-checklist.md` | SRE | Monitoring setup guide. |
| `vapi/docs/vapi-quick-start.md` | New developers | 5-minute quickstart. |
| `vapi/docs/vapi-module-*-setup-guide.md` | Module owners | Per-module setup guides (9 modules). |
| `vapi/deployment/vapi-production-checklist.md` | Release engineers | Pre-deployment checklist (200+ items). |
| `vapi/VOICE_AI_DESIGN.md` (this file) | Everyone | End-to-end design document. |

---

## 11. References

- Architecture: `docs/architecture/05_VOICE_AI_ARCHITECTURE.md`
- AI Design: `docs/ai/AI_DESIGN_SUMMARY.md`
- Conversation Design: `docs/conversation-design/`
- Tool Design: `docs/tool-design/`
- Backend: `backend/BACKEND_DESIGN.md`
- Vapi SDK docs: https://docs.vapi.ai
- OpenAI function calling: https://platform.openai.com/docs/guides/function-calling
