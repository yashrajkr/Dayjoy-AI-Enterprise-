# Enterprise Telephony Integration Platform — Architecture

> Stage 2 Step 4 — Production-grade telephony layer connecting real phone
> numbers to the Voice AI platform. Twilio fully implemented; Exotel, Plivo,
> Knowlarity as provider-swappable stubs.

## 1. Overview

The telephony layer is the **LAYER BELOW voice AI**:

```
PSTN → Telephony (Twilio) → Voice AI (Vapi) → AI Provider (LLM) → RAG
```

It is responsible for:
- **Phone number management** (provisioning, configuration, routing)
- **Call routing** (rules-based: AI, voicemail, forward, reject)
- **Call control** (transfer, hold, resume, terminate)
- **Recording** (start, stop, store, access control)
- **Webhook handling** (signature verification, event routing)
- **Retry** (failed calls, network errors)
- **Provider abstraction** (Twilio fully implemented; Exotel/Plivo/Knowlarity stubs)

It delegates AI logic to the existing Voice AI platform (`app.voice.*`) —
it does NOT duplicate STT/TTS/LLM/RAG.

### Key properties

| Property | How it's enforced |
|---|---|
| **Multi-tenancy** | Every table has `organization_id`; every API resolves org from JWT; webhooks resolve org from `call_sid` → session lookup. |
| **Provider abstraction** | `TelephonyProvider` abstract base + Twilio implementation. Switching providers = 1 env var change. |
| **Webhook security** | HMAC-SHA1 signature verification (Twilio's scheme). All webhooks logged. |
| **TwiML generation** | Native XML generation (no twilio-python SDK dependency). |
| **Call routing** | Rule-based with priority ordering, business hours, holidays, caller-prefix matching. |
| **Recording access control** | Per-recording `access_level` + consent tracking. |

## 2. Architecture diagram

```
                         ┌──────────────────────┐
                         │   Customer Phone     │
                         │  (PSTN / Mobile)     │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Telephony Provider │
                         │   (Twilio / Exotel / │
                         │    Plivo / Knowlarity)
                         │   PSTN + Webhooks    │
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │ Webhook          │ Media Stream    │
                  │ (inbound call,   │ (bidirectional  │
                  │  status, recording)  audio WS)     │
                  ▼                                    ▼
┌──────────────────────────────────────────────────────────┐
│                    FastAPI Backend                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │              TelephonyService                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │  │
│  │  │ CallRouter   │  │ CallManager  │  │ Recording│ │  │
│  │  │ (rules)      │  │ (sessions)   │  │ Manager  │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │  │
│  └─────────┼─────────────────┼───────────────┼───────┘  │
│            │                 │               │           │
│  ┌─────────▼─────────┐  ┌───▼──────────┐  ┌─▼────────┐ │
│  │ TelephonyProvider │  │ Voice AI     │  │ DB       │ │
│  │ (Twilio impl)     │  │ (Stage 2.3)  │  │ (8 tables)│ │
│  │ + TwiML generator │  │ + AI Gateway │  │           │ │
│  └───────────────────┘  │ + RAG        │  └──────────┘ │
│                         └──────────────┘               │
└──────────────────────────────────────────────────────────┘
```

## 3. Database schema (Stage 2 Step 4 — migration 0010)

| Table | Purpose | Tenant isolation |
|---|---|---|
| `telephony_providers` | Registered provider configurations | `organization_id` |
| `phone_numbers` | Tenant-owned business phone numbers | `organization_id` |
| `business_hours_schedules` | Per-tenant business hours + holidays | `organization_id` |
| `routing_rules` | Call routing rules (priority + conditions) | `organization_id` |
| `telephony_call_sessions` | Live + historical call sessions | `organization_id` |
| `telephony_call_logs` | Per-call summary (analytics) | `organization_id` |
| `call_recordings` | Recording metadata + access control | `organization_id` |
| `telephony_call_events` | Granular event log | `organization_id` |
| `telephony_settings` | Per-tenant global config (1 row/org) | `organization_id` (unique) |

## 4. Call flow

```
1. Incoming phone call → Twilio receives
   │
   ▼
2. Twilio sends webhook: POST /api/v1/telephony/webhook/twilio/voice
   │  - Verify HMAC-SHA1 signature
   │  - Parse inbound call (CallSid, From, To, Direction)
   │  - Look up PhoneNumber by To number
   │  - Resolve organization_id from PhoneNumber
   ▼
3. Call router evaluates routing rules (priority order)
   │  - Check conditions: caller_phone_prefix, business_hours_open,
   │    day_of_week, time_of_day, caller_customer_tier
   │  - First match wins; if no match → phone number's default strategy
   ▼
4. Create TelephonyCallSession (status=ringing)
   │  - Emit call.initiated event
   ▼
5. Generate TwiML based on routing decision:
   │  - ai:       <Connect><Stream> → connect to AI media stream WebSocket
   │  - forward:  <Dial> → dial another number
   │  - voicemail: <Record> → record a message
   │  - reject:   <Reject> → busy signal
   ▼
6. Twilio executes the TwiML → call connects to AI (or forward/voicemail)
   │
   ▼
7. Twilio sends status callbacks: POST /api/v1/telephony/webhook/twilio/status
   │  - initiated → ringing → answered → completed
   │  - Update TelephonyCallSession status at each step
   │  - On completed: create TelephonyCallLog (summary)
   ▼
8. Twilio sends recording callback: POST /api/v1/telephony/webhook/twilio/recording
   │  - Store CallRecording row (URL, duration, format)
   │  - Link to session
   ▼
9. Analytics available via GET /api/v1/telephony/analytics/summary
```

## 5. Provider abstraction

The `TelephonyProvider` abstract base (`app/telephony/providers/base.py`)
defines the interface every telephony provider must implement:

```python
class TelephonyProvider(ABC):
    # Call control
    async def make_call(request) -> TelephonyCallResponse
    async def end_call(call_sid) -> bool
    async def transfer_call(request) -> bool
    async def hold_call(call_sid) -> bool
    async def resume_call(call_sid) -> bool
    async def get_call(call_sid) -> dict

    # Recording
    async def start_recording(call_sid) -> str | None
    async def stop_recording(call_sid, recording_sid) -> bool

    # Phone number management
    async def list_phone_numbers() -> list[dict]
    async def purchase_phone_number(number) -> dict
    async def release_phone_number(sid) -> bool

    # Webhook handling
    def verify_webhook_signature(body, headers, url) -> bool
    def parse_inbound_call(body, headers) -> ProviderInboundCall
    def parse_status_callback(body, headers) -> TelephonyEvent
    def parse_recording_callback(body, headers) -> TelephonyEvent

    # TwiML generation
    def generate_connect_twiml(ws_url, ...) -> str
    def generate_dial_twiml(to_number, ...) -> str
    def generate_say_twiml(text, ...) -> str
    def generate_hangup_twiml() -> str
```

### Implemented providers

| Provider | Status | Notes |
|---|---|---|
| **twilio** | ✅ Fully implemented | Calls, recordings, phone numbers, HMAC-SHA1 webhooks, TwiML |
| **exotel** | 🚧 Stub | Raises `TelephonyProviderNotImplementedError` |
| **plivo** | 🚧 Stub | Raises `TelephonyProviderNotImplementedError` |
| **knowlarity** | 🚧 Stub | Raises `TelephonyProviderNotImplementedError` |

### Switching providers

```bash
TELEPHONY_PROVIDER=exotel  # was: twilio
```

All telephony API calls automatically route through the new provider.

## 6. Twilio integration

### Authentication

Twilio uses HTTP Basic Auth with `AccountSID:AuthToken`:

```python
credentials = f"{account_sid}:{auth_token}"
encoded = base64.b64encode(credentials.encode()).decode()
headers = {"Authorization": f"Basic {encoded}"}
```

### Webhook signature verification

Twilio signs every webhook request with HMAC-SHA1 using the Auth Token:

1. Build string to sign: `URL + sorted POST params (key+value concatenated)`
2. Compute `HMAC-SHA1(auth_token, string_to_sign)`
3. Base64-encode the digest
4. Compare with `X-Twilio-Signature` header (constant-time)

```python
# In TwilioTelephonyProvider.verify_webhook_signature():
string_to_sign = url + "".join(f"{k}{v}" for k, v in sorted_params)
computed = hmac.new(auth_token.encode(), string_to_sign.encode(), hashlib.sha1).digest()
expected = base64.b64encode(computed).decode()
return hmac.compare_digest(expected, signature_header)
```

### TwiML generation

TwiML is Twilio's XML-based markup for controlling calls. We generate it
natively (no twilio-python SDK dependency):

| TwiML verb | Purpose |
|---|---|
| `<Say>` | Text-to-speech to the caller |
| `<Play>` | Play an audio file |
| `<Dial>` | Dial another number (transfer/forward) |
| `<Connect><Stream>` | Bidirectional audio stream (for AI) |
| `<Record>` | Record the caller's voice (voicemail) |
| `<Hangup>` | End the call |
| `<Reject>` | Reject the call (busy signal) |
| `<Gather>` | Collect DTMF input |
| `<Pause>` | Insert silence |

Example TwiML for connecting to AI:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">Hello, how can I help you today?</Say>
  <Connect>
    <Stream url="wss://your-domain.com/api/v1/telephony/media-stream/abc123"
            name="ai_stream">
      <Parameter name="session_id" value="abc123"/>
      <Parameter name="organization_id" value="org-xyz"/>
    </Stream>
  </Connect>
</Response>
```

## 7. Call router

The `CallRouter` evaluates `RoutingRule` rows in priority order (lower
priority = evaluated first). First match wins.

### Condition types

| Condition key | Description | Example |
|---|---|---|
| `caller_phone_in` | Caller is in a specific list | `["+1234", "+5678"]` |
| `caller_phone_prefix` | Caller's number starts with prefix | `"+1999"` |
| `caller_customer_tier` | Resolved customer's tier | `"vip"` |
| `caller_id_blocked` | Caller ID is anonymous | `true` |
| `business_hours_open` | Currently within business hours | `true` |
| `day_of_week` | Current weekday | `["monday", "tuesday"]` |
| `time_of_day` | Current time range | `{"start": "09:00", "end": "17:00"}` |

### Action types

| Action | Config | Description |
|---|---|---|
| `ai` | `{"voice_assistant_id": "..."}` | Connect to Voice AI |
| `forward` | `{"forward_to": "+...", "timeout": 30}` | Dial another number |
| `voicemail` | `{"max_duration": 120}` | Record a voicemail |
| `reject` | `{"reason": "blocked"}` | Reject with busy signal |

## 8. API endpoints

All endpoints under `/api/v1/telephony` (except webhooks) require JWT auth.

### Phone numbers
| Method | Path | Purpose |
|---|---|---|
| POST | `/phone-numbers` | Register phone number |
| GET | `/phone-numbers` | List phone numbers |
| GET | `/phone-numbers/{id}` | Get phone number |
| PATCH | `/phone-numbers/{id}` | Update phone number |
| DELETE | `/phone-numbers/{id}` | Delete phone number |

### Calls
| Method | Path | Purpose |
|---|---|---|
| GET | `/calls/active` | List active calls |
| GET | `/calls/history` | List call history |
| GET | `/calls/{id}` | Get call session |
| POST | `/calls/{id}/end` | End call |
| POST | `/calls/{id}/transfer` | Transfer call |
| POST | `/calls/{id}/hold` | Hold call |
| POST | `/calls/{id}/resume` | Resume call |

### Recordings
| Method | Path | Purpose |
|---|---|---|
| GET | `/recordings` | List recordings |
| GET | `/recordings/{id}` | Get recording |

### Routing rules
| Method | Path | Purpose |
|---|---|---|
| POST | `/routing-rules` | Create routing rule |
| GET | `/routing-rules` | List routing rules |
| DELETE | `/routing-rules/{id}` | Delete routing rule |

### Business hours
| Method | Path | Purpose |
|---|---|---|
| POST | `/business-hours` | Create schedule |
| GET | `/business-hours` | List schedules |

### Settings + Analytics + Providers
| Method | Path | Purpose |
|---|---|---|
| GET | `/settings` | Get telephony settings |
| PATCH | `/settings` | Update settings |
| GET | `/analytics/summary` | Aggregate analytics |
| GET | `/providers` | List registered providers |
| GET | `/config` | Public config |

### Webhooks (no auth — signature-verified)
| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook/{provider}/voice` | Inbound call webhook |
| POST | `/webhook/{provider}/status` | Status callback |
| POST | `/webhook/{provider}/recording` | Recording callback |
| GET | `/webhook/{provider}/test` | Health check |

## 9. UI screens

| Page | Path | Purpose |
|---|---|---|
| Telephony Dashboard | `/telephony` | Analytics + active calls + phone numbers |
| Phone Numbers | `/telephony/phone-numbers` | Register + manage numbers |
| Call History | `/telephony/calls` | List all calls with filters |
| Recordings | `/telephony/recordings` | List + play + download recordings |
| Routing Rules | `/telephony/routing` | Create + manage routing rules |
| Business Hours | `/telephony/business-hours` | Create + manage schedules |
| Settings | `/telephony/settings` | Provider + webhook + recording config |

## 10. Manual setup — Twilio

### Step 1: Create a Twilio account

1. Go to [console.twilio.com](https://console.twilio.com) and sign up
2. Verify your email + phone number
3. Get trial credit (~$15 free)

### Step 2: Obtain credentials

1. On the dashboard, find your **Account SID** (starts with `AC`)
2. Find your **Auth Token** (click "Show" to reveal)
3. Set in `.env`:
   ```bash
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   ```

### Step 3: Purchase a phone number

1. Navigate to **Phone Numbers → Manage → Buy a number**
2. Search for a number (US numbers ~$1-2/month + per-minute usage)
3. Purchase it
4. Copy the number (E.164 format: `+1234567890`)
5. Set in `.env`:
   ```bash
   TWILIO_PHONE_NUMBER=+1234567890
   ```

### Step 4: Configure webhooks

1. Navigate to **Phone Numbers → Manage → Active numbers**
2. Click your purchased number
3. Under **Voice & Fax**:
   - **A CALL COMES IN**: Webhook → POST
     `https://your-domain.com/api/v1/telephony/webhook/twilio/voice`
   - **PRIMARY HANDLER FAILS**: Webhook → POST
     `https://your-domain.com/api/v1/telephony/webhook/twilio/voice`
   - **CALL STATUS CHANGES**: Webhook → POST
     `https://your-domain.com/api/v1/telephony/webhook/twilio/status`
4. Save

### Step 5: Register the number in the platform

1. Go to **/telephony/phone-numbers** in the UI
2. Click **Register Number**
3. Enter the E.164 number + display name
4. Choose routing strategy (AI / Forward / Voicemail / Reject)
5. Click **Register**

### Step 6: Test locally (with ngrok)

Twilio can't reach `localhost`. Use ngrok to expose your local server:

```bash
# Terminal 1: Start backend
cd apps/backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start ngrok tunnel
ngrok http 8000
# → Copy the https URL (e.g. https://abc123.ngrok.io)

# Terminal 3: Start frontend
cd apps/frontend
pnpm dev
```

Update your Twilio webhook URLs to use the ngrok URL:
```
https://abc123.ngrok.io/api/v1/telephony/webhook/twilio/voice
https://abc123.ngrok.io/api/v1/telephony/webhook/twilio/status
```

### Step 7: Make a test call

1. Call your Twilio phone number from your phone
2. You should hear the greeting
3. The call should connect to the AI
4. Check the live transcript at **/telephony/calls**
5. Check the recording at **/telephony/recordings**

## 11. Security

- **Webhook signature verification**: HMAC-SHA1 (Twilio) — constant-time comparison
- **Tenant isolation**: 4-layer enforcement (DB, app, webhook, API)
- **Recording access control**: `access_level` field (public, org_admin, compliance_only)
- **Consent tracking**: `consent_obtained` + `consent_method` on recordings
- **Credential handling**: secrets only in env vars, never in code or DB
- **Rate limiting**: inherits platform-level rate limit middleware
- **Audit logs**: every call event + every webhook is persisted

## 12. Analytics

### Per-session metrics (`TelephonyCallLog`)

- Duration, wait time, talk time
- AI handled / AI resolution
- Recording availability
- Transfer info
- Cost
- Sentiment

### Aggregate analytics (`/analytics/summary`)

30-day rollup (configurable):

- Total calls, answer rate, missed calls
- Avg duration
- AI resolution rate (AI resolved / AI handled)
- Human transfer rate
- Recording availability
- Outcome breakdown

## 13. Testing

51 tests in `app/tests/test_telephony.py` covering:

- Twilio provider (signature verification, webhook parsing, TwiML generation)
- Stub providers (Exotel, Plivo, Knowlarity)
- TwiML generation (Say, Dial, Connect+Stream, Record, Hangup, Gather)
- Call router (rule evaluation, business hours, priority ordering)
- Telephony service (phone numbers, routing rules, business hours, settings)
- Webhook processing (inbound call, status callback, recording callback)
- **Tenant isolation** (cross-tenant access blocked)
- Analytics aggregation

```bash
cd apps/backend
DATABASE_URL="sqlite+aiosqlite:///./test.db" python -m pytest app/tests/test_telephony.py -v
```

## 14. Future enhancements

- **Exotel / Plivo / Knowlarity** implementations — stubs are in place
- **Media Stream WebSocket** — bidirectional audio streaming for real-time AI
- **Voicemail transcription** — auto-transcribe voicemail recordings via STT
- **Call queuing** — queue incoming calls when all agents are busy
- **DTMF navigation** — IVR menu navigation via `<Gather>`
- **SMS support** — the phone_numbers table already has `sms_enabled` field
- **SIP trunking** — connect on-prem PBX via SIP trunk
- **Recording download + storage** — auto-download recordings to S3 for compliance
