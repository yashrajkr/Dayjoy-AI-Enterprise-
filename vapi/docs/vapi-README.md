# Dayjoy Voice AI — Vapi Module

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
to look up products, create leads, book appointments, or escalate to
a human → results are spoken back to the caller and persisted to the
Dayjoy database for analytics.

### Architecture Diagram (ASCII)

```
                          ┌─────────────────────────────┐
                          │       Customer Phone        │
                          └──────────────┬──────────────┘
                                         │
                                         │ PSTN call
                                         ▼
                          ┌─────────────────────────────┐
                          │     Vapi Cloud (Twilio)     │
                          │  • Audio streaming          │
                          │  • STT (Deepgram)           │
                          │  • TTS (ElevenLabs)         │
                          └──────────────┬──────────────┘
                                         │
                  ┌──────────────────────┴───────────────────────┐
                  │ Webhook events (HMAC-SHA256 signed)           │
                  │  call.started | call.ended | call.transcript  │
                  │  function-call                                 │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                  Dayjoy Backend (NestJS)                        │
   │                                                                 │
   │  ┌─────────────────┐   ┌─────────────────┐   ┌───────────────┐ │
   │  │  VapiWebhook    │   │  Flow Manager   │   │  Memory       │ │
   │  │  Controller     │──▶│  (7 flows)      │──▶│  Service      │ │
   │  │  + Service      │   │                 │   │  (Redis)      │ │
   │  └─────────────────┘   └─────────────────┘   └───────────────┘ │
   │           │                     │                     │         │
   │           ▼                     ▼                     ▼         │
   │  ┌─────────────────┐   ┌─────────────────┐   ┌───────────────┐ │
   │  │  Function Call  │   │  Vapi Tools (8) │   │  Analytics    │ │
   │  │  Handler        │──▶│                 │   │  Dashboard    │ │
   │  └─────────────────┘   └─────────────────┘   └───────────────┘ │
   │           │                     │                              │
   │           │                     ▼                              │
   │           │             ┌─────────────────┐                    │
   │           │             │  RAG Pipeline   │                    │
   │           │             │  (knowledge)    │                    │
   │           │             └─────────────────┘                    │
   │           ▼                                                    │
   │  ┌─────────────────────────────────────────────────────────┐  │
   │  │                PostgreSQL (pgvector)                    │  │
   │  │  voice_sessions | voice_transcripts | voice_analytics   │  │
   │  │  tool_executions | customers | leads | appointments     │  │
   │  └─────────────────────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────────────────────┘
                                         │
                                         │ function-call result
                                         ▼
                          ┌─────────────────────────────┐
                          │     Vapi Cloud → TTS        │
                          │     → Customer hears reply  │
                          └─────────────────────────────┘
```

### High-level data flow

1. **Inbound call** — Vapi answers, streams audio to OpenAI, fires `call.started` webhook.
2. **Session init** — Backend creates `VoiceSession` row + Redis memory session.
3. **User speaks** — Vapi transcribes + sends `call.transcript` webhook. Backend persists `VoiceTranscript` row.
4. **Tool call** — When the LLM wants external data, Vapi fires `function-call` webhook. Backend executes the named tool (which may call RAG / DB / external APIs) and returns the result.
5. **AI responds** — Vapi speaks the LLM response, fires another `call.transcript` webhook (assistant role).
6. **Call ends** — Vapi fires `call.ended` webhook. Backend updates `VoiceSession`, creates `VoiceAnalytics` row.

---

## Folder Structure

```
vapi/
├── vapi.controller.ts              # Top-level REST API (calls, sessions, analytics)
├── vapi.module.ts                  # NestJS module wiring (Agent 3/4 owns)
│
├── config/                         # Vapi client + assistant config (Agent 3)
│   ├── vapi.config.ts
│   ├── vapi-client-service.ts
│   ├── vapi-assistant-config.ts
│   ├── vapi.module.ts
│   └── vapi-database-schema.prisma
│
├── assistants/                     # System prompts (Agent 3)
│   ├── vapi-master-system-prompt.md
│   ├── vapi-dayjoy-knowledge-prompt.md
│   ├── vapi-rag-integration-prompt.md
│   ├── vapi-conversation-flows.md
│   └── vapi-escalation-protocols.md
│
├── prompts/                        # Prompt templates (Agent 3)
│
├── tools/                          # Function-calling tools (Agent 3)
│   ├── vapi-tool-interface.ts
│   ├── vapi-search-knowledge-tool.ts
│   ├── vapi-search-products-tool.ts
│   ├── vapi-customer-lookup-tool.ts
│   ├── vapi-distributor-lookup-tool.ts
│   ├── vapi-lead-capture-tool.ts
│   ├── vapi-appointment-booking-tool.ts
│   ├── vapi-support-ticket-tool.ts
│   └── vapi-human-transfer-tool.ts
│
├── flows/                          # Conversation flows (Agent 4)
│   ├── vapi-flow-types.ts
│   ├── vapi-conversation-flow-manager.ts
│   ├── vapi-customer-support-flow.ts
│   ├── vapi-product-inquiry-flow.ts
│   └── vapi-business-opportunity-flow.ts
│
├── memory/                         # Session + customer memory (Agent 4)
│   ├── vapi-memory-types.ts
│   ├── vapi-memory-service.ts
│   ├── vapi-session-memory.ts
│   └── vapi-customer-profile.ts
│
├── webhooks/                       # Vapi webhook handlers (Agent 4)
│   ├── vapi-webhook-controller.ts
│   ├── vapi-webhook-service.ts
│   ├── vapi-call-started-handler.ts
│   ├── vapi-call-ended-handler.ts
│   ├── vapi-transcript-handler.ts
│   └── vapi-function-call-handler.ts
│
├── analytics/                      # Call + tool analytics (Agent 4)
│   ├── vapi-analytics-types.ts
│   ├── vapi-analytics-dashboard.ts
│   ├── vapi-call-logger.ts
│   ├── vapi-tool-usage-tracker.ts
│   └── vapi-ai-metrics.ts
│
├── tests/                          # Test suite (this agent)
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
│   ├── vapi-production-checklist.md
│   ├── vapi-environment-config.env
│   ├── vapi-docker-config.yml
│   ├── vapi-kubernetes-manifests.yml
│   └── Dockerfile
│
└── docs/                           # Documentation
    ├── vapi-README.md              (this file)
    ├── vapi-api-documentation.md
    ├── vapi-user-guide.md
    ├── vapi-runbooks.md
    ├── vapi-troubleshooting-guide.md
    ├── vapi-architecture.md
    └── vapi-monitoring-checklist.md
```

---

## Setup Guide

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ with pgvector extension
- Redis 7+
- A Vapi.ai account (free trial available)
- An OpenAI API key

### 1. Clone + install

```bash
git clone <repo-url>
cd dayjoy-ai-enterprise
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
[`vapi/deployment/vapi-environment-config.env`](../deployment/vapi-environment-config.env)
for the complete reference. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPI_API_KEY` | ✅ | Vapi.ai API key |
| `VAPI_WEBHOOK_SECRET` | ✅ | HMAC secret for webhook signature verification |
| `VAPI_ASSISTANT_ID` | ✅ | The Vapi assistant ID to use for calls |
| `VAPI_WEBHOOK_URL` | ✅ | Public URL Vapi should POST webhooks to |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (for LLM + embeddings) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (for REST API auth) |
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

Full API reference: [`vapi-api-documentation.md`](vapi-api-documentation.md)

---

## Webhook Events

The webhook endpoint (`POST /api/voice/webhook`) receives signed
events from Vapi. Every request must include `x-vapi-signature` and
`x-vapi-timestamp` headers — signature verification is **unconditional**
in production.

| Event | Trigger | Handler |
|-------|---------|---------|
| `call.started` | Vapi answers an inbound call or initiates an outbound call | `CallStartedHandler` — creates VoiceSession |
| `call.ended` | Call ends (customer hangs up, timeout, or manual end) | `CallEndedHandler` — updates session, creates VoiceAnalytics |
| `call.transcript` | New transcript segment (user or assistant) | `TranscriptHandler` — saves VoiceTranscript row |
| `function-call` | LLM wants to call a tool (search_knowledge, etc.) | `FunctionCallHandler` — executes the tool, returns result to Vapi |

---

## Testing

The test suite uses [Vitest](https://vitest.dev) with shared mocks
from `backend/_shared/testing/`.

### Run all Vapi tests

```bash
# From the repo root
pnpm vitest run vapi/tests/
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
| `vapi-test-setup.ts` | Shared mocks + helpers (createTestModule, createMockOpenAI, createMockVapiClient, ...) |
| `vapi-tool-tests.ts` | All 8 tools — happy path + validation + error |
| `vapi-flow-tests.ts` | All 7 conversation flows — intent detection + state transitions |
| `vapi-memory-tests.ts` | Session + customer profile + memory item lifecycle |
| `vapi-webhook-tests.ts` | Signature verification (valid/invalid/replay) + 4 event handlers + idempotency |
| `vapi-e2e-tests.ts` | Full call lifecycle: start → message → tool → transcript → end |
| `vapi-load-tests.ts` | 100 concurrent calls + tools + memory ops (race conditions) |
| `vapi-rag-integration-tests.ts` | search_knowledge + citations + hallucination checks |
| `vapi-voice-test-cases.ts` | 12 canonical voice scenarios (table-driven) |

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
- [`vapi-production-checklist.md`](../deployment/vapi-production-checklist.md) — pre-deployment checklist
- [`vapi-docker-config.yml`](../deployment/vapi-docker-config.yml) — Docker Compose
- [`vapi-kubernetes-manifests.yml`](../deployment/vapi-kubernetes-manifests.yml) — K8s manifests
- [`Dockerfile`](../deployment/Dockerfile) — multi-stage build

---

## Troubleshooting

See [`vapi-troubleshooting-guide.md`](vapi-troubleshooting-guide.md) for
common issues + solutions.

For operations, see [`vapi-runbooks.md`](vapi-runbooks.md).

For monitoring setup, see [`vapi-monitoring-checklist.md`](vapi-monitoring-checklist.md).

---

## Architecture

For detailed architecture diagrams + sequence diagrams, see
[`vapi-architecture.md`](vapi-architecture.md).

---

## Contributing

1. Pick an issue from the Voice AI board
2. Create a feature branch (`feat/voice-ai/<short-desc>`)
3. Write code + tests (every PR must include tests)
4. Run `pnpm vitest run vapi/tests/` — all tests must pass
5. Run `pnpm lint` — no new warnings
6. Open a PR with a description linking the issue
7. Request review from the Voice AI Platform Team

---

## License

Proprietary — Dayjoy AI. See `LICENSE` in the repo root.
