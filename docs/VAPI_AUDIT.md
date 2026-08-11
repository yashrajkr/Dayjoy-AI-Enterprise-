# Vapi Voice AI — Full Potential Audit

**Module:** `/home/z/my-project/build-zip/vapi/`
**Auditor:** Principal Voice AI Architect
**Date:** 2025-01
**Scope:** All 84 files across 10 sub-modules (~6,000 LOC of TypeScript + 20 docs)
**Method:** Read-only file inspection with specific evidence cited per finding.

---

## Executive Summary

- **Production readiness:** **6.5 / 10** — Core plumbing (webhooks, tools, memory, analytics, K8s) is solid and battle-ready. Two P0 correctness gaps (dead flow manager + non-functional call transfer) and one P0 security gap (unauthenticated analytics controller) block true production-go-live.
- **Vapi feature utilization:** **11 / 20** features properly used, **4** partially used, **5** completely missing.
- **Critical gaps:** **5** P0 issues that must be fixed before production traffic is allowed.
- **Code quality:** High — clean NestJS structure, comprehensive JSDoc, real (not mocked) backend integration in tools, multi-tenant scoping throughout, retry/backoff, idempotency.
- **Overall verdict:** The module is a strong, well-engineered foundation that **does not yet use Vapi to its full potential**. The conversation-flow subsystem (~1,900 LOC) is fully implemented but **never wired into the webhook pipeline** — it is dead code in production. The `human_transfer` tool records the intent but **does not actually transfer the call** — a critical UX/correctness bug.

---

## Feature utilization matrix

| # | Feature | Status | Evidence |
|---|---------|--------|----------|
| 1 | Assistant management (CRUD) | ✅ | `assistants/vapi-assistant.service.ts:79-309` — full create/get/list/update/soft-delete, dual-write to Vapi + Prisma `AiAgent`, best-effort degradation |
| 2 | Voice configuration | ⚠️ Partial | `config/vapi-assistant-config.ts:85-107` — only ElevenLabs (`rachel`/`josh`/`arnold`); Azure/Google/PlayHT providers in types but never wired; no voice cloning; `style`, `useSpeakerBoost` defined but never sent to Vapi API |
| 3 | Function calling (tools) | ✅ | `tools/vapi-tool-registry.service.ts:108-120` — 8 real tools with proper JSON-Schema `parameters`, registered via DI, executed via `function-call` webhook. **However**, tools' `speak` field is not surfaced to Vapi (only `data`) — see §2 |
| 4 | Conversation flows | ❌ **DEAD CODE** | `flows/vapi-conversation-flow-manager.ts` is never imported by any webhook handler (`grep VapiConversationFlowManager webhooks/` → 0 matches). 7 flows (~1,900 LOC) only run in tests. Vapi's LLM orchestrates directly via system prompt. |
| 5 | Telephony — inbound | ✅ | `webhooks/vapi-call-started-handler.ts:77-226` — creates `VoiceSession`, identifies caller via `Customer.phone`, seeds Redis session memory, builds personalized welcome message |
| 6 | Telephony — outbound | ✅ | `vapi.controller.ts:245-290` `POST /api/voice/calls` → `VapiClientService.createCall()` (`config/vapi-client-service.ts:218-239`) |
| 7 | Telephony — call transfer (human handoff) | ❌ **NOT FUNCTIONAL** | `tools/vapi-human-transfer-tool.ts:36-40, 239` — comment says "actual SIP transfer is performed by the Vapi webhook handler" but **no such handler exists**. Tool only updates DB status + sends IN_APP notification. Customer hears "transferring you now" but call is never actually transferred. |
| 8 | Call recording | ⚠️ Partial | `vapi.controller.ts:413-436` `GET /calls/:id/recording` proxies `VapiClientService.getRecording()`; recording URL stored on `VoiceSession.recordingUrl`. **But**: not stored to S3 (env has `STORAGE_BUCKET` but no code uses it), no retention policy, no redaction of PII |
| 9 | Webhooks — signature verification | ⚠️ Partial | `webhooks/vapi-webhook-service.ts:94-159` — HMAC-SHA256 + timing-safe compare + 5-min replay window ✅. **But**: controller uses `JSON.stringify(body)` instead of raw body (`webhooks/vapi-webhook-controller.ts:62-68`) — known limitation acknowledged in code comment. Real Vapi signatures may fail to verify if key-order/whitespace differs. |
| 10 | Webhooks — event coverage | ⚠️ Partial | 4 events handled (call-start, call-end, transcript, function-call). Missing: `end-of-call-report` (listed in config events but no handler), `status-update` (only logged), `hang` (only logged), `transfer` event (would be needed for §7) |
| 11 | Webhooks — idempotency | ✅ | `webhooks/vapi-webhook-service.ts:42, 186-210` — Redis SETNX with 72h TTL + DB `WebhookEvent` audit row as second line of defense |
| 12 | Transcription | ⚠️ Partial | `webhooks/vapi-transcript-handler.ts` — persists per-utterance to `VoiceTranscript` + mirrors to `Message` table. Uses Deepgram `nova-2`. **But**: no custom vocabulary (product names, distributor codes), no confidence threshold filtering, no real-time streaming to client |
| 13 | Analytics — call metrics | ✅ | `analytics/vapi-call-logger.ts` — duration, silence, talk time, tool calls, outcome, cost, sentiment; aggregate stats + drill-down + CSV/JSON export |
| 14 | Analytics — AI quality | ✅ | `analytics/vapi-ai-metrics.ts` — accuracy, CSAT, sentiment, hallucination rate (proxy: accuracy<30), escalation rate, 7-day trends, composite quality score |
| 15 | Multi-language | ❌ | `docs/vapi-user-guide.md:329-331` explicitly states "Currently the AI speaks English only. Multi-language support is on the roadmap." `VAPI_LANGUAGE=en-US` only configures transcription model, not TTS or LLM language. No Hindi/Telugu/Bengali despite India being primary market. |
| 16 | Call queues / hold music / queue position | ❌ | No implementation. `config/vapi-assistant-config.ts:53,144` has `holdMusic?: boolean` legacy field set to `false` but it's never sent to Vapi. Runbook mentions hold music (`docs/vapi-runbooks.md:518`) but no code configures it. |
| 17 | Barge-in / silence handling | ⚠️ Partial | Config has `backchannelingEnabled: true`, `silenceTimeoutSeconds: 30`, `responseDelaySeconds: 0.4`, `backgroundSound: 'office'` (`config/vapi-assistant-config.ts:104-106`) — these are sent to Vapi ✅. **But**: no fillers ("hmm", "let me check"), no timeout fallback messages, no per-flow silence tuning. |
| 18 | Edge cases (voicemail, no-answer, busy, failed) | ❌ | `config/vapi-config.ts:129-131` has `voicemailMessage` string but it's not wired into `VAPI_ASSISTANT_CONFIG`. No busy/failed detection. `VoiceCallOutcome` enum supports `VOICEMAIL`/`FAILED` but nothing populates them — Vapi's `summary.outcome` is mapped only for `COMPLETED`/`TRANSFERRED`/`ABANDONED`/`FAILED`/`VOICEMAIL` (`webhooks/vapi-call-ended-handler.ts:301-308`). |
| 19 | HIPAA / PCI compliance | ❌ | No compliance mode. Only "compliance" references are for legal-question escalation in prompts (`prompts/escalation-protocols.ts:23`). No DTMF-based card-capture flow, no recording-redaction for PCI, no BAA language. |
| 20 | Custom models (BYO LLM) | ⚠️ Partial | `config/vapi-config.ts:111-116` hardcodes `provider: 'openai'`, `model: 'gpt-4o'`. No Claude/Gemini/Anthropic support. The `VapiModelConfig.provider` type is `'openai'` only — not even a union. |
| 21 | Knowledge base attachment | ❌ | Vapi supports a `knowledgeBase` field on Assistant DTOs (server-side RAG). We never set it — we use our own `search_knowledge` function-calling tool instead. This is a valid architectural choice but means we miss Vapi's built-in caching + lower-latency retrieval. |
| 22 | Memory (session + cross-session) | ✅ | `memory/vapi-session-memory.ts` (Redis, 24h TTL) + `memory/vapi-customer-profile.ts` (DB + Redis cache, 1h TTL) + `memory/vapi-memory-service.ts:197-230` `buildMemoryContext()` aggregates session + customer + recent messages + long-term `AiMemory` into LLM context. Memory extracted at call-end (`webhooks/vapi-call-ended-handler.ts:251-294`). |
| 23 | Test numbers / sandbox | ❌ | No sandbox/test-number integration. Only `NODE_ENV === 'test'` bypasses signature verification (`webhooks/vapi-webhook-service.ts:100-102`) — a unit-test escape hatch, not a production sandbox. |
| 24 | Batch calling / campaigns | ❌ | No batch/campaign API. `docs/vapi-api-documentation.md:116` mentions `campaign` in metadata example but no batch endpoint exists. `POST /api/voice/calls` is one-at-a-time only. |
| 25 | API & SDK | ✅ | Uses official `@vapi-ai/sdk` (`config/vapi-client-service.ts:2`). REST API exposed via `vapi.controller.ts` + `assistants/vapi-assistant.controller.ts` + `analytics/vapi-analytics.controller.ts`. 12 endpoints total. |

**Tally:** ✅ 11 fully used · ⚠️ 7 partially used · ❌ 7 missing/unwired. **Effective utilization: ~55%.**

---

## Detailed findings

### 1. Assistant configuration — **Score: 7/10**

**What exists:**
- Full CRUD: `VapiAssistantService` (`assistants/vapi-assistant.service.ts:79-309`) — `createAssistant`, `getAssistant`, `listAssistants`, `updateAssistant`, `deleteAssistant` (soft-delete via `status='inactive'`).
- DTOs with class-validator: `CreateAssistantDto`, `UpdateAssistantDto` (`assistants/create-assistant.dto.ts`) — `name`, `type` (10 enum values), `systemPrompt`, `firstMessage`, `model`, `temperature` (0-2), `maxTokens` (1-8000), `voiceId`, `tools[]`.
- Dual-write: Vapi API first (best-effort), then Prisma `AiAgent` row. If Vapi is down, DB-only record created with `vapiAssistantId=null` (line 124-139).
- Multi-tenant: every query scoped by `user.tenantId` (line 171, 181, 201, 286).
- Tool list resolved at create-time: `toolRegistry.getToolDefinitions()` filtered by `dto.tools` (line 97-99).
- System prompt: dto override OR `buildDefaultSystemPrompt()` concatenating 4 prompt sections (`prompts/index.ts:36-49`).
- 4 system prompt sections: `MASTER_SYSTEM_PROMPT`, `DAYJOY_KNOWLEDGE_PROMPT`, `RAG_INTEGRATION_PROMPT`, `ESCALATION_PROTOCOLS`.
- REST controller with `JwtAuthGuard` + `RequirePermissions('voice:read'|'voice:update')` (`assistants/vapi-assistant.controller.ts:38-79`).
- 426-line spec file with 11 test cases covering happy path + Vapi-disabled fallback + tenant mismatch + NotFound (`assistants/vapi-assistant.service.spec.ts`).

**What's missing:**
- **No assistant versioning.** Updates overwrite the Vapi assistant in-place. No `version` field, no rollback, no A/B testing of prompts. Soft-delete preserves the row but not prior configurations.
- **No `forwardingPhoneNumbers`** field in the Vapi payload (`config/vapi-assistant-config.ts:69-107`). This is required for `human_transfer` to actually transfer — see §7.
- **No `voicemailMessage`** sent to Vapi (defined in config but not in `VAPI_ASSISTANT_CONFIG`).
- **No `endCallPhrases`** sent to Vapi (defined in config but not in `VAPI_ASSISTANT_CONFIG`).
- **No `backgroundSoundLevel`** tuning per assistant.
- **No knowledge-base attachment** (`knowledgeBase` Vapi field) — we always go through our own RAG tool.
- **No `transcriber`** Vapi-side config (we use Deepgram via `transcriptionModel` but Vapi's newer API uses `transcriber` object with `model`, `language`, `keywords`).
- **No custom vocabulary** for transcription (Dayjoy product names, distributor codes like "DJ12345" will be mis-transcribed).
- **Voice provider hardcoded to `'11labs'`** — Azure, PlayHT, Google defined in type but never selectable via DTO.

### 2. Function calling (tools) — **Score: 8/10**

**What exists:**
- **8 real tools**, none are stubs:
  1. `search_knowledge` — calls real `KnowledgeService.query()` (RAG pipeline) with citations + queryId + latencyMs (`tools/vapi-search-knowledge-tool.ts:81-93`).
  2. `search_products` — calls real `ProductsService.search()` with formatted voice response (`tools/vapi-search-products-tool.ts:72-103`).
  3. `customer_lookup` — calls real `CustomersService.findAll()` with exact-match post-filter (`tools/vapi-customer-lookup-tool.ts:76-91`).
  4. `distributor_lookup` — calls real `DistributorsService.findAll()` (`tools/vapi-distributor-lookup-tool.ts:73-87`).
  5. `create_lead` — writes to Prisma `Lead` table + links to existing customer via `Interaction` row (`tools/vapi-lead-capture-tool.ts:111-160`).
  6. `book_appointment` — writes to Prisma `Appointment` table with past-date validation (`tools/vapi-appointment-booking-tool.ts:135-158`).
  7. `create_support_ticket` — writes to Prisma `SupportTicket` + `Interaction` audit row (`tools/vapi-support-ticket-tool.ts:107-154`).
  8. `human_transfer` — updates `VoiceSession.status='transferring'` + sends IN_APP notification + writes audit `Interaction` (`tools/vapi-human-transfer-tool.ts:130-225`).
- Tool registry with DI: `VapiToolRegistry` (`tools/vapi-tool-registry.service.ts`) — `register`, `getTool`, `listTools`, `execute` (catches throws, returns `ToolResult`), `getToolDefinitions` (Vapi-shaped), `getToolSummaries`.
- Proper JSON-Schema `parameters` on every tool with `required` arrays and `enum` constraints (e.g. `interest: ['product','business','both']`, `priority: ['normal','high','urgent']`).
- Every tool returns `{ success, data, error, speak }` — `speak` is the natural-language text for the customer.
- `ToolContext` carries `tenantId`, `customerId`, `distributorId`, `conversationId`, `callId`, `sessionId`, `phoneNumber` — full multi-tenant scoping.
- `function-call` webhook handler (`webhooks/vapi-function-call-handler.ts:122-254`) parses Vapi's OpenAI-style `function.arguments` (JSON string), resolves session from Redis by callId, executes via registry, persists `AnalyticsEvent` with full audit (toolName, args, result, success, latencyMs, callId, sessionId, conversationId).
- 655-line spec file (`tools/vapi-tools.spec.ts`) + 280-line RAG integration test (`tests/vapi-rag-integration-tests.ts`).

**What's missing / broken:**
- **`human_transfer` tool does NOT actually transfer the call.** Line 36-40 comment: "The actual call transfer (SIP REFER) is performed by the Vapi `endCallFunctionEnabled` / `forwardingPhoneNumbers` config on the assistant — this tool just records the intent + notifies the team." **But**: (a) `forwardingPhoneNumbers` is never set in `VAPI_ASSISTANT_CONFIG`; (b) no webhook handler triggers a Vapi REST API call to transfer; (c) the function-call handler just returns the tool result and the call continues with the assistant. **Customer impact: caller is told "I'm transferring you now" but the call is never transferred.**
- **`speak` field is not surfaced to Vapi.** Tools carefully craft `speak` strings (e.g. "I found 3 products. First, Multivitamin for ₹499...") but `VapiFunctionCallHandler` returns `result.data` only (`webhooks/vapi-function-call-handler.ts:247-253`). Vapi feeds `data` to the LLM, which re-synthesizes its own response — the carefully-tuned voice formatting is discarded. To speak `speak` directly, the handler would need to return Vapi's `result` format with a `spokenResponse` field.
- **`customer_lookup` tool's `parameters` has `required: []`** (line 39) — the LLM can call it with no args, which immediately fails validation. Should be `required: ['phoneNumber']` or `['email']` (one-of).
- **No tool-level rate limiting** — a runaway LLM could call `search_knowledge` 50 times in one call.
- **No tool result caching** — same `search_knowledge` query in the same call re-runs RAG.
- **No async tool support** — Vapi's `function-call` webhook is synchronous with a ~5s timeout (`webhooks/vapi-function-call-handler.ts:91-95` comment acknowledges this). Long-running tools (e.g. booking that triggers email + SMS) will time out.
- **No tool-level retries** — `knowledgeService.query()` throwing once returns failure to LLM.

### 3. Webhooks — **Score: 7/10**

**What exists:**
- Single endpoint `POST /api/voice/webhook` (`webhooks/vapi-webhook-controller.ts:34-93`), `@Public()` (no JWT), protected by HMAC.
- **Signature verification** (`webhooks/vapi-webhook-service.ts:94-159`):
  - HMAC-SHA256 with `${timestamp}.${payload}` ✅
  - `crypto.timingSafeEqual` with length pre-check ✅
  - Replay protection: 5-minute timestamp skew window ✅
  - Fail-closed: throws `UnauthorizedException` if secret unset in non-test env ✅
  - Only bypass: `NODE_ENV === 'test'` ✅
- **Idempotency** (line 186-210): Redis `SETNX vapi:webhook:event:{eventId}` with 72h TTL. Falls back to DB-only if Redis down.
- **Audit row** (line 215-238): every webhook persisted to `WebhookEvent` table with raw payload + signature + `processed` flag + `processedAt` + `error`.
- **Event routing** (line 291-336): accepts both `call.started` (legacy dot) and `call-start` (new dash) notation. Routes to 4 typed handlers. Unknown events acknowledged with `unknown_event_type` (no infinite Vapi retries).
- 4 typed handlers: `VapiCallStartedHandler`, `VapiCallEndedHandler`, `VapiTranscriptHandler`, `VapiFunctionCallHandler`.
- 422-line test file with real `verifySignature` code path tests (valid, tampered, stale timestamp, missing secret, test-env bypass) + idempotency tests.

**What's broken / missing:**
- **CRITICAL — Signature verification uses re-serialized body.** `webhooks/vapi-webhook-controller.ts:62-68`:
  ```ts
  // Re-serialize the body for signature verification...
  // For higher fidelity a raw-body parser middleware would be wired here — see ADR-voice-002.
  const rawPayload = JSON.stringify(body);
  ```
  Vapi signs the **exact bytes it sent**. `JSON.stringify(parsedBody)` may produce different key order or whitespace. **In practice this often works because both Vapi and Node's `JSON.stringify` use insertion order**, but it is fragile and the code itself acknowledges the limitation. **Fix: register a raw-body middleware (e.g. `@nestjs/platform-express` with `rawBody: true`) and verify against `req.rawBody`.**
- **Dual signature-verification logic.** `config/vapi-client-service.ts:139-156` `VapiClientService.verifyWebhookSignature()` returns `true` (accepts unsigned!) when secret is missing — the comment even says "development-only behaviour". This method is unused in production (the webhook service has its own correct verifier) but its existence is a security landmine if any developer wires it in. **Fix: delete this method or make it throw when secret is missing.**
- **`end-of-call-report` event has no handler.** Listed in `config/vapi-config.ts:159-165` `webhook.events` array but `webhooks/vapi-webhook-service.ts:297-335` `route()` has no case for it. This is Vapi's richest event (cost, summary, transcript, recording URL, AI accuracy, CSAT) — currently dropped.
- **`status-update` and `hang` events only logged** (line 327-330) — no business logic. `hang` (customer hung up mid-call) should trigger the same cleanup as `call-end`.
- **No `transfer` event handler** — Vapi fires this when a transfer occurs; we'd need it to confirm transfers actually happened (which they don't — see §7).
- **Webhook returns 200 even on signature failure.** Line 81: `return { status: 'unauthorized' };` with HTTP 200. Vapi will not retry. This is intentional (avoid retry storms) but should return 401 to be HTTP-correct. The controller comment claims it returns 401 but the code doesn't.
- **Health endpoint is `@Post('health')`** (line 102) — unusual; Vapi's "test webhook" feature uses GET. The comment says "Vapi's dashboard has a 'test webhook' feature that pings the URL with a GET" but the endpoint is POST.
- **No rate limiting** on the webhook endpoint. K8s ingress has `limit-rps: "50"` (`deployment/vapi-kubernetes-manifests.yml:577`) but no application-level rate limit. A malicious actor with the secret (or a Vapi bug flooding transcripts) could DOS the service.

### 4. Conversation flows — **Score: 3/10** (subsystem exists but is dead code)

**What exists:**
- 7 fully-implemented flows (1,652 LOC total):
  - `VapiCustomerSupportFlow` (193 lines) — 6 steps: greeting → gather_issue → lookup → propose → confirm → close. Order-number extraction via regex. Escalation on frustration signals.
  - `VapiProductInquiryFlow` (206 lines) — 5 steps with product-name extraction + `search_products` tool call.
  - `VapiDistributorSupportFlow` (229 lines) — 5 steps with distributor identification + sub-topic classification.
  - `VapiBusinessPlanFlow` (212 lines) — 6 steps with comp-plan explanation + lead capture + appointment scheduling. Includes email/phone/name regex extraction.
  - `VapiAppointmentBookingFlow` (201 lines) — 5 steps collecting date/time/purpose.
  - `VapiLeadCollectionFlow` (205 lines) — 6 steps collecting name/email/phone/interest.
  - `VapiHumanEscalationFlow` (138 lines) — summarize → transfer with context summary for human agent.
- `VapiConversationFlowManager` (`flows/vapi-conversation-flow-manager.ts`, 319 lines):
  - 3-tier intent detection: active-flow prior → keyword heuristic → LLM classifier (`gpt-4o-mini`, temp 0).
  - Confidence threshold (0.5) — below it, asks user to clarify.
  - Flow state persisted to Redis session memory (`flowState`, `activeFlow` keys).
  - `resetFlowState()` for call-start.
  - `persistFlowState()` updates step + completedSteps + collectedData.
- Flow types: `FlowType` enum (7 values), `FlowState`, `FlowContext`, `FlowResponse` (with `message`, `toolCalls`, `escalateToHuman`, `endCall`, `nextStep`, `isComplete`, `collectedData`).
- Tests: `tests/vapi-flow-tests.ts` + `tests/vapi-voice-test-cases.ts` (12 canonical scenarios, table-driven).

**CRITICAL — Flow manager is never invoked in production.**
```
$ grep -r "VapiConversationFlowManager" vapi/webhooks/
(no matches)

$ grep -r "VapiConversationFlowManager" vapi/
vapi/flows/vapi-conversation-flow-manager.ts    (definition)
vapi/flows/vapi-flow-types.ts                    (type ref)
vapi/flows/vapi-flows.module.ts                  (DI registration)
vapi/tests/vapi-flow-tests.ts                    (test)
vapi/tests/vapi-voice-test-cases.ts              (test)
```
The `VapiConversationFlowManager` is registered in `VapiFlowsModule` and exported, but **no webhook handler imports `VapiFlowsModule` or injects the manager**. `VapiWebhooksModule` (`webhooks/vapi-webhooks.module.ts:28-29`) imports only `VapiMemoryModule` + `VapiAnalyticsModule` — not `VapiFlowsModule`.

**Consequence:** During a real call, Vapi's LLM orchestrates the conversation directly using the system prompt + tools. The 7 flows and the LLM intent classifier (`gpt-4o-mini`) **never run**. The flow state in Redis (`flowState`, `activeFlow`) is never set or read. The 1,900 LOC of flow code is dead weight.

**This is actually OK architecturally** — Vapi's LLM is designed to do this orchestration, and the system prompt (`prompts/master-system-prompt.ts`) does tell the LLM when to call each tool. **But** it means:
1. The flow tests pass but don't test production behavior.
2. The carefully-tuned flow scripts (e.g. "I found 3 products. First, X for ₹499. Second, ...") are not used — the LLM generates its own responses.
3. The `toolCalls` field in `FlowResponse` is never translated into actual Vapi function calls.
4. Intent detection happens via the LLM implicitly, not via the heuristic+LLM classifier.

**Decision required:** Either (a) wire the flow manager into the `transcript` webhook handler (run `processFlow()` on every user utterance and return `response.message` as the assistant's reply — but this fights with Vapi's LLM), or (b) **delete the flow subsystem** and rely on Vapi's LLM + system prompt + tools (the Vapi-native approach). Option (b) is recommended — the flow code is duplicated effort that fights Vapi's design.

**Other gaps:**
- No conditional branching beyond simple keyword regex.
- No slot-filling validation (e.g. "is this email format valid?").
- No A/B testing of flow scripts.
- No analytics on flow completion rates (because flows don't run).

### 5. Memory — **Score: 9/10**

**What exists:**
- **3-tier memory architecture** (`memory/vapi-memory-service.ts:11-31`):
  1. Session memory — Redis, 24h TTL, JSON blob under `vapi:session:{sessionId}` + reverse lookup `vapi:call:{callId}:sessionId` (`memory/vapi-session-memory.ts:12, 23-26`).
  2. Customer profile — Postgres `Customer` + recent orders + `AiMemory` (PREFERENCE/FACT), cached in Redis 1h under `vapi:customer:{id}:profile` (`memory/vapi-customer-profile.ts:13, 46-138`).
  3. Long-term memory — Postgres `AiMemory` table (FACT/PREFERENCE/HISTORY/CONTEXT), written via `remember()` with cache invalidation.
- Multi-replica safe: all state in Redis/Postgres, no in-process maps (`memory/vapi-session-memory.ts:14-21` comment explicitly addresses this).
- `buildMemoryContext()` (`memory/vapi-memory-service.ts:197-230`) aggregates session + customer + last 10 messages + long-term memories into a single `MemoryContext` for the LLM.
- `buildSummary()` (line 236-283) produces a one-paragraph "who is this caller" summary for the system prompt.
- Memory extraction at call-end: `webhooks/vapi-call-ended-handler.ts:251-294` writes a HISTORY memory ("Call on YYYY-MM-DD: intent=X, duration=Ys, outcome=Z") + a CONTEXT memory ("last-intent-X").
- Profile cache invalidation on `remember()` (`memory/vapi-customer-profile.ts:235-237`).
- Atomic-ish `incrementToolCalls()` (`memory/vapi-session-memory.ts:156-164`) — read-merge-write, acknowledged as not transactional but adequate for one-writer-per-call.
- Personalized welcome message based on customer profile + recent orders + distributor status (`webhooks/vapi-call-started-handler.ts:314-334`).
- Tests: `tests/vapi-memory-tests.ts` (310+ lines).

**What's missing:**
- **Memory is never injected into the LLM prompt.** `buildMemoryContext()` exists but is **never called by any webhook handler** (`grep buildMemoryContext vapi/webhooks/` → 0 matches). The system prompt sent to Vapi at assistant-creation time is static. The customer profile, recent orders, long-term memories — none of this reaches the LLM during a call. **This is a significant missed personalization opportunity.**
- No memory consolidation / summarization (long-running customers accumulate dozens of HISTORY rows with no compaction).
- No memory decay (old facts never expire unless `expiresAt` set, which `remember()` never sets).
- No PII redaction in stored memories (customer phone, email persist forever in `AiMemory.value`).
- No cross-customer memory (e.g. "customers in tier X prefer...").
- `getSessionIdByCallId()` reverse-lookup key has same TTL as session — if session expires but call continues (long calls), reverse lookup fails.

### 6. Analytics — **Score: 9/10**

**What exists:**
- `VapiCallLogger` (`analytics/vapi-call-logger.ts`) — per-call analytics upsert (idempotent on `sessionId`), aggregate stats (total/completed/transferred/abandoned/failed/voicemail, avg duration, total cost, total tool calls, human handoff rate), recent calls, call details, CSV/JSON export.
- `VapiToolUsageTracker` (`analytics/vapi-tool-usage-tracker.ts`) — per-tool stats from `AnalyticsEvent` rows (`eventType='tool_execution'`): execution count, success rate, avg latency, failing tools (<80% success), top tools, recent executions, export.
- `VapiAiMetrics` (`analytics/vapi-ai-metrics.ts`) — accuracy (0-100), CSAT (1-5), sentiment (-1..1), hallucination rate (proxy: accuracy<30), escalation rate, 7-day trends, composite quality score (weighted: 50% accuracy + 30% CSAT + 20% sentiment).
- `VapiAnalyticsDashboard` (`analytics/vapi-analytics-dashboard.ts`) — composite payload, health status (healthy/degraded/unhealthy with thresholds), performance report with operational recommendations ("tool success rate below 95%, investigate X"), CSV/JSON export.
- 7 REST endpoints under `/api/voice/analytics/`: `dashboard`, `calls`, `calls/:sessionId`, `tools`, `ai`, `report`, `export`.
- `VoiceAnalytics` Prisma model with `callDuration`, `talkTime`, `silenceTime`, `interruptionCount`, `toolCalls`, `ragQueries`, `sentiment`, `resolution`, `customerSatisfaction`, `cost` (`config/vapi-database-schema.prisma:71-101`).
- `VoiceTranscript` model with `role`, `content`, `timestamp`, `tokensUsed`, `confidence`.
- Per-utterance transcript persistence with `isFinal` flag for live captions (`webhooks/vapi-transcript-handler.ts:101-114`).
- Tool execution audit in `AnalyticsEvent.eventData` JSON (toolName, args, result, success, error, latencyMs, callId, sessionId, conversationId).
- Recording URL persisted on `VoiceSession.recordingUrl` + retrievable via `GET /calls/:id/recording` (`vapi.controller.ts:413-436`).

**What's missing:**
- **CRITICAL — `VapiAnalyticsController` has NO auth guard.** `analytics/vapi-analytics.controller.ts:43-52` — no `@UseGuards(JwtAuthGuard)`, no `@RequirePermissions`. `tenantId` comes from a **query parameter** (line 60-63, 75-80, etc.), not from JWT. **Anyone who knows or guesses a tenant ID can read all call analytics, transcripts, tool executions, and recordings for that tenant.** The controller's own comment acknowledges this: "we leave the guards off here so the controller is independently testable" (line 36-38). This is a P0 security hole. **Fix: add `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('analytics:read')` and read `tenantId` from `@CurrentUser()`.**
- **No real-time streaming** — dashboard is poll-based only. `DashboardMetrics.realtime` type is defined (`analytics/vapi-analytics-types.ts:87-93`) but never populated.
- **No recordings stored to S3** — env has `STORAGE_BUCKET=s3://dayjoy-voice-recordings` but no code uploads recordings. They live on Vapi's servers and disappear when Vapi's TTL expires.
- **No transcript search** — can't find "all calls where customer mentioned 'refund'".
- **No sentiment analysis** computed locally — relies on Vapi's `summary.sentimentScore` which is often null.
- **No cost tracking accuracy** — `costUsd` comes from Vapi's `summary.costUsd` but Vapi doesn't always populate it.
- **Hallucination rate is a proxy** (accuracy<30) — no actual hallucination detection. `markHallucination()` exists but is never called by any automated check.
- **No per-tenant dashboard config** — all tenants see the same metrics.
- **CSV export is flat key-value** (`analytics/vapi-analytics-dashboard.ts:263-282`) — not a proper table; one row per metric, not one row per call.

### 7. Telephony features — **Score: 4/10**

**What exists:**
- **Inbound calls:** `VapiCallStartedHandler` creates `VoiceSession`, identifies caller by phone, seeds session memory, builds welcome message.
- **Outbound calls:** `POST /api/voice/calls` (`vapi.controller.ts:245-290`) → `VapiClientService.createCall()` (`config/vapi-client-service.ts:218-239`). Customer + metadata passed through.
- **Call end:** `POST /api/voice/calls/:id/end` (`vapi.controller.ts:370-406`) → `VapiClientService.endCall()`.
- **Call recording:** `GET /api/voice/calls/:id/recording` proxies Vapi.
- **Call listing:** paginated `GET /api/voice/calls` with filters (status, phoneNumber, customerId, date range).
- **Active sessions:** `GET /api/voice/sessions/active`.
- **Direction normalization:** both `inbound` and `outbound` directions handled, normalized to uppercase.
- **Personalized welcome** based on customer profile (distributor vs customer vs anonymous, recent orders).

**What's CRITICAL-broken:**
- **`human_transfer` tool does NOT transfer the call.** See §2. The tool's comment (`tools/vapi-human-transfer-tool.ts:36-40`) claims the actual SIP transfer is done by Vapi's `forwardingPhoneNumbers` config, but:
  - `forwardingPhoneNumbers` is **never set** in `VAPI_ASSISTANT_CONFIG` (`config/vapi-assistant-config.ts:69-107`).
  - No webhook handler calls any Vapi transfer API.
  - `grep -r "vapiClient\.\(transfer\|forward\)" vapi/` → 0 matches.
  - The function-call handler just returns the tool result and the call continues with the assistant.
  - **Customer impact: caller hears "I'm transferring you to Customer Service now. Please stay on the line" — but the call is never transferred. The assistant continues talking.**

  **Fix:** Either (a) add `forwardingPhoneNumbers` to `VAPI_ASSISTANT_CONFIG` per department and have the `function-call` handler return Vapi's transfer directive, or (b) call `POST /vapi/calls/{id}/transfer` (or the equivalent in `@vapi-ai/sdk`) from the webhook handler.

**What's missing:**
- **No DTMF / keypad input.** No `gather` tool, no IVR menus, no "press 1 for sales, 2 for support". `grep -ri dtmf vapi/` → 0 matches. Vapi supports DTMF via `assistant.voicemailDetection` and custom tools — we don't use it.
- **No call queues / hold music / queue position.** `holdMusic?: boolean` legacy field (`config/vapi-assistant-config.ts:53`) is `false` and never sent to Vapi.
- **No voicemail detection / message.** `voicemailMessage` defined in config (`config/vapi-config.ts:129-131`) but never sent to Vapi assistant payload. If Vapi detects an answering machine, the assistant has no message to leave.
- **No busy / no-answer / failed detection.** `VoiceCallOutcome` enum has `FAILED`/`VOICEMAIL` but no logic populates them — they rely on Vapi's `summary.outcome` which is mapped only for 5 hardcoded strings.
- **No call transfer confirmation.** No webhook handler for `transfer` event (if Vapi fires one).
- **No outbound campaign / batch calling.** One call at a time via `POST /calls`.
- **No call scheduling** (e.g. "call this lead tomorrow at 10am").
- **No concurrent call limits** enforced at app level (K8s `MAX_CONCURRENT_CALLS=100` env var exists but no code reads it).
- **No call recording redaction** for PCI/PII.

### 8. Testing — **Score: 7/10**

**What exists (real Vitest tests, not pseudo-tests):**
- 9 test files in `vapi/tests/` + 2 in-place specs:
  - `vapi-test-setup.ts` (321 lines) — shared mocks: `createMockPrismaService`, `createMockRedis`, `createMockOpenAI`, `createMockVapiClient`, `computeValidVapiSignature` (real HMAC), fixtures (`mockWebhookEvent`, `mockToolCallRequest`, `mockFlowState`).
  - `vapi-tool-tests.ts` — all 8 tools happy path + validation + error.
  - `vapi-flow-tests.ts` — all 7 flows + manager.
  - `vapi-memory-tests.ts` — session + customer profile + memory service lifecycle.
  - `vapi-webhook-tests.ts` (422 lines) — real signature verification (valid/tampered/stale/missing-secret), idempotency, 4 event handlers.
  - `vapi-e2e-tests.ts` (328 lines) — full call lifecycle: start → tool → transcript → end.
  - `vapi-load-tests.ts` (286 lines) — 100 concurrent call-starts, 100 concurrent tool executions, 100 concurrent session-memory writes, SETNX dedup.
  - `vapi-rag-integration-tests.ts` — search_knowledge + citations + hallucination checks.
  - `vapi-voice-test-cases.ts` — 12 canonical voice scenarios (table-driven).
  - `vapi-tools.spec.ts` (655 lines) — per-tool integration tests.
  - `vapi-assistant.service.spec.ts` (426 lines) — assistant CRUD with Vapi-disabled fallback.
- Tests use real `verifySignature` code path (set `NODE_ENV='production'` in `beforeEach`) — not the test bypass.
- `computeValidVapiSignature()` helper computes real HMAC-SHA256.
- E2E test wires real handlers with real dependencies (session memory, customer profile, ai metrics, call logger) — only Prisma/Redis/tool-registry mocked.

**What's missing:**
- **No integration tests against real Vapi API.** All tests mock `VapiClientService`. No sandbox/test-number tests that actually place a call.
- **No contract tests** for Vapi webhook payload shapes — if Vapi changes a field name, we won't know until production.
- **No load tests against real Vapi** — only against mocked Redis/Prisma.
- **Flow tests test dead code** (see §4) — they pass but don't reflect production behavior.
- **No test for the `end-of-call-report` event** (because there's no handler).
- **No test for the analytics controller's missing auth** (because the test would fail).
- **No mutation testing** — no verification that tests actually catch bugs.
- **No coverage threshold** configured.

### 9. Deployment — **Score: 9/10**

**What exists:**
- **Docker:** 2 Dockerfiles (root `vapi/Dockerfile` + `vapi/deployment/Dockerfile`). Multi-stage build, non-root user (`nodejs:1001`), `curl` for healthcheck, `HEALTHCHECK` hitting `/health/ready`.
- **Docker Compose** (`deployment/vapi-docker-config.yml`, 235 lines) — voice-ai (2 replicas) + postgres (pgvector/pgvector:pg15) + redis (7-alpine, AOF, maxmemory 512mb LRU) + prometheus + grafana + loki. Resource limits, healthchecks, restart policies, log rotation.
- **Kubernetes** (`deployment/vapi-kubernetes-manifests.yml`, 669 lines) — production-grade:
  - Namespace + ConfigMap + SecretStore + ExternalSecret (AWS Secrets Manager, 14 secrets).
  - ServiceAccount with IRSA annotation.
  - Deployment (3 replicas, RollingUpdate maxSurge=1/maxUnavailable=0, pod anti-affinity, tolerations).
  - Service (ClusterIP, ports 3001 + 9090).
  - HPA (3-10 replicas, CPU 70% + memory 80%, scale-up/down policies).
  - PodDisruptionBudget (minAvailable 2).
  - NetworkPolicy (ingress from nginx-ingress + monitoring; egress to DNS/443/5432/6379).
  - ServiceMonitor (Prometheus, 30s scrape).
  - Ingress (TLS via cert-manager, nginx rate-limit 50 rps).
  - PrometheusRule (4 alerts: high error rate, high latency, pod restart, pod not ready).
  - Liveness/Readiness/Startup probes (separate paths: `/health/live`, `/health/ready`).
- **Environment config** (`deployment/vapi-environment-config.env`, 175 lines) — 80+ env vars, secrets marked `<FROM_SECRETS_MANAGER>`, feature flags, rate limits, concurrency limits, graceful shutdown, backup config.
- **Production checklist** (`deployment/vapi-production-checklist.md`, 339 lines) — 200+ items across Pre-Deployment / Post-Deployment / 24-hour monitoring.

**What's missing:**
- **Two conflicting Dockerfiles.** `vapi/Dockerfile` (root, uses `node:20-slim`, builds `vapi/dist/main.js`) vs `vapi/deployment/Dockerfile` (uses `node:20-alpine`, builds `backend/dist/main.js`). The K8s manifest doesn't reference either by name. Unclear which is canonical.
- **No Helm chart** — raw YAML only, no templating for dev/staging/prod environments.
- **No `values.yaml`** for environment-specific config.
- **No `skaffold.yaml`** or `tilt.yaml` for local dev.
- **No canary / blue-green deployment** manifests.
- **No `preStop` hook** for graceful shutdown in K8s (env has `SHUTDOWN_TIMEOUT=30000` but no manifest uses it).
- **No `topologySpreadConstraints`** (only `podAntiAffinity` preferred).
- **No `PodSecurityPolicy` / `SecurityContextConstraints`** (uses `runAsNonRoot: true` but no `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `drop: ['ALL']` capabilities).
- **ConfigMap checksum is a placeholder** (`CONFIG_CHECKSUM_PLACEHOLDER` at line 295) — won't trigger rollout on config change.
- **No `VerticalPodAutoscaler`** — only HPA.
- **No `PriorityClass`** — voice-ai pods compete with other workloads.
- **Health endpoint `/health/ready` referenced but not implemented in this module** — assumed to exist in the host `backend/` app. If missing, all probes fail.

### 10. Documentation — **Score: 8/10**

**What exists:**
- 20 doc files in `vapi/docs/`:
  - `vapi-README.md` (418 lines) — comprehensive module README.
  - `vapi-api-documentation.md` (736 lines) — full REST API reference with examples, error codes, permissions.
  - `vapi-user-guide.md` — operator guide.
  - `vapi-runbooks.md` (822 lines) — 12 runbooks: deployment, rollback, call failure, webhook signature failure, high latency, low AI accuracy, escalation queue overflow, Vapi outage, DB outage, Redis outage, incident response, monitoring.
  - `vapi-troubleshooting-guide.md` (760 lines) — 11 sections: call quality, tool execution, webhook, DB, memory, performance, auth, Vapi integration, debug commands, log analysis, performance tuning.
  - `vapi-architecture.md` (733 lines) — system overview, component diagram, data flow, sequence diagrams, integration points, data model, security, scalability.
  - `vapi-monitoring-checklist.md` — monitoring setup.
  - `vapi-quick-start.md` — 5-minute quickstart.
  - `vapi-complete-file-list.md`, `vapi-complete-implementation-summary.md`, `vapi-final-implementation-summary.md`, `vapi-all-63-files-confirmed.md` — file inventories (some redundancy).
  - `FILE_MANAGEMENT_GUIDE.md` — file org conventions.
  - `vapi-module-{1..9}-setup-guide.md` — per-module setup guides (some redundancy with quick-start).
  - `vapi-module-3-4-comprehensive-setup-guide.md` — combined guide.
- `VOICE_AI_DESIGN.md` (513 lines) — design document with goals, non-goals, architecture diagram, sequence flows.
- `README.md` (380 lines) — top-level overview, setup, API table, testing, deployment.
- Inline JSDoc on every service, interface, and method (very high quality — explains *why*, not just *what*).

**What's missing:**
- **No OpenAPI / Swagger spec** — API docs are Markdown only, no machine-readable spec for client SDK generation.
- **No Postman collection** for manual testing.
- **No architecture diagram as code** (Mermaid / PlantUML) — only ASCII art.
- **No ADRs** (Architecture Decision Records) — the webhook controller references "ADR-voice-002" for raw-body verification but no ADR file exists.
- **Redundancy:** 3 "implementation summary" files + 9 "module setup guide" files + 2 "file list" files. Could be consolidated.
- **No changelog** — version is `2.0.0` everywhere but no `CHANGELOG.md` for the vapi module.
- **No on-call phone escalation tree** in the runbooks.
- **No customer-facing documentation** (what to expect when calling Dayjoy AI).

---

## Critical gaps (must fix for production)

### P0 — Block production go-live

1. **`human_transfer` tool does not actually transfer calls.** (`tools/vapi-human-transfer-tool.ts:36-40, 239`) Customer hears "transferring you now" but call never transfers. Either set `forwardingPhoneNumbers` in assistant config or call Vapi's transfer API from the webhook handler. **Customer-visible bug.**

2. **`VapiAnalyticsController` has no authentication.** (`analytics/vapi-analytics.controller.ts:43-52`) Reads `tenantId` from query param. Anyone can read all call analytics, transcripts, tool executions, recordings for any tenant by guessing tenant IDs. **Security hole.**

3. **Webhook signature verification uses re-serialized body.** (`webhooks/vapi-webhook-controller.ts:62-68`) Uses `JSON.stringify(body)` instead of raw bytes. Works today by luck (Vapi + Node both use insertion-order JSON) but will break silently if either changes. Register raw-body middleware and verify against `req.rawBody`.

4. **Conversation flow manager is dead code.** (`flows/vapi-conversation-flow-manager.ts`) 1,900 LOC of flows + intent classifier never invoked by any webhook handler. Either wire it in or delete it. Currently it gives false confidence (tests pass but don't test production behavior).

5. **Memory context is never injected into the LLM.** (`memory/vapi-memory-service.ts:197-230` `buildMemoryContext()` never called by webhook handlers.) Customer profile, recent orders, long-term memories, last intent — none of this reaches the LLM during a call. Personalization opportunity completely missed.

### P1 — Should fix before scaling

6. **`end-of-call-report` webhook event has no handler** (`webhooks/vapi-webhook-service.ts:297-335`). This is Vapi's richest event (cost, summary, recording, AI accuracy, CSAT) — currently dropped. Add a handler that populates `VoiceAnalytics` from it.

7. **Dual signature verification logic** (`config/vapi-client-service.ts:139-156`). Unused `verifyWebhookSignature()` method returns `true` when secret is missing. Delete it or make it throw.

8. **No DTMF / keypad input support.** Cannot build IVR menus or collect PINs / card numbers.

9. **No multi-language support.** `docs/vapi-user-guide.md:329-331` confirms English-only. India is the primary market — Hindi/Telugu/Bengali/Tamil needed.

10. **No voicemail detection / message.** `voicemailMessage` defined but never sent to Vapi. If answering machine picks up, assistant has nothing to say.

11. **No recordings stored to S3.** Env has `STORAGE_BUCKET` but no upload code. Recordings disappear when Vapi's TTL expires.

12. **No assistant versioning.** Updates overwrite in-place. No rollback, no A/B testing.

13. **`customer_lookup` tool has `required: []`** (`tools/vapi-customer-lookup-tool.ts:39`). LLM can call with no args, immediately fails. Should be one-of `[phoneNumber, email]`.

14. **No tool-level rate limiting or caching.** Runaway LLM could call `search_knowledge` 50× per call.

15. **No call queue / hold music.** `holdMusic` field is `false` and never sent to Vapi.

---

## Recommended upgrades (to use full Vapi potential)

### High impact

1. **Wire memory context into the assistant.** Use Vapi's `assistant.model.messages` with a dynamic `knowledgeBase` or `context` field, OR use the `function-call` webhook to inject `buildMemoryContext().summary` as a system message before each turn. This unlocks personalized greetings ("Welcome back, Raj! I see your last order..."), context-aware tool calls, and cross-session continuity.

2. **Implement actual call transfer.** Add `forwardingPhoneNumbers` per department to `VAPI_ASSISTANT_CONFIG`, OR call `client.calls.transfer(callId, { forwardingPhoneNumber })` from `VapiFunctionCallHandler` when `toolName === 'human_transfer'`. Return Vapi's transfer directive in the webhook response.

3. **Add `end-of-call-report` handler.** This single event gives you cost, summary, recording URL, AI accuracy, CSAT, sentiment — all without per-event polling. Populates `VoiceAnalytics` in one shot.

4. **Add Vapi `knowledgeBase` attachment.** For static knowledge (return policy, FAQ), attach directly to the assistant for Vapi-side RAG (lower latency, no function-call round-trip). Keep `search_knowledge` tool for dynamic / tenant-specific knowledge.

5. **Add multi-language support.** Set `transcriber.language` and `voice.language` on assistant based on caller's phone country code or `customer.preferences.language`. Hindi + Telugu + Tamil for India market.

6. **Add DTMF support.** New `collect_dtmf` tool + `assistant.dtmf` config for IVR menus ("Press 1 for sales, 2 for support") and PCI-compliant card capture ("Enter your 16-digit card number").

7. **Wire the flow manager OR delete it.** If keeping: invoke `flowManager.processFlow()` in the `transcript` webhook for user turns and return `response.message` as the assistant reply (requires configuring Vapi to use `model: 'custom-llm'` with our webhook as the LLM endpoint). If deleting: remove `flows/` directory and `VapiFlowsModule` import, update tests, simplify mental model.

8. **Add raw-body middleware for webhook verification.** `app.use(rawBodyMiddleware)` or `NestFactory.create(app, { rawBody: true })` — verify against `req.rawBody.toString()`.

9. **Add batch calling / campaigns.** `POST /api/voice/calls/batch` accepting an array of `{phoneNumber, customerId, metadata}` and using Vapi's batch API or a queue (BullMQ) for throttled outbound.

10. **Add call recording upload to S3.** On `call-end` webhook, fetch recording URL from Vapi, stream to S3 with `STORAGE_BUCKET`, update `VoiceSession.recordingUrl` to the S3 URL. Add 90-day lifecycle policy.

### Medium impact

11. **Add assistant versioning.** New `AssistantVersion` table, `POST /assistants/:id/rollback/:version` endpoint, A/B testing via `metadata.variant`.

12. **Add custom vocabulary to transcription.** Pass `keywords: ['Dayjoy', 'DJ12345', 'BV', 'PV', 'multivitamin', ...]` to Vapi's `transcriber.keywords` field.

13. **Add tool result caching.** Redis cache on `search_knowledge:{tenantId}:{queryHash}` with 5-min TTL.

14. **Add real-time dashboard via WebSocket / SSE.** Stream `transcript` events to the dashboard for live call monitoring.

15. **Add transcript search.** Postgres `tsvector` index on `VoiceTranscript.content` + `GET /api/voice/transcripts/search?q=refund`.

16. **Add HIPAA / PCI compliance mode.** Per-assistant flag `compliance: 'HIPAA' | 'PCI' | null`. When set: disable recording, redact PII from transcripts, enable DTMF-only card capture, sign BAA.

17. **Add BYO LLM support.** Extend `VapiModelConfig.provider` to `'openai' | 'anthropic' | 'google' | 'custom'`. Pass through to Vapi assistant `model.provider`.

18. **Add call scheduling.** `POST /api/voice/calls/schedule` with `scheduledAt` — uses BullMQ delayed job to fire `createCall` at the scheduled time.

19. **Add concurrent call limits.** Read `MAX_CONCURRENT_CALLS` env var, enforce via Redis semaphore before `createCall`.

20. **Add Helm chart.** Template the K8s manifests for dev/staging/prod. Add `values.yaml` with environment-specific replicas, resources, feature flags.

---

## What's already good

1. **Real backend integration in tools** — `KnowledgeService`, `ProductsService`, `CustomersService`, `DistributorsService`, `NotificationsService`, `Prisma`. No mocks, no stubs. Tools write real leads, appointments, tickets to the DB.

2. **Webhook signature verification is correct** (HMAC-SHA256, timing-safe compare, 5-min replay window, fail-closed on missing secret). The only issue is the re-serialized body, not the crypto.

3. **Idempotency via Redis SETNX + DB audit row** — duplicate webhooks are no-ops. 72h TTL covers Vapi's retry window.

4. **Multi-tenant scoping throughout** — every Prisma query filters by `tenantId`. `ToolContext.tenantId` is required. Voice sessions, transcripts, analytics, tool executions all tenant-scoped.

5. **3-tier memory architecture** (Redis session + Redis-cached customer profile + Postgres long-term `AiMemory`) — well-designed, multi-replica safe.

6. **Comprehensive analytics** — call stats, tool usage, AI quality (accuracy/CSAT/sentiment/hallucination), health status with thresholds, performance reports with recommendations, CSV/JSON export.

7. **Production-grade K8s manifests** — HPA, PDB, NetworkPolicy, ServiceMonitor, PrometheusRule, ExternalSecrets, IRSA, pod anti-affinity, 3 probes (liveness/readiness/startup).

8. **Comprehensive test suite** — 9 test files + 2 in-place specs, real Vitest tests with real `verifySignature` code path, E2E lifecycle test, load tests (100 concurrent), RAG integration tests, 12 canonical voice scenarios.

9. **Best-effort degradation** — assistant service creates DB row even when Vapi is unavailable; webhook service falls back to DB-only idempotency if Redis is down; tools return friendly `speak` errors instead of throwing.

10. **Retry with exponential backoff** in `VapiClientService.withRetry()` (`config/vapi-client-service.ts:336-374`) — 3 retries, 200ms base, retries on network errors + 5xx + 429.

11. **Soft-delete preserves audit trail** — assistants are deactivated, not deleted, so past voice sessions still resolve.

12. **DTOs with class-validator** — `CreateAssistantDto`, `UpdateAssistantDto`, `InitiateCallDto`, `QueryCallsDto`, `QueryAnalyticsDto` all validated.

13. **Permission model** — `voice:read`, `voice:create`, `voice:update` permissions enforced via `@RequirePermissions` decorator on the main controller (the analytics controller is the exception — see P0 #2).

14. **Excellent inline documentation** — JSDoc on every service, interface, method explaining *why* (not just *what*). Comments acknowledge known limitations honestly ("For higher fidelity a raw-body parser middleware would be wired here").

15. **20 documentation files** — API reference, runbooks (12), troubleshooting (11 sections), architecture, monitoring checklist, quick-start, per-module setup guides. Operators have what they need.

---

## Summary scorecard

| Section | Score | Notes |
|---------|-------|-------|
| 1. Assistant configuration | 7/10 | Solid CRUD; missing versioning, multi-voice, knowledge-base attachment |
| 2. Function calling (tools) | 8/10 | 8 real tools; `human_transfer` doesn't transfer; `speak` not surfaced to Vapi |
| 3. Webhooks | 7/10 | Correct crypto + idempotency; re-serialized body; missing `end-of-call-report` |
| 4. Conversation flows | 3/10 | 1,900 LOC of dead code; never wired into webhook pipeline |
| 5. Memory | 9/10 | Excellent 3-tier design; `buildMemoryContext()` never called by handlers |
| 6. Analytics | 9/10 | Comprehensive; **analytics controller has no auth** (P0) |
| 7. Telephony | 4/10 | Inbound/outbound work; **no actual transfer**, no DTMF, no queues, no voicemail |
| 8. Testing | 7/10 | Real Vitest tests; no Vapi API integration tests; flow tests test dead code |
| 9. Deployment | 9/10 | Production-grade K8s; 2 conflicting Dockerfiles; no Helm |
| 10. Documentation | 8/10 | 20 docs; no OpenAPI/Swagger; some redundancy |
| **Overall** | **6.5/10** | **Strong foundation; 5 P0 gaps block production** |

**Vapi feature utilization: 11/20 fully used, 7 partial, 7 missing → ~55% effective utilization.**

The module is a well-engineered foundation that needs ~2-3 weeks of focused work (the 5 P0 gaps + raw-body middleware + `end-of-call-report` handler) to be truly production-ready, and ~4-6 weeks to use Vapi to its full potential (multi-language, DTMF, batch calling, knowledge-base attachment, memory injection).
