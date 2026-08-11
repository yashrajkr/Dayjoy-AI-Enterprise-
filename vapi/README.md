# Dayjoy Voice AI (Vapi)

> Production-grade voice AI for the Dayjoy AI Enterprise platform.
> Handles inbound + outbound calls, routes customer intent through 7
> conversation flows, executes 8 tools (knowledge search, product
> lookup, lead capture, etc.), and persists every interaction for
> analytics + audit.

**Version:** 2.0.0  •  **Status:** Production-ready  •  **Owner:** Voice AI Platform Team

---

## Overview

The Vapi module wraps the [Vapi.ai](https://vapi.ai) cloud telephony
platform and adds Dayjoy-specific business logic on top. Customers
call a Dayjoy phone number → Vapi streams the audio to OpenAI for
transcription + LLM → the LLM can call our tools (function calling)
to look up products, search the knowledge base, create leads, book
appointments, or escalate to a human → results are spoken back to the
caller and persisted to the Dayjoy database for analytics.

For the full design (architecture, data flow, security model,
deployment, monitoring), see
[`VOICE_AI_DESIGN.md`](./VOICE_AI_DESIGN.md).

---

## Folder Structure

```
vapi/
├── README.md                       # This file (quickstart + overview)
├── VOICE_AI_DESIGN.md              # Comprehensive design document
├── vapi.module.ts                  # Root NestJS module (imports all sub-modules)
├── vapi.controller.ts              # Top-level REST API (calls, sessions, assistants, analytics)
│
├── config/                         # Vapi client + assistant config
│   ├── vapi-config.ts
│   ├── vapi-config.module.ts
│   ├── vapi-client-service.ts
│   ├── vapi-assistant-config.ts
│   ├── vapi.module.ts              # Backward-compat re-export
│   └── vapi-database-schema.prisma
│
├── assistants/                     # System prompts + assistant CRUD
│   ├── vapi-assistant.service.ts
│   ├── vapi-assistant.controller.ts
│   ├── vapi-assistant.service.spec.ts
│   ├── vapi-assistants.module.ts
│   ├── create-assistant.dto.ts
│   └── *.md                        # Prompt markdown mirrors
│
├── prompts/                        # Prompt templates (TypeScript constants)
│   ├── master-system-prompt.ts
│   ├── dayjoy-knowledge-prompt.ts
│   ├── rag-integration-prompt.ts
│   ├── escalation-protocols.ts
│   └── index.ts
│
├── tools/                          # 8 function-calling tools + registry
│   ├── vapi-tool-interface.ts
│   ├── vapi-tool-registry.service.ts
│   ├── vapi-search-knowledge-tool.ts
│   ├── vapi-search-products-tool.ts
│   ├── vapi-customer-lookup-tool.ts
│   ├── vapi-distributor-lookup-tool.ts
│   ├── vapi-lead-capture-tool.ts
│   ├── vapi-appointment-booking-tool.ts
│   ├── vapi-support-ticket-tool.ts
│   ├── vapi-human-transfer-tool.ts
│   ├── vapi-tools.module.ts
│   └── vapi-tools.spec.ts
│
├── flows/                          # 7 conversation flows + manager
│   ├── vapi-flow-types.ts
│   ├── vapi-conversation-flow-manager.ts
│   ├── vapi-customer-support-flow.ts
│   ├── vapi-product-inquiry-flow.ts
│   ├── vapi-distributor-support-flow.ts
│   ├── vapi-business-plan-flow.ts
│   ├── vapi-appointment-booking-flow.ts
│   ├── vapi-lead-collection-flow.ts
│   ├── vapi-human-escalation-flow.ts
│   └── vapi-flows.module.ts
│
├── memory/                         # Session + customer memory
│   ├── vapi-memory-types.ts
│   ├── vapi-session-memory.ts           (Redis, 24h TTL)
│   ├── vapi-customer-profile.ts         (DB + Redis cache, 1h TTL)
│   ├── vapi-memory-service.ts           (orchestrator)
│   └── vapi-memory.module.ts
│
├── webhooks/                       # Vapi webhook handlers
│   ├── vapi-webhook-controller.ts
│   ├── vapi-webhook-service.ts          (signature verify + idempotency + routing)
│   ├── vapi-call-started-handler.ts
│   ├── vapi-call-ended-handler.ts
│   ├── vapi-transcript-handler.ts
│   ├── vapi-function-call-handler.ts
│   └── vapi-webhooks.module.ts
│
├── analytics/                      # Call + tool analytics
│   ├── vapi-analytics-types.ts
│   ├── vapi-call-logger.ts
│   ├── vapi-tool-usage-tracker.ts
│   ├── vapi-ai-metrics.ts
│   ├── vapi-analytics-dashboard.ts
│   ├── vapi-analytics.controller.ts
│   └── vapi-analytics.module.ts
│
├── tests/                          # Vitest test suite (9 files)
│   ├── vapi-test-setup.ts
│   ├── vapi-tool-tests.ts
│   ├── vapi-flow-tests.ts
│   ├── vapi-memory-tests.ts
│   ├── vapi-webhook-tests.ts
│   ├── vapi-e2e-tests.ts
│   ├── vapi-load-tests.ts
│   ├── vapi-rag-integration-tests.ts
│   └── vapi-voice-test-cases.ts
│
├── deployment/                     # Production deployment
│   ├── Dockerfile
│   ├── vapi-docker-config.yml
│   ├── vapi-kubernetes-manifests.yml
│   ├── vapi-environment-config.env
│   └── vapi-production-checklist.md
│
└── docs/                           # Documentation (20 files)
    ├── vapi-README.md              # Comprehensive module README (418 lines)
    ├── vapi-api-documentation.md
    ├── vapi-user-guide.md
    ├── vapi-runbooks.md
    ├── vapi-troubleshooting-guide.md
    ├── vapi-architecture.md
    ├── vapi-monitoring-checklist.md
    ├── vapi-quick-start.md
    ├── vapi-complete-file-list.md
    ├── vapi-complete-implementation-summary.md
    ├── vapi-final-implementation-summary.md
    ├── vapi-all-63-files-confirmed.md
    ├── FILE_MANAGEMENT_GUIDE.md
    └── vapi-module-{1..9}-setup-guide.md
```

---

## Setup

### Prerequisites

- Node.js 20+ / pnpm 9+
- PostgreSQL 15+ with pgvector extension
- Redis 7+
- A Vapi.ai account (free trial available)
- An OpenAI API key

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp vapi/deployment/vapi-environment-config.env .env
# Edit .env and fill in:
#   VAPI_API_KEY
#   VAPI_WEBHOOK_SECRET
#   VAPI_ASSISTANT_ID
#   OPENAI_API_KEY
#   DATABASE_URL
#   REDIS_URL
#   JWT_SECRET
```

### 3. Set up the database

```bash
# Apply the voice tables to your existing Prisma schema
cat vapi/config/vapi-database-schema.prisma >> prisma/schema.prisma

# Push the schema
pnpm prisma db push

# Generate the Prisma client
pnpm prisma generate
```

### 4. Configure the Vapi dashboard

1. Log in to https://dashboard.vapi.ai
2. Create an assistant (or use `POST /api/voice/assistants`)
3. Configure the webhook URL: `https://<your-domain>/api/voice/webhook`
4. Subscribe to events: `call.started`, `call.ended`, `call.transcript`, `function-call`
5. Generate a webhook secret and set it as `VAPI_WEBHOOK_SECRET` in your `.env`
6. Purchase or port a phone number

### 5. Run the service

```bash
# Development
pnpm --filter backend dev

# Production (Docker)
docker compose -f vapi/deployment/vapi-docker-config.yml up -d
```

### 6. Verify

```bash
# Health check
curl http://localhost:3001/health/ready

# Place a test outbound call (requires JWT auth)
curl -X POST http://localhost:3001/api/voice/calls \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+15551234567","assistantId":"asst_xxx"}'
```

---

## Configuration

All configuration is via environment variables. See
[`vapi/deployment/vapi-environment-config.env`](./deployment/vapi-environment-config.env)
for the complete reference. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPI_API_KEY` | ✅ | Vapi.ai API key |
| `VAPI_WEBHOOK_SECRET` | ✅ | HMAC secret for webhook signature verification |
| `VAPI_ASSISTANT_ID` | ❌ | The Vapi assistant ID to use for calls |
| `VAPI_WEBHOOK_URL` | ✅ | Public URL Vapi should POST webhooks to |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (LLM + embeddings) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (REST API auth) |
| `VAPI_VOICE_ID` | ❌ | Voice ID (default: `rachel`) |
| `VAPI_MODEL` | ❌ | LLM model (default: `gpt-4o`) |

---

## API Endpoints

All endpoints (except the webhook) require JWT authentication + the
appropriate `voice:*` permission.

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `POST` | `/api/voice/calls` | `voice:create` | Initiate outbound call |
| `GET` | `/api/voice/calls` | `voice:read` | List calls (paginated) |
| `GET` | `/api/voice/calls/:id` | `voice:read` | Get call details (transcripts, analytics) |
| `POST` | `/api/voice/calls/:id/end` | `voice:update` | End an active call |
| `GET` | `/api/voice/calls/:id/recording` | `voice:read` | Get recording URL |
| `GET` | `/api/voice/sessions/active` | `voice:read` | List active (in-progress) sessions |
| `GET` | `/api/voice/assistants` | `voice:read` | List Vapi assistants |
| `POST` | `/api/voice/assistants` | `voice:create` | Create a Vapi assistant |
| `GET` | `/api/voice/analytics/dashboard` | `voice:read` | Aggregated dashboard metrics |
| `GET` | `/api/voice/analytics/calls` | `voice:read` | Paginated call analytics |
| `GET` | `/api/voice/analytics/tools` | `voice:read` | Tool usage stats |
| `POST` | `/api/voice/webhook` | (HMAC) | Vapi webhook receiver — public |

Full API reference: [`docs/vapi-api-documentation.md`](./docs/vapi-api-documentation.md)

---

## Webhook Events

The webhook endpoint (`POST /api/voice/webhook`) receives signed
events from Vapi. Every request must include `x-vapi-signature` and
`x-vapi-timestamp` headers — signature verification is **unconditional**
in production (no `NODE_ENV=development` bypass; the only escape hatch
is `NODE_ENV === 'test'`).

| Event | Trigger | Handler |
|-------|---------|---------|
| `call.started` | Vapi answers an inbound call or initiates an outbound call | `VapiCallStartedHandler` — creates VoiceSession |
| `call.ended` | Call ends (customer hangs up, timeout, or manual end) | `VapiCallEndedHandler` — updates session, creates VoiceAnalytics |
| `call.transcript` | New transcript segment (user or assistant) | `VapiTranscriptHandler` — saves VoiceTranscript row |
| `function-call` | LLM wants to call a tool | `VapiFunctionCallHandler` — executes the tool, returns result to Vapi |

---

## Testing

The test suite uses [Vitest](https://vitest.dev) with shared mocks
from `backend/_shared/testing/`.

### Run all Vapi tests

```bash
pnpm vitest run vapi/
```

### Run a specific suite

```bash
pnpm vitest run vapi/tests/vapi-tool-tests.ts
pnpm vitest run vapi/tests/vapi-webhook-tests.ts
pnpm vitest run vapi/tests/vapi-e2e-tests.ts
pnpm vitest run vapi/tests/vapi-load-tests.ts
```

### Test files

| File | Coverage |
|------|----------|
| `vapi-test-setup.ts` | Shared mocks + helpers |
| `vapi-tool-tests.ts` | All 8 tools — happy path + validation + error |
| `vapi-flow-tests.ts` | All 7 flows + flow manager — intent detection + state transitions |
| `vapi-memory-tests.ts` | Session + customer profile + memory service lifecycle |
| `vapi-webhook-tests.ts` | Signature verification (valid/invalid/replay) + 4 event handlers + idempotency |
| `vapi-e2e-tests.ts` | Full call lifecycle: start → tool → transcript → end |
| `vapi-load-tests.ts` | 100 concurrent calls + tools + memory ops (race conditions) |
| `vapi-rag-integration-tests.ts` | search_knowledge + citations + hallucination checks |
| `vapi-voice-test-cases.ts` | 12 canonical voice scenarios (table-driven) |

Plus in-place specs: `vapi/tools/vapi-tools.spec.ts`,
`vapi/assistants/vapi-assistant.service.spec.ts`.

---

## Deployment

### Docker Compose (staging)

```bash
docker compose -f vapi/deployment/vapi-docker-config.yml up -d
```

### Kubernetes (production)

```bash
kubectl apply -f vapi/deployment/vapi-kubernetes-manifests.yml
```

See:
- [`deployment/vapi-production-checklist.md`](./deployment/vapi-production-checklist.md) — pre-deployment checklist (200+ items)
- [`deployment/vapi-docker-config.yml`](./deployment/vapi-docker-config.yml) — Docker Compose
- [`deployment/vapi-kubernetes-manifests.yml`](./deployment/vapi-kubernetes-manifests.yml) — K8s manifests
- [`deployment/Dockerfile`](./deployment/Dockerfile) — multi-stage build

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [`VOICE_AI_DESIGN.md`](./VOICE_AI_DESIGN.md) | Comprehensive end-to-end design document |
| [`docs/vapi-README.md`](./docs/vapi-README.md) | Comprehensive module README (418 lines) |
| [`docs/vapi-api-documentation.md`](./docs/vapi-api-documentation.md) | REST API reference |
| [`docs/vapi-user-guide.md`](./docs/vapi-user-guide.md) | Operator user guide |
| [`docs/vapi-runbooks.md`](./docs/vapi-runbooks.md) | On-call runbooks |
| [`docs/vapi-troubleshooting-guide.md`](./docs/vapi-troubleshooting-guide.md) | Troubleshooting guide |
| [`docs/vapi-architecture.md`](./docs/vapi-architecture.md) | Architecture deep-dive |
| [`docs/vapi-monitoring-checklist.md`](./docs/vapi-monitoring-checklist.md) | Monitoring setup |
| [`docs/vapi-quick-start.md`](./docs/vapi-quick-start.md) | 5-minute quickstart |

---

## Contributing

1. Pick an issue from the Voice AI board
2. Create a feature branch (`feat/voice-ai/<short-desc>`)
3. Write code + tests (every PR must include tests)
4. Run `pnpm vitest run vapi/` — all tests must pass
5. Run `pnpm lint` — no new warnings
6. Open a PR with a description linking the issue
7. Request review from the Voice AI Platform Team

---

## License

Proprietary — Dayjoy AI. See `LICENSE` in the repo root.
