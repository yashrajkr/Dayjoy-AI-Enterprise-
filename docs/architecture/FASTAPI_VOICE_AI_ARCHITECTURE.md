# Enterprise Voice AI Platform — Architecture

> Stage 2 Step 3 — Production-grade voice AI with streaming STT → AI → TTS,
> multi-tenant configuration, Vapi integration, and real-time WebSocket streaming.

## 1. Overview

The Voice AI platform connects customer voice calls to the AI Provider Layer
(Stage 2 Step 1) and RAG system (Stage 2 Step 2) in real time. Each tenant
can configure its own voice, greeting, language, AI prompt, business hours,
escalation policy, and knowledge base — no hardcoded company settings.

### Key properties

| Property | How it's enforced |
|---|---|
| **Multi-tenancy** | Every table has `organization_id`; every API call resolves org from JWT; webhook handlers resolve org from `call_sid` → session lookup. |
| **Provider abstraction** | `VoiceProvider` abstract base + Vapi implementation. Switching providers = 1 env var change (`VOICE_PROVIDER`). |
| **Streaming** | WebSocket at `/api/v1/voice/stream/{session_id}` streams AI response chunks in real time. |
| **Barge-in** | Caller interrupting assistant aborts the current TTS synthesis + AI generation. |
| **Hallucination prevention** | Inherits from RAG pipeline — low-confidence responses trigger fallback or escalation. |
| **Webhook security** | HMAC-SHA256 signature verification + optional shared secret. All webhooks logged for audit. |
| **Per-tenant config** | VoiceAssistant (greeting, prompt, voice, language, escalation) + VoiceSettings (provider, defaults). |

## 2. Architecture diagram

```
                         ┌──────────────────────┐
                         │   Customer Phone     │
                         │  (PSTN / VoIP / Web) │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Voice Provider     │
                         │   (Vapi / Retell /   │
                         │    Bland / LiveKit)  │
                         │   STT + TTS + Telephony
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │ Webhook         │ WebSocket       │
                  │ (call events,   │ (live UI        │
                  │  transcripts)   │  updates)       │
                  ▼                 ▼                 │
┌─────────────────────────────────────────────────────┴───────┐
│                      FastAPI Backend                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  VoiceService                           │ │
│  │  ┌──────────────────┐  ┌────────────────────────────┐  │ │
│  │  │ SessionManager   │  │ ConversationService         │  │ │
│  │  │ (call lifecycle) │  │ (STT → AI → TTS per turn)   │  │ │
│  │  └────────┬─────────┘  └────────────┬───────────────┘  │ │
│  └───────────┼─────────────────────────┼──────────────────┘ │
│              │                         │                     │
│  ┌───────────▼─────────┐  ┌───────────▼─────────────────┐  │
│  │ VoiceProvider       │  │ AIGateway (Stage 2 Step 1)  │  │
│  │ (Vapi / Retell /    │  │ + LLM Gateway               │  │
│  │  Bland / LiveKit /  │  │ + RAG Pipeline              │  │
│  │  Pipecat)           │  │   (Stage 2 Step 2)          │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
│              │                                                │
│  ┌───────────▼──────────────────────────────────────────┐   │
│  │   PostgreSQL (voice_sessions, voice_messages,         │   │
│  │   voice_assistants, voice_settings, voice_analytics,  │   │
│  │   voice_providers, call_events, voice_webhook_logs)   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 3. Database schema (Stage 2 Step 3 — migration 0009)

| Table | Purpose | Tenant isolation |
|---|---|---|
| `voice_assistants` | Per-tenant assistant configs (greeting, prompt, voice, escalation) | `organization_id` |
| `voice_settings` | Per-tenant global voice config (provider, defaults, webhook) | `organization_id` (unique) |
| `voice_sessions` | Live + historical call sessions (call SID, status, timing) | `organization_id` |
| `voice_messages` | Streaming transcript segments (caller / assistant, real-time) | `organization_id` |
| `voice_analytics` | Per-call aggregate metrics (latency, interruptions, talk time) | `organization_id` |
| `voice_providers` | Registered provider configurations (Vapi, Retell, etc.) | `organization_id` |
| `call_events` | Granular event log (status changes, errors, transfers) | `organization_id` |
| `voice_webhook_logs` | Inbound webhook audit trail (signature, payload, processing) | `organization_id` |

## 4. Call flow

```
1. Incoming call (PSTN → Vapi → webhook)
   │
   ▼
2. POST /api/v1/voice/webhook/vapi  (call-start event)
   │  - Verify HMAC signature
   │  - Parse event → ProviderEvent
   │  - Create VoiceSession (status=ringing)
   ▼
3. Webhook: call-answer event
   │  - Update session status=answered
   ▼
4. Webhook: transcript events (partial + final)
   │  - Persist VoiceMessage rows
   │  - On final caller transcript:
   │    a. Load assistant config + conversation memory
   │    b. RAG search (if enabled) → context + citations
   │    c. Call AIGateway.chat() (LLM + memory + safety)
   │    d. Stream response back to Vapi (via assistant config)
   │    e. Persist assistant VoiceMessage with citations + confidence
   ▼
5. Webhook: barge-in event (caller interrupted)
   │  - Increment session.barge_in_count
   │  - Mark current assistant message as interrupted
   ▼
6. Webhook: call-end event
   │  - Update session status=completed
   │  - Compute VoiceAnalytics (latency, talk time, outcomes)
   │  - Generate summary (optional, via LLM)
   ▼
7. UI: GET /api/v1/voice/sessions/{id} (transcript + analytics)
```

For browser-based voice (VoIP), the WebSocket endpoint at
`/api/v1/voice/stream/{session_id}` enables real-time bidirectional
streaming — see section 8 below.

## 5. Provider abstraction

The `VoiceProvider` abstract base (`app/voice/providers/base.py`) defines
the interface every provider must implement:

```python
class VoiceProvider(ABC):
    @abstractmethod
    async def create_assistant(config: AssistantConfig) -> dict
    @abstractmethod
    async def update_assistant(provider_assistant_id: str, config: AssistantConfig) -> dict
    @abstractmethod
    async def delete_assistant(provider_assistant_id: str) -> bool
    @abstractmethod
    async def get_assistant(provider_assistant_id: str) -> dict
    @abstractmethod
    async def start_call(request: ProviderCallRequest) -> ProviderCallResponse
    @abstractmethod
    async def end_call(call_sid: str) -> bool
    @abstractmethod
    async def get_call(call_sid: str) -> dict
    @abstractmethod
    def verify_webhook_signature(body: bytes, headers: dict) -> bool
    @abstractmethod
    def parse_webhook_event(body: bytes, headers: dict) -> ProviderEvent
```

### Implemented providers

| Provider | Status | Notes |
|---|---|---|
| **vapi** | ✅ Fully implemented | Assistant CRUD, call management, webhook verification (HMAC-SHA256), event parsing |
| **retell** | 🚧 Stub | Raises `VoiceProviderNotImplementedError` |
| **bland** | 🚧 Stub | Raises `VoiceProviderNotImplementedError` |
| **livekit** | 🚧 Stub | Raises `VoiceProviderNotImplementedError` |
| **pipecat** | 🚧 Stub | Raises `VoiceProviderNotImplementedError` |

### Switching providers

Change one env var:

```bash
VOICE_PROVIDER=retell  # was: vapi
```

All voice API calls automatically route through the new provider. No code
changes needed (once the provider is implemented).

### Adding a new provider

1. Create `app/voice/providers/xxx_provider.py` implementing `VoiceProvider`
2. Register in `VOICE_PROVIDER_REGISTRY` (in `app/voice/providers/__init__.py`)
3. Add config keys to `Settings` (e.g., `XXX_API_KEY`)
4. Add to `.env.example`

## 6. Vapi integration

### Authentication

Vapi uses a Bearer token (API key) for outbound API calls:

```python
# app/voice/providers/vapi_provider.py
client = httpx.AsyncClient(
    base_url="https://api.vapi.ai",
    headers={"Authorization": f"Bearer {self.api_key}"},
)
```

Set `VAPI_API_KEY` in your `.env` (get it from
[dashboard.vapi.ai/api-keys](https://dashboard.vapi.ai/api-keys)).

### Assistant synchronization

When you create a `VoiceAssistant` via the API, the service automatically
syncs it to Vapi:

1. Build `AssistantConfig` from the local assistant fields
2. Call `VapiVoiceProvider.create_assistant(config)` → returns `{"id": "..."}`
3. Store the Vapi assistant ID in `VoiceAssistant.provider_assistant_id`

If sync fails (e.g., API key missing), the local assistant is still created
with `metadata.provider_sync_pending = True`. You can re-sync later via
`POST /api/v1/voice/assistants/{id}/sync`.

### Webhook handling

Vapi sends events to your webhook URL (configurable per assistant in the
Vapi dashboard). Set the URL to:

```
https://your-domain.com/api/v1/voice/webhook/vapi
```

**Signature verification** (HMAC-SHA256):

1. Vapi signs the request body with your public key
2. The signature is sent in the `X-Vapi-Signature` header (hex)
3. We recompute `HMAC-SHA256(public_key, body)` and compare in constant time
4. If `VAPI_WEBHOOK_SECRET` is set, we also verify `X-Vapi-Server-Secret` matches

**Event types** (parsed from Vapi's `message.type` field):

| Vapi event type | Our event type | Action |
|---|---|---|
| `call-start` | `call.started` | Create session |
| `call-answer` | `call.answered` | Update status → answered |
| `call-end` | `call.ended` | End session + compute analytics |
| `transcript` | `stt.final` | Persist caller/assistant message |
| `partial-transcript` | `stt.partial` | Update partial transcript |
| `assistant-response` | `assistant.response` | Persist assistant message |
| `speech-start` | `tts.start` | Log TTS start event |
| `speech-end` | `tts.end` | Log TTS end event |
| `interruption` / `barge-in` | `barge_in` | Increment barge-in count |
| `silence-timeout` | `silence.detected` | Add to silence_seconds |
| `error` | `error` | Log error event |
| `transfer` | `call.transferred` | Update transfer info |

All webhooks are logged to `voice_webhook_logs` for audit (raw body,
headers, signature validity, processing result).

## 7. Conversation engine

The `VoiceConversationService` orchestrates the per-turn AI loop:

```
1. Receive finalized caller utterance (from webhook or WebSocket)
   │
   ▼
2. RAG search (if assistant.enable_rag)
   │  - Query the tenant's knowledge base
   │  - Get context + citations + confidence
   │  - If was_fallback, mark turn as low-confidence
   ▼
3. Build context:
   │  - System prompt (Jinja2 template, rendered with caller info + RAG context)
   │  - Conversation memory (last 10 turns from VoiceMessage rows)
   │  - Current user message
   ▼
4. Call AIGateway.chat()
   │  - Routes through prompt manager, memory, tool engine
   │  - Applies safety guardrails (input + output)
   │  - Returns response + citations + confidence + tokens
   ▼
5. Persist assistant VoiceMessage
   │  - text, latency_ms, ai_confidence, citations, tokens
   ▼
6. Check escalation policy
   │  - If 3 consecutive low-confidence turns + escalation_phone set
   │  → trigger transfer
```

### Streaming mode

For real-time streaming (browser VoIP), use `stream_user_utterance()`:

```python
async for chunk in conversation.stream_user_utterance(...):
    if chunk["type"] == "metadata":
        # citations + confidence (before chunks start)
        pass
    elif chunk["type"] == "chunk":
        # streaming AI response token
        await ws.send_json(chunk)
    elif chunk["type"] == "done":
        # full response + latency + tokens
        pass
```

This uses `llm_gateway.stream()` (from Stage 2 Step 1) to stream tokens
as they're generated by the LLM.

### Barge-in handling

When the caller interrupts the assistant mid-speech:

1. Vapi sends a `barge-in` webhook event
2. We increment `session.barge_in_count`
3. We mark the current assistant message as `interrupted=True`
4. We broadcast a `barge_in` message to all WebSocket connections for the session
5. The client stops playing TTS audio

## 8. WebSocket streaming

**Endpoint**: `ws://host/api/v1/voice/stream/{session_id}?token=<stream_token>`

### Authentication

1. Client calls `POST /api/v1/voice/sessions/{id}/stream-token` (JWT auth required)
2. Server mints a short-lived JWT (TTL = `VOICE_WS_TOKEN_TTL_SECONDS`, default 5 min)
   with `session_id` claim
3. Client opens WebSocket with `?token=<stream_token>` query param
4. Server verifies token + matches `session_id`

### Protocol (JSON messages, bidirectional)

**Client → Server**:
```json
{"type": "stt_final", "text": "I need help", "confidence": 0.95}
{"type": "barge_in"}
{"type": "end"}
{"type": "audio", "data": "<base64 PCM>"}
{"type": "ping"}
```

**Server → Client**:
```json
{"type": "session_start", "session_id": "...", "greeting": "...", "voice": "aria"}
{"type": "metadata", "citations": [...], "confidence": 0.92, "rag_used": true}
{"type": "chunk", "text": "Hi! ", "sequence": 0}
{"type": "chunk", "text": "How can ", "sequence": 1}
{"type": "done", "latency_ms": 450, "tokens_in": 120, "tokens_out": 35}
{"type": "barge_in"}
{"type": "error", "message": "...", "fallback": "..."}
{"type": "ended", "outcome": "caller_ended"}
```

### Connection manager

`VoiceConnectionManager` tracks active WebSocket connections per session:

- **Broadcast**: Webhook events (transcript updates) are pushed to all connections
  for that session — useful for live dashboard updates.
- **Barge-in**: When a barge-in event arrives, all connections are notified
  to stop playing TTS audio.

## 9. Tenant isolation

Enforced at **four** layers (same pattern as RAG):

1. **Database** — every voice table has `organization_id` (non-null, indexed)
2. **Application** — `VoiceService` methods require `organization_id` as a
   keyword-only arg; `get_session`, `get_assistant`, `get_messages` all
   verify the resource belongs to the caller's org
3. **Webhook** — `call_sid` is globally unique; webhook handlers resolve
   `organization_id` from the session lookup, not from the request
4. **API** — every endpoint resolves the caller's org from their JWT via
   `UserOrganizationRepository`

Cross-tenant access is impossible: even with another tenant's session UUID,
`get_session` raises `NotFoundError`.

## 10. Configuration

All settings are in `app/core/config.py` and documented in `.env.example`.

### Critical settings

| Setting | Default | Purpose |
|---|---|---|
| `VOICE_PROVIDER` | `vapi` | Active provider (vapi, retell, bland, livekit, pipecat) |
| `VAPI_API_KEY` | (empty) | Vapi server-side API key |
| `VAPI_PUBLIC_KEY` | (empty) | For webhook signature verification |
| `VAPI_WEBHOOK_SECRET` | (empty) | Optional shared secret for webhook auth |
| `VAPI_PHONE_NUMBER_ID` | (empty) | Vapi phone number for outbound calls |
| `DEFAULT_VOICE` | `aria` | Default 11labs voice |
| `DEFAULT_LANGUAGE` | `en` | Default language code |
| `DEFAULT_VOICE_STT_PROVIDER` | `deepgram` | Default STT |
| `DEFAULT_VOICE_TTS_PROVIDER` | `11labs` | Default TTS |
| `MAX_CALL_DURATION` | `1800` | 30 min auto-hangup |
| `ENABLE_BARGE_IN` | `true` | Allow caller interruptions |
| `SILENCE_TIMEOUT_SECONDS` | `30` | Hangup after N seconds of silence |
| `VOICE_WS_TOKEN_TTL_SECONDS` | `300` | WebSocket token TTL (5 min) |

### Production validation

`Settings.validate_production()` enforces:
- `VAPI_API_KEY` must be set when `VOICE_PROVIDER=vapi`

## 11. Manual setup — Vapi

### Step 1: Create a Vapi account

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai) and sign up
2. Add billing info (trial credit available — ~$5 free)

### Step 2: Obtain API keys

1. Navigate to **API Keys** → **New API Key**
2. Copy the **Server-side API key** (starts with `sk-`)
3. Set `VAPI_API_KEY=sk-...` in your `.env`

### Step 3: Create a public key (for webhook verification)

1. In **API Keys** → **New Public Key**
2. Copy the private key (used to sign webhooks — Vapi uses this to verify
   inbound webhooks come from them)
3. Set `VAPI_PUBLIC_KEY=<key>` in your `.env`

### Step 4: Purchase a phone number

1. Navigate to **Phone Numbers** → **Buy Number**
2. Choose a number (US numbers ~$2/month + per-minute usage)
3. Copy the **Phone Number ID** from the dashboard
4. Set `VAPI_PHONE_NUMBER_ID=<id>` in your `.env`

### Step 5: Configure the webhook URL

1. In the Vapi dashboard, edit your assistant (or create one)
2. Set **Server URL** to:
   ```
   https://your-domain.com/api/v1/voice/webhook/vapi
   ```
3. (Optional) Set **Server URL Secret** to a random string
4. Set the same secret as `VAPI_WEBHOOK_SECRET` in your `.env`

### Step 6: Start the platform

```bash
# 1. Set env vars
export VAPI_API_KEY=sk-...
export VAPI_PUBLIC_KEY=...
export VAPI_PHONE_NUMBER_ID=...
export OPENAI_API_KEY=sk-...  # for the AI gateway

# 2. Run migrations
cd apps/backend && alembic upgrade head

# 3. Start the backend
uvicorn app.main:app --reload

# 4. Start the frontend
cd ../frontend && pnpm dev

# 5. Open the UI
open http://localhost:3000/voice
```

### Step 7: Create your first assistant

1. Go to **/voice/assistants** in the UI
2. Click **New Assistant**
3. Fill in name, greeting, system prompt
4. Click **Create** — the assistant will be synced to Vapi automatically

### Step 8: Test a call

1. Go to **/voice/test**
2. Select your assistant
3. Enter your phone number (E.164 format: +1234567890)
4. Click **Start Test Call**
5. Answer your phone — you should hear the greeting
6. Watch the live transcript at **/voice/sessions**

## 12. API endpoints

All endpoints under `/api/v1/voice` (except webhook) require JWT auth.

### Assistants

| Method | Path | Purpose |
|---|---|---|
| POST | `/assistants` | Create assistant (auto-syncs to provider) |
| GET | `/assistants` | List assistants |
| GET | `/assistants/{id}` | Get assistant |
| PATCH | `/assistants/{id}` | Update assistant |
| DELETE | `/assistants/{id}` | Delete assistant (soft + provider delete) |
| POST | `/assistants/{id}/sync` | Re-sync to provider |

### Settings

| Method | Path | Purpose |
|---|---|---|
| GET | `/settings` | Get tenant voice settings |
| PATCH | `/settings` | Update settings |

### Sessions

| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions` | List sessions (filterable) |
| GET | `/sessions/{id}` | Get session |
| POST | `/sessions/{id}/end` | End session |
| GET | `/sessions/{id}/messages` | Get transcript |
| GET | `/sessions/{id}/events` | Get call events |
| POST | `/sessions/{id}/stream-token` | Mint WebSocket token |

### WebSocket

| Path | Purpose |
|---|---|
| `ws /stream/{session_id}?token=...` | Real-time voice stream |

### Testing + Analytics

| Method | Path | Purpose |
|---|---|---|
| POST | `/test-call` | Start test outbound call |
| GET | `/analytics/summary` | Aggregate analytics (30d default) |
| GET | `/analytics/sessions/{id}` | Per-session analytics |

### Webhooks (no auth — signature-verified)

| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook/{provider}` | Inbound provider webhook |
| GET | `/webhook/{provider}/test` | Health check |

### Webhook logs

| Method | Path | Purpose |
|---|---|---|
| GET | `/webhooks/logs` | List webhook logs (audit trail) |

### Provider info

| Method | Path | Purpose |
|---|---|---|
| GET | `/providers` | List registered providers |
| GET | `/config` | Public config (no secrets) |

## 13. UI screens

| Page | Path | Purpose |
|---|---|---|
| Voice Dashboard | `/voice` | Analytics summary + assistants + recent calls |
| Assistants | `/voice/assistants` | List + create assistants |
| Assistant Detail | `/voice/assistants/[id]` | Edit prompt, voice, behavior, escalation |
| Conversation History | `/voice/sessions` | List all calls (filterable) |
| Session Detail | `/voice/sessions/[id]` | Transcript + events + analytics + metadata |
| Voice Testing | `/voice/test` | Start test outbound call |
| Voice Settings | `/voice/settings` | Tenant-wide voice config |

## 14. Analytics

### Per-session analytics (`VoiceAnalytics`)

Computed when a call ends:

- **Latency**: avg/max/p95 AI latency, avg STT/TTS latency
- **Talk time**: AI vs customer vs silence vs overlap
- **Quality**: avg STT confidence, avg AI confidence, low-confidence turns
- **Outcome**: resolved, escalated, transferred, satisfaction
- **RAG**: citations count, fallback count
- **Cost**: total cents, tokens in/out

### Aggregate analytics (`/analytics/summary`)

30-day rollup (configurable):

- Total calls, avg duration, completion rate
- Outcome breakdown (resolved, unresolved, escalated, etc.)
- Escalations, transfers, barge-ins
- Avg AI latency

### Webhook logs (`/webhooks/logs`)

Every inbound webhook is logged:

- Provider, event type, call SID
- Signature validity + verification error
- Processing status + error
- Source IP, raw body, headers
- Response status + body

## 15. Security

- **Webhook signature verification**: HMAC-SHA256 (Vapi) — constant-time comparison
- **WebSocket auth**: short-lived JWT (5 min TTL) bound to session_id
- **Tenant isolation**: 4-layer enforcement (DB, app, webhook, API)
- **Input validation**: Pydantic schemas on all endpoints
- **Rate limiting**: inherits platform-level rate limit middleware
- **Audit logs**: every webhook + every call event is persisted
- **No secrets in code**: all API keys from env vars via Pydantic Settings

## 16. Testing

51 tests in `app/tests/test_voice_ai.py` covering:

- Vapi provider (signature verification, event parsing, assistant payload)
- Stub providers (Retell, Bland, LiveKit, Pipecat — raise NotImplementedError)
- Session manager (create, state transitions, transcript, analytics)
- Voice service (assistant CRUD, settings, provider sync)
- Webhook processing (invalid signature, unknown provider, call-end, transcript)
- **Tenant isolation** (cross-tenant access blocked)
- Analytics (per-session + aggregate)
- Conversation service (system prompt rendering, escalation policy)

Run with:
```bash
cd apps/backend
DATABASE_URL="sqlite+aiosqlite:///./test.db" python -m pytest app/tests/test_voice_ai.py -v
```

## 17. Future enhancements

- **Retell / Bland / LiveKit / Pipecat** providers — stubs are in place,
  implementations need to follow the Vapi pattern.
- **Real-time audio streaming** over WebSocket (currently the WS layer
  handles text transcripts + control messages; audio is provider-managed).
- **In-call tool calling** — let the assistant call business APIs mid-call
  (e.g., "look up my order status").
- **Post-call summary generation** — automatically generate a summary via
  LLM when the call ends (placeholder field exists on `VoiceSession`).
- **Sentiment analysis** — analyze caller sentiment from transcript
  (placeholder field exists; integration with Deepgram's sentiment API).
- **Multi-language code-switching** — detect language changes mid-call
  and switch STT/TTS models accordingly.
