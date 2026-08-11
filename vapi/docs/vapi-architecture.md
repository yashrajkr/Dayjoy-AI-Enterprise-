# Dayjoy Voice AI — Architecture

> Detailed architecture documentation for the Vapi Voice AI module.
> For a higher-level overview, see [`vapi-README.md`](vapi-README.md).

**Version:** 2.0.0  •  **Last updated:** 2025-01

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Diagram](#2-component-diagram)
3. [Data Flow](#3-data-flow)
4. [Sequence Diagrams](#4-sequence-diagrams)
   - [Call Lifecycle](#41-call-lifecycle)
   - [Webhook Processing](#42-webhook-processing)
   - [Tool Execution](#43-tool-execution)
   - [RAG Query](#44-rag-query)
5. [Integration Points](#5-integration-points)
6. [Data Model](#6-data-model)
7. [Security Architecture](#7-security-architecture)
8. [Scalability + Performance](#8-scalability--performance)

---

## 1. System Overview

The Dayjoy Voice AI is a NestJS service that wraps the Vapi.ai cloud
telephony platform. It accepts signed webhooks from Vapi (call events,
transcripts, function-call requests), executes Dayjoy business logic
(looking up customers, creating leads, booking appointments), and
persists every interaction to PostgreSQL for analytics + audit.

The system has 6 logical layers:

1. **Edge** — Vapi cloud (telephony, STT, TTS)
2. **Webhook ingress** — `VapiWebhookController` (HMAC verification + routing)
3. **Handlers** — 4 event handlers (started, ended, transcript, function-call)
4. **Tools + Flows** — 8 function-calling tools + 7 conversation flows
5. **Memory** — Session memory (Redis) + customer profiles (long-term)
6. **Persistence** — PostgreSQL (sessions, transcripts, analytics, tool executions)
7. **Analytics** — Dashboards, alerts, AI quality metrics

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              External Systems                                │
└─────────────────────────────────────────────────────────────────────────────┘

       ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
       │   Customer   │         │    Vapi      │         │   OpenAI     │
       │    Phone     │◀───────▶│   Cloud      │◀───────▶│   API        │
       │              │  PSTN   │ (Twilio +    │  HTTPS  │ (LLM +       │
       │              │         │  Deepgram +  │         │  Embeddings) │
       │              │         │  ElevenLabs) │         │              │
       └──────────────┘         └──────┬───────┘         └──────────────┘
                                       │
                                       │ Webhooks (HMAC-SHA256)
                                       ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │                          Dayjoy Backend                          │
       │                          (NestJS + TypeScript)                    │
       │                                                                    │
       │  ┌─────────────────────────────────────────────────────────────┐ │
       │  │                      API Layer (REST)                       │ │
       │  │                                                              │ │
       │  │  VapiController            VapiWebhookController             │ │
       │  │  ├─ POST /calls             ├─ POST /webhook                 │ │
       │  │  ├─ GET /calls              │  (HMAC verified, no JWT)       │ │
       │  │  ├─ GET /calls/:id          │                                │ │
       │  │  ├─ POST /calls/:id/end     │                                │ │
       │  │  ├─ GET /sessions/active    │                                │ │
       │  │  ├─ GET /assistants         │                                │ │
       │  │  └─ GET /analytics/*        │                                │ │
       │  └─────────────────────────────────────────────────────────────┘ │
       │                              │                                   │
       │                              ▼                                   │
       │  ┌─────────────────────────────────────────────────────────────┐ │
       │  │                   Service Layer                              │ │
       │  │                                                              │ │
       │  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │ │
       │  │  │ VapiWebhook     │  │ VapiClient      │  │ VapiMemory   │ │ │
       │  │  │ Service         │  │ Service         │  │ Service      │ │ │
       │  │  │ ├─ verify       │  │ ├─ createCall   │  │ ├─ sessions  │ │ │
       │  │  │ │  Signature    │  │ ├─ getCall      │  │ ├─ profiles  │ │ │
       │  │  │ ├─ process      │  │ ├─ endCall      │  │ └─ memories  │ │ │
       │  │  │ │  Webhook      │  │ └─ getRecording │  │              │ │ │
       │  │  │ └─ route        │  │                 │  │              │ │ │
       │  │  └─────────────────┘  └─────────────────┘  └──────────────┘ │ │
       │  │                                                              │ │
       │  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │ │
       │  │  │ CallStarted     │  │ CallEnded       │  │ Transcript   │ │ │
       │  │  │ Handler         │  │ Handler         │  │ Handler      │ │ │
       │  │  │ → VoiceSession  │  │ → VoiceAnalytics│  │ → VoiceTx    │ │ │
       │  │  └─────────────────┘  └─────────────────┘  └──────────────┘ │ │
       │  │                                                              │ │
       │  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │ │
       │  │  │ FunctionCall    │  │ Conversation    │  │ Analytics    │ │ │
       │  │  │ Handler         │  │ Flow Manager    │  │ Dashboard    │ │ │
       │  │  │ → Tool exec     │  │ ├─ detectIntent │  │ ├─ metrics   │ │ │
       │  │  │                 │  │ ├─ create state │  │ ├─ alerts    │ │ │
       │  │  │                 │  │ └─ process msg  │  │ └─ reports   │ │ │
       │  │  └─────────────────┘  └─────────────────┘  └──────────────┘ │ │
       │  └─────────────────────────────────────────────────────────────┘ │
       │                              │                                   │
       │                              ▼                                   │
       │  ┌─────────────────────────────────────────────────────────────┐ │
       │  │                      Tools Layer (8 tools)                  │ │
       │  │                                                              │ │
       │  │  search_knowledge  search_products   customer_lookup         │ │
       │  │  distributor_lookup lead_capture      appointment_booking    │ │
       │  │  create_support_ticket  human_transfer                       │ │
       │  │                                                              │ │
       │  │  Each tool implements VapiTool interface:                    │ │
       │  │    execute(request: ToolCallRequest): Promise<ToolCallResult>│ │
       │  └─────────────────────────────────────────────────────────────┘ │
       │                              │                                   │
       │                              ▼                                   │
       │  ┌─────────────────────────────────────────────────────────────┐ │
       │  │                    Persistence Layer                         │ │
       │  │                                                              │ │
       │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │ │
       │  │  │ PostgreSQL   │  │   Redis      │  │  RAG Pipeline    │   │ │
       │  │  │ (pgvector)   │  │ (sessions +  │  │  (knowledge      │   │ │
       │  │  │              │  │  rate limit) │  │   base + LLM)    │   │ │
       │  │  │ voice_sess   │  │              │  │                  │   │ │
       │  │  │ voice_tx     │  │              │  │  ragQuery table  │   │ │
       │  │  │ voice_analyt │  │              │  │  rag_chunks      │   │ │
       │  │  │ tool_exec    │  │              │  │  (pgvector)      │   │ │
       │  │  │ customers    │  │              │  │                  │   │ │
       │  │  │ leads        │  │              │  │                  │   │ │
       │  │  │ appointments │  │              │  │                  │   │ │
       │  │  │ tickets      │  │              │  │                  │   │ │
       │  │  └──────────────┘  └──────────────┘  └──────────────────┘   │ │
       │  └─────────────────────────────────────────────────────────────┘ │
       └────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### Inbound call data flow

1. Customer dials Dayjoy phone number (Twilio)
2. Twilio routes to Vapi cloud
3. Vapi answers, plays greeting, starts streaming audio to OpenAI
4. OpenAI transcribes audio → returns text
5. OpenAI LLM generates response (may request tool call)
6. **If tool call:** Vapi fires `function-call` webhook → our backend executes the tool → returns result → Vapi passes to LLM → LLM generates spoken reply
7. **If no tool call:** Vapi sends the LLM response to ElevenLabs for TTS → plays audio to customer
8. Throughout the call, Vapi fires `call.transcript` webhooks for each turn
9. When call ends, Vapi fires `call.ended` webhook with recording URL + duration

### Outbound call data flow

1. Dayjoy backend calls `POST /api/voice/calls` (JWT auth)
2. `VapiController.initiateCall()` calls `VapiClientService.createCall()`
3. VapiClientService POSTs to `https://api.vapi.ai/calls`
4. Vapi dials the customer phone number
5. Customer answers → Vapi starts the conversation (same as inbound from here)

---

## 4. Sequence Diagrams

### 4.1 Call Lifecycle

```
Customer   Vapi    Webhook    CallStarted   Transcript   FunctionCall   CallEnded   DB
   │       │       Controller    Handler       Handler       Handler       Handler    │
   │       │       │              │             │              │             │        │
   │ Call  │       │              │             │              │             │        │
   ├──────▶│       │              │             │              │             │        │
   │       │       │              │             │              │             │        │
   │       │ Webhook: call.started │             │              │             │        │
   │       ├──────▶│              │             │              │             │        │
   │       │       │ verify HMAC  │             │              │             │        │
   │       │       ├─────────────▶│             │              │             │        │
   │       │       │              │ create      │              │             │        │
   │       │       │              │ VoiceSession│              │             │        │
   │       │       │              ├──────────────────────────────────────────────────▶│
   │       │       │              │             │              │             │        │
   │       │       │ 200 OK       │             │              │             │        │
   │       │◀──────┤              │             │              │             │        │
   │       │       │              │             │              │             │        │
   │ "I have a problem"          │             │              │             │        │
   ├──────▶│       │              │             │              │             │        │
   │       │ STT → text          │             │              │             │        │
   │       │ LLM → "I'd be happy to help..."  │              │             │        │
   │       │ LLM → function-call: search_knowledge            │             │        │
   │       │       │              │             │              │             │        │
   │       │ Webhook: function-call             │              │             │        │
   │       ├──────▶│              │             │              │             │        │
   │       │       │ verify + route              │              │             │        │
   │       │       ├────────────────────────────▶│              │             │        │
   │       │       │              │             │ execute tool │             │        │
   │       │       │              │             ├──────────────────────────▶│        │
   │       │       │              │             │              │             │ RAG    │
   │       │       │              │             │◀──────────────────────────┤        │
   │       │       │              │             │ tool result │             │        │
   │       │       │◀───────────────────────────┤              │             │        │
   │       │       │              │             │              │             │        │
   │       │ LLM uses tool result, generates reply              │             │        │
   │       │ TTS → audio          │             │              │             │        │
   │       │ Webhook: call.transcript (user + assistant)        │             │        │
   │       ├──────▶│              │             │              │             │        │
   │       │       ├────────────────────────────▶│              │             │        │
   │       │       │              │             │ save         │             │        │
   │       │       │              │             │ VoiceTx      │             │        │
   │       │       │              │             ├──────────────────────────▶│        │
   │       │       │              │             │              │             │        │
   │       │ "Sure, I can help"   │             │              │             │        │
   │◀──────┤       │              │             │              │             │        │
   │       │       │              │             │              │             │        │
   │ Hang up       │              │             │              │             │        │
   ├──────▶│       │              │             │              │             │        │
   │       │ Webhook: call.ended  │             │              │             │        │
   │       ├──────▶│              │             │              │             │        │
   │       │       ├──────────────────────────────────────────────────────▶│        │
   │       │       │              │             │              │ update      │        │
   │       │       │              │             │              │ session     │        │
   │       │       │              │             │              │ create      │        │
   │       │       │              │             │              │ analytics   │        │
   │       │       │              │             │              ├──────────▶│        │
   │       │       │              │             │              │             │        │
```

### 4.2 Webhook Processing

```
Vapi        VapiWebhookController       VapiWebhookService        Handler
 │                   │                         │                      │
 │ POST /webhook     │                         │                      │
 │ + headers         │                         │                      │
 ├──────────────────▶│                         │                      │
 │                   │                         │                      │
 │                   │ verifySignature(payload,│                      │
 │                   │   signature, timestamp) │                      │
 │                   ├────────────────────────▶│                      │
 │                   │                         │                      │
 │                   │                         │ if NODE_ENV === test │
 │                   │                         │   return true        │
 │                   │                         │                      │
 │                   │                         │ if !webhookSecret    │
 │                   │                         │   throw 401          │
 │                   │                         │                      │
 │                   │                         │ if !signature        │
 │                   │                         │   return false       │
 │                   │                         │                      │
 │                   │                         │ if skew > 5 min      │
 │                   │                         │   return false       │
 │                   │                         │                      │
 │                   │                         │ HMAC-SHA256 verify   │
 │                   │                         │ (timingSafeEqual)    │
 │                   │                         │                      │
 │                   │ true / false            │                      │
 │                   │◀────────────────────────┤                      │
 │                   │                         │                      │
 │                   │ if !valid → 401         │                      │
 │                   │                         │                      │
 │                   │ processWebhook(event)   │                      │
 │                   ├────────────────────────▶│                      │
 │                   │                         │                      │
 │                   │                         │ switch(event.type)   │
 │                   │                         │  case 'call.started':│
 │                   │                         │    callStartedHandler│
 │                   │                         │    .handle(event)    │
 │                   │                         ├─────────────────────▶│
 │                   │                         │                      │
 │                   │                         │                      │ create
 │                   │                         │                      │ VoiceSession
 │                   │                         │                      │
 │                   │                         │   result             │
 │                   │                         │◀─────────────────────┤
 │                   │                         │                      │
 │                   │  {success: true, data}  │                      │
 │                   │◀────────────────────────┤                      │
 │                   │                         │                      │
 │ 200 OK            │                         │                      │
 │◀──────────────────┤                         │                      │
```

### 4.3 Tool Execution

```
FunctionCallHandler        ToolsService          SearchKnowledgeTool        RAG/DB
        │                       │                       │                     │
        │ handle(event)         │                       │                     │
        ├──────────────────────▶│                       │                     │
        │                       │                       │                     │
        │                       │ executeTool(          │                     │
        │                       │   'search_knowledge', │                     │
        │                       │   {query: 'return'},  │                     │
        │                       │   callId, sessionId)  │                     │
        │                       ├──────────────────────▶│                     │
        │                       │                       │                     │
        │                       │                       │ validate params     │
        │                       │                       │ (query non-empty?)  │
        │                       │                       │                     │
        │                       │                       │ ragService.search(  │
        │                       │                       │   {query, topK})    │
        │                       │                       ├────────────────────▶│
        │                       │                       │                     │
        │                       │                       │                     │ embed query
        │                       │                       │                     │ pgvector search
        │                       │                       │                     │ rerank
        │                       │                       │                     │
        │                       │                       │   [{content,         │
        │                       │                       │     source,         │
        │                       │                       │     similarity}]    │
        │                       │                       │◀────────────────────┤
        │                       │                       │                     │
        │                       │                       │ {success: true,     │
        │                       │                       │  data: results,     │
        │                       │                       │  message: 'Found N'}│
        │                       │◀──────────────────────┤                     │
        │                       │                       │                     │
        │                       │ result                │                     │
        │                       │   + log to            │                     │
        │                       │   tool_executions     │                     │
        │                       │                       │                     │
        │ result                │                       │                     │
        │◀──────────────────────┤                       │                     │
        │                                                                       │
        │ formatForVapi(result)                                                 │
        │                                                                       │
        │ return FunctionCallData                                               │
```

### 4.4 RAG Query

```
SearchKnowledgeTool        EmbeddingsService        pgvector (PostgreSQL)        LLM
        │                       │                       │                       │
        │ search({query})       │                       │                       │
        ├──────────────────────▶│                       │                       │
        │                       │ embed(query)          │                       │
        │                       ├──────────────────────────────────────────────▶│
        │                       │                       │                       │
        │                       │   [0.1, 0.2, ...]      │                       │
        │                       │◀──────────────────────────────────────────────┤
        │                       │                       │                       │
        │                       │ vector search         │                       │
        │                       │   ORDER BY embedding  │                       │
        │                       │   <=> $1 LIMIT k      │                       │
        │                       ├──────────────────────▶│                       │
        │                       │                       │                       │
        │                       │   [{chunk_id, content,│                       │
        │                       │     source, similarity}]                      │
        │                       │◀──────────────────────┤                       │
        │                       │                       │                       │
        │ rerank (optional)     │                       │                       │
        │ (LLM rerank or        │                       │                       │
        │  keyword overlap)     │                       │                       │
        │                       │                       │                       │
        │   final ranked chunks │                       │                       │
        │◀──────────────────────┤                       │                       │
        │                                                                       │
        │ return chunks to caller                                               │
        │ (caller = LLM, which uses the chunks                                  │
        │  to ground its spoken response)                                       │
```

---

## 5. Integration Points

### 5.1 Vapi

| Direction | Protocol | Auth | Purpose |
|-----------|----------|------|---------|
| Vapi → Backend | HTTPS POST | HMAC-SHA256 signature | Webhook events |
| Backend → Vapi | HTTPS REST | Bearer API key | Create/end calls, get transcripts/recordings |

**Webhook URL:** `https://api.dayjoy.ai/api/voice/webhook`

**Events we handle:** `call.started`, `call.ended`, `call.transcript`, `function-call`

**Vapi SDK:** `@vapi-ai/sdk` (wrapped by `VapiClientService`)

### 5.2 OpenAI

| Direction | Protocol | Auth | Purpose |
|-----------|----------|------|---------|
| Backend → OpenAI | HTTPS REST | Bearer API key | LLM completions, embeddings |

**Models:**
- `gpt-4o` — primary LLM for conversation
- `text-embedding-3-small` — embeddings for RAG

**Latency targets:**
- LLM completion: < 2 seconds p95
- Embeddings: < 200ms p95

### 5.3 PostgreSQL (with pgvector)

| Purpose | Tables |
|---------|--------|
| Voice AI data | `voice_sessions`, `voice_transcripts`, `voice_analytics`, `tool_executions` |
| Customer data | `customers`, `customer_addresses` |
| Sales data | `orders`, `order_items`, `products`, `categories` |
| Distributor data | `distributors` |
| Lead / appointment / ticket | `leads`, `appointments`, `support_tickets` |
| RAG | `rag_chunks` (with pgvector), `rag_queries` |

**Connection pool:** 20 (default), managed by Prisma.

### 5.4 Redis

| Purpose | Key pattern | TTL |
|---------|-------------|-----|
| Session memory | `session:{callId}` | 1 hour after call ends |
| Customer profile cache | `customer:{phone}` | 24 hours |
| Rate limit counters | `ratelimit:{ip}:{window}` | 1 minute |
| Idempotency keys | `idempotency:{eventId}` | 24 hours |
| RAG query cache | `rag:{hash(query)}` | 5 minutes |

### 5.5 RAG Pipeline

The RAG pipeline lives in `rag/` (separate from `vapi/`) and is
called by the `search_knowledge` tool. See the RAG module's own
architecture doc for details.

**Endpoint:** `POST /api/rag/search` (internal)

### 5.6 External services

| Service | Used by | Purpose |
|---------|---------|---------|
| SendGrid | `lead_capture`, `appointment_booking` | Send confirmation emails |
| Twilio | `human_transfer`, notifications | SMS notifications + call transfers |
| AWS S3 | `CallEndedHandler` | Store call recordings |
| Slack | Escalation handler | Post escalation notifications |

---

## 6. Data Model

### 6.1 VoiceSession

```prisma
model VoiceSession {
  id                String   @id @default(uuid())
  tenantId          String
  callId            String   @unique  // Vapi call ID
  conversationId    String?            // Link to AI conversation
  customerId        String?
  distributorId     String?
  userId            String?            // Dayjoy user who initiated (for outbound)
  phoneNumber       String
  status            String             // active | ended | failed
  direction         String             // inbound | outbound
  recordingUrl      String?
  transcript        String?  @db.Text  // Full transcript (denormalised)
  durationSeconds   Int?
  metadata          Json
  assistantId       String?
  assistantName     String?
  startedAt         DateTime
  endedAt           DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  transcripts       VoiceTranscript[]
  analytics         VoiceAnalytics?

  @@index([tenant_id])
  @@index([status])
  @@index([started_at])
  @@map("voice_sessions")
}
```

### 6.2 VoiceTranscript

```prisma
model VoiceTranscript {
  id          String   @id @default(uuid())
  sessionId   String
  tenantId    String
  role        String             // user | assistant
  content     String   @db.Text
  timestamp   DateTime
  isFinal     Boolean  @default(false)
  createdAt   DateTime @default(now())

  session     VoiceSession @relation(fields: [sessionId], references: [id])

  @@index([session_id])
  @@index([timestamp])
  @@map("voice_transcripts")
}
```

### 6.3 VoiceAnalytics

```prisma
model VoiceAnalytics {
  id                   String   @id @default(uuid())
  sessionId            String   @unique
  tenantId             String
  callDuration         Int
  talkTime             Int?
  listenTime           Int?
  silenceTime          Int?
  interruptionCount    Int      @default(0)
  toolCalls            Int      @default(0)
  ragQueries           Int      @default(0)
  sentiment            String?  // positive | neutral | negative
  resolution           String?  // resolved | escalated | abandoned
  customerSatisfaction Int?     // 1-5
  cost                 Decimal? @db.Decimal(10, 4)
  metadata             Json
  createdAt            DateTime @default(now())

  session              VoiceSession @relation(fields: [sessionId], references: [id])

  @@index([resolution])
  @@index([sentiment])
  @@map("voice_analytics")
}
```

### 6.4 ToolExecution

```prisma
model ToolExecution {
  id          String   @id @default(uuid())
  sessionId   String
  tenantId    String
  toolName    String
  parameters  Json
  result      Json
  success     Boolean
  durationMs  Int
  errorMessage String?
  createdAt   DateTime @default(now())

  @@index([session_id])
  @@index([tool_name])
  @@index([created_at])
  @@map("tool_executions")
}
```

---

## 7. Security Architecture

### 7.1 Authentication layers

```
                    ┌────────────────────────────┐
                    │   Public Internet          │
                    └─────────────┬──────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │   Ingress (nginx)          │
                    │   • TLS termination        │
                    │   • Rate limiting          │
                    │   • WAF rules              │
                    └─────────────┬──────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │   Voice AI Service         │
                    │                            │
                    │  ┌──────────────────────┐  │
                    │  │ /api/voice/*         │  │
                    │  │ (except /webhook)    │  │
                    │  │                      │  │
                    │  │ 1. JWT verification  │  │
                    │  │ 2. PermissionsGuard  │  │
                    │  │    (voice:*)         │  │
                    │  └──────────────────────┘  │
                    │                            │
                    │  ┌──────────────────────┐  │
                    │  │ /api/voice/webhook   │  │
                    │  │                      │  │
                    │  │ 1. HMAC-SHA256       │  │
                    │  │    signature verify  │  │
                    │  │ 2. Replay protection  │  │
                    │  │    (5 min skew)      │  │
                    │  │ 3. Rate limit        │  │
                    │  │    (1000/min per IP) │  │
                    │  └──────────────────────┘  │
                    └────────────────────────────┘
```

### 7.2 Secret management

- All secrets sourced from AWS Secrets Manager via ExternalSecrets
- No plaintext K8s Secrets
- IRSA (IAM Roles for Service Accounts) for pod → Secrets Manager auth
- Secrets rotated quarterly (or on incident)

### 7.3 Data protection

- **At rest:** PostgreSQL TDE, Redis TLS, S3 SSE-KMS for recordings
- **In transit:** TLS 1.2+ everywhere (ingress, egress, pod-to-pod via mTLS)
- **PII redaction:** Phone numbers + emails redacted in logs via a
  `LoggingInterceptor`

### 7.4 Webhook signature verification

The webhook endpoint is the **only** public endpoint that doesn't
require JWT. Instead, it requires an HMAC-SHA256 signature:

```
signature = HMAC-SHA256(secret, "<timestamp>.<payload>")
```

Verification is **unconditional** in production:
- `NODE_ENV !== 'test'` → must verify
- Missing `VAPI_WEBHOOK_SECRET` → throw 401 (fail closed)
- Missing signature header → return false
- Timestamp skew > 5 minutes → return false (replay protection)
- `timingSafeEqual` for signature comparison (no timing side-channel)

### 7.5 Row-Level Security

All voice tables have RLS policies enforcing tenant isolation:
```sql
CREATE POLICY tenant_isolation ON voice_sessions
  USING (tenant_id = current_setting('app.current_tenant')::text);
```

This means a query from tenant A can never see tenant B's data, even
if the application code has a bug.

---

## 8. Scalability + Performance

### 8.1 Horizontal scaling

- **3 replicas minimum** (set in Deployment)
- **HPA scales 3 → 10 replicas** based on CPU (70%) and memory (80%)
- **PDB keeps min 2 available** during node drains
- **Pod anti-affinity** spreads replicas across nodes

### 8.2 Vertical scaling

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 500m | 1000m |
| Memory | 512Mi | 1Gi |

### 8.3 Caching layers

| Layer | Cache | TTL |
|-------|-------|-----|
| RAG query results | Redis | 5 min |
| Customer profile | Redis | 24 hr |
| Product catalog | In-memory (Map) | 5 min |
| Session memory | Redis | 1 hr after call |

### 8.4 Database scaling

- pgBouncer for connection pooling (port 6432)
- Read replicas for analytics queries (off the primary)
- pgvector index tuned with `ef_search`

### 8.5 Performance budgets

| Operation | Budget |
|-----------|--------|
| Webhook receive → 200 OK | < 500ms p95 |
| Tool execution | < 1s p95 |
| RAG query | < 1s p95 |
| LLM response | < 2s p95 |
| DB write (single row) | < 50ms p95 |

### 8.6 Failure modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Vapi down | No calls | Route to backup number (manual) |
| OpenAI down | AI can't respond | Switch to fallback model (gpt-3.5) |
| PostgreSQL down | All endpoints 500 | Failover to replica |
| Redis down | Session memory lost (AI forgets context mid-call) | Restart Redis; AOF recovers |
| Single pod crash | Other pods handle traffic | HPA replaces pod |
| Node failure | Pods rescheduled | Pod anti-affinity ensures spread |

---

## Appendix: Module dependency graph

```
VapiModule
├── VapiController
│   ├── VapiClientService (config/)
│   └── PrismaService (_shared/database/)
│
├── VapiWebhookController
│   └── VapiWebhookService
│       ├── CallStartedHandler
│       ├── CallEndedHandler
│       ├── TranscriptHandler
│       └── FunctionCallHandler
│           └── ToolsService
│               ├── SearchKnowledgeTool
│               ├── SearchProductsTool
│               ├── CustomerLookupTool
│               ├── DistributorLookupTool
│               ├── LeadCaptureTool
│               ├── AppointmentBookingTool
│               ├── SupportTicketTool
│               └── HumanTransferTool
│
├── ConversationFlowManager
│   ├── CustomerSupportFlow
│   ├── ProductInquiryFlow
│   └── BusinessOpportunityFlow
│
├── VapiMemoryService
│   ├── SessionMemoryHandler
│   └── CustomerProfileHandler
│
├── AnalyticsDashboardService
│   ├── CallLogger
│   ├── ToolUsageTracker
│   └── AIMetricsService
│
└── (shared) PrismaService, RedisClient, OpenAIClient
```
