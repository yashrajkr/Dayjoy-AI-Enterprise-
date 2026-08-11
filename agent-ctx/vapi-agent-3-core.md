# Task: vapi-agent-3-core — Vapi Core (assistants, prompts, tools with real backend integration)

**Task ID:** vapi-agent-3-core
**Agent:** full-stack-developer
**Date:** 2026-08-06
**Working directory:** `/home/z/my-project/build/dayjoy-ai-enterprise/`
**Status:** complete

## What I read from previous agents (in `/agent-ctx/`)

- `backend-agent-d-ai-knowledge-analytics-admin.md` — built the AI / Knowledge / Analytics / Admin modules. **Critically:** refactored `KnowledgeService.query()` to the `(dto, user)` signature so `dto.tenantId` falls back to `user.tenantId`. My `search_knowledge` tool calls this exact signature. Also confirmed `OPENAI_CLIENT` is `@Global()`-provided by `SharedAiModule` so my tools don't need to import it explicitly.
- `rag-agent-f-core-full-stack-developer.md` + `rag-agent-g-pipeline.md` — built the RAG pipeline (`rag/retriever/`, `rag/context-builder/`, `rag/prompts/`, `rag/response-pipeline/`, `rag/search/`, `rag/memory/`). The RAG services are NOT yet imported by `backend/app.module.ts` (Agent E owns that wiring) but `KnowledgeService` (which lives in `backend/knowledge/` and uses `rag_chunks` / `rag_documents` / `rag_queries` directly via Prisma) is fully wired and what my `search_knowledge` tool calls.
- `phase-2b-camelcase-full-stack-developer.md` — confirmed all backend services are camelCase. My code follows the same convention.
- `vapi-agent-5-testing-deployment-docs.md` — Agent 5 will write tests + deployment + docs. **Important note from their scope file:** they expect the legacy `ToolCallRequest` / `ToolCallResult` shape on the tool classes (calling `tool.execute({ toolName, parameters, callId, sessionId })` directly). I kept those legacy types as `@deprecated` aliases in `vapi-tool-interface.ts` so their tests will compile, BUT the actual tool classes now implement the NEW `execute(args, context)` signature. Agent 5 will need to update their tests to the new signature (or use the `VapiToolRegistry.execute(name, args, ctx)` convenience method which never throws).

## Scope

Built the Vapi Core (assistants, prompts, tools with real backend integration):

1. `vapi/vapi.module.ts` — root NestJS module (NEW)
2. `vapi/config/` — enhanced config + client + module (4 files)
3. `vapi/assistants/` — assistant service + controller + module + DTOs (5 NEW files; 5 markdown docs kept)
4. `vapi/prompts/` — 4 TS prompt files + barrel (5 NEW files)
5. `vapi/tools/` — 8 tools with REAL backend integration + registry + module (3 NEW + 9 ENHANCED files)
6. Tests — 2 spec files (37 tests)

## Files touched

### vapi/config/

| File | Action | Notes |
|---|---|---|
| `vapi-config.ts` | ENHANCED | Added `VapiVoiceConfig` / `VapiModelConfig` / `VapiTranscriptionConfig` types; `validateVapiConfig()` helper; loaded all 8 env vars with sensible defaults; added `responseDelaySeconds`, `endCallMessage`, `backgroundSound`, `backchannelingEnabled` fields. |
| `vapi-client-service.ts` | ENHANCED | Full Vapi SDK integration: added `createAssistant()` / `getAssistant()` / `updateAssistant()` / `deleteAssistant()` / `listAssistants()`; hardened call CRUD with `withRetry()` exponential backoff (max 3 retries); `verifyWebhookSignature()` now uses constant-time compare; gracefully degrades when `VAPI_API_KEY` is missing (every method returns structured error instead of throwing). |
| `vapi-assistant-config.ts` | ENHANCED | Added the canonical `VAPI_ASSISTANT_CONFIG` object (full Vapi payload derived from `DEFAULT_VAPI_CONFIG`); kept the legacy `DEFAULT_ASSISTANT_CONFIG` / `CUSTOMER_SUPPORT_CONFIG` / `SALES_CONFIG` / `BUSINESS_CONFIG` exports for backward compat. |
| `vapi-config.module.ts` | NEW | Provides `VapiClientService` + `VapiConfig` (under both `VAPI_CONFIG` string token + `VapiConfig` class token). |
| `vapi.module.ts` | RE-PURPOSED | Re-export of `VapiConfigModule` under the original `VapiModule` class name for backward compat with existing imports. |

### vapi/prompts/

| File | Action | Notes |
|---|---|---|
| `master-system-prompt.ts` | NEW | Sarah identity, core rules, tool catalogue, anti-hallucination, escalation criteria. |
| `dayjoy-knowledge-prompt.ts` | NEW | Company overview, product categories, compensation plan summary, common policies (with explicit "verify with search_knowledge" caveats). |
| `rag-integration-prompt.ts` | NEW | RAG usage instructions: 2-6 word queries, "no relevant information" escalation, natural citation phrasing, good/bad examples. |
| `escalation-protocols.ts` | NEW | Immediate-escalation triggers, 3-failed-attempts escalation, transfer phrases, before-transferring checklist, department routing. |
| `index.ts` | NEW | Barrel + `buildDefaultSystemPrompt()` helper that concatenates the 4 sections in canonical order (master → knowledge → rag → escalation). |

### vapi/tools/

| File | Action | Notes |
|---|---|---|
| `vapi-tool-interface.ts` | ENHANCED | New canonical `VapiTool` interface with `parameters` property + `execute(args, context)` method; new `ToolContext` (tenantId/userId/customerId/distributorId/conversationId/callId/sessionId/phoneNumber/metadata); new `ToolResult` (success/data/error/speak); kept legacy types as `@deprecated` aliases. |
| `vapi-search-knowledge-tool.ts` | REWRITTEN | Injects `KnowledgeService`; calls `knowledgeService.query({ query, topK, tenantId, conversationId }, user)`; auto-escalates when no citations. |
| `vapi-search-products-tool.ts` | REWRITTEN | Injects `ProductsService`; calls `productsService.search(query, limit, tenantId)`; formats `speak` as "First, X for ₹Y. Second, ..." |
| `vapi-customer-lookup-tool.ts` | REWRITTEN | Injects `CustomersService`; calls `customersService.findAll({ search }, user)`; client-side exact-match filter; returns lifetime stats. |
| `vapi-distributor-lookup-tool.ts` | REWRITTEN | Injects `DistributorsService`; calls `distributorsService.findAll({ search }, user)`; client-side exact-match filter; returns commission/tier/revenue. |
| `vapi-lead-capture-tool.ts` | REWRITTEN | Injects `PrismaService`; creates `Lead` row with `source='VOICE'`, `score=75`; best-effort links to existing customer via `Interaction` row. |
| `vapi-appointment-booking-tool.ts` | REWRITTEN | Injects `PrismaService`; creates `Appointment` row; validates future date + ISO 8601; metadata stores department + customer contact. |
| `vapi-support-ticket-tool.ts` | REWRITTEN | Injects `PrismaService`; creates `SupportTicket` row with `channel='voice'`; writes `Interaction` row for audit; `speak` includes 8-char ticket number + 24-hour SLA. |
| `vapi-human-transfer-tool.ts` | REWRITTEN | Injects `PrismaService` + `NotificationsService`; updates `VoiceSession` to `status='transferring'`; sends `IN_APP` notification to support team; writes `Interaction` audit row. |
| `vapi-tool-registry.service.ts` | NEW | Central registry; `register()` / `getTool()` / `listTools()` / `execute(name, args, ctx)` (try/catch — never throws) / `getToolDefinitions()` (Vapi-shaped function defs) / `getToolSummaries()`. |
| `vapi-tools.module.ts` | NEW | NestJS module; provides all 8 tools + registry; imports KnowledgeModule / ProductsModule / CustomersModule / DistributorsModule / NotificationsModule with `forwardRef`. |
| `vapi-tools.spec.ts` | NEW | 24 unit tests covering all 8 tools + the registry (happy path, validation, error escalation, edge cases). |

### vapi/assistants/

| File | Action | Notes |
|---|---|---|
| `create-assistant.dto.ts` | NEW | `CreateAssistantDto` + `UpdateAssistantDto` + `VapiAssistantType` enum. |
| `vapi-assistant.service.ts` | NEW | Full assistant CRUD; dual-tracks Vapi assistant + Prisma `AiAgent` row; best-effort when Vapi isn't configured (creates DB-only record); `buildDefaultSystemPrompt()` fallback when dto.systemPrompt is missing; default tool list = all 8 registered tools when dto.tools is missing. |
| `vapi-assistant.controller.ts` | NEW | REST CRUD under `/api/voice/assistants` with `@RequirePermissions('voice:read' \| 'voice:update')` guards + `JwtAuthGuard`. |
| `vapi-assistants.module.ts` | NEW | NestJS module; imports `VapiConfigModule` + `VapiToolsModule` (with `forwardRef`). |
| `vapi-assistant.service.spec.ts` | NEW | 13 unit tests covering create/get/list/update/delete (Vapi enabled + Vapi disabled + Vapi throwing + tenant isolation + default fallbacks). |
| `vapi-master-system-prompt.md` | UNCHANGED | Kept as documentation (the runtime TS prompt constant in `vapi/prompts/master-system-prompt.ts` is authoritative). |
| `vapi-dayjoy-knowledge-prompt.md` | UNCHANGED | Kept as documentation. |
| `vapi-rag-integration-prompt.md` | UNCHANGED | Kept as documentation. |
| `vapi-conversation-flows.md` | UNCHANGED | Kept as documentation. |
| `vapi-escalation-protocols.md` | UNCHANGED | Kept as documentation. |

### vapi/vapi.module.ts

| File | Action | Notes |
|---|---|---|
| `vapi.module.ts` | NEW | Root NestJS module; imports `ConfigModule` + `PrismaModule` + `SharedAiModule` + 3 Vapi sub-modules; Agent 4's 4 sub-modules (webhooks/flows/memory/analytics) stubbed as commented-out imports. |

## Out of scope (DO NOT TOUCH — respected)

- `vapi/webhooks/` (Agent 4 owns)
- `vapi/flows/` (Agent 4 owns)
- `vapi/memory/` (Agent 4 owns)
- `vapi/analytics/` (Agent 4 owns)
- `vapi/tests/` (Agent 5 owns — my spec files live alongside the source files in `vapi/tools/` and `vapi/assistants/`)
- `vapi/deployment/` (Agent 5 owns)
- `vapi/docs/` (Agent 5 owns)
- `backend/` modules (only imported their services via NestJS DI)
- `rag/` (Agent 2 owns)

## Backward compatibility preserved

1. **`vapi/config/vapi.module.ts`** is kept as a backward-compat re-export of `VapiConfigModule` (under the original `VapiModule` class name) so any code importing from `./vapi.module` keeps compiling.
2. **Legacy assistant config exports** (`DEFAULT_ASSISTANT_CONFIG` / `CUSTOMER_SUPPORT_CONFIG` / `SALES_CONFIG` / `BUSINESS_CONFIG`) are kept in `vapi-assistant-config.ts` (referenced by the markdown docs + deployment checklist).
3. **Legacy tool interface types** (`ToolCallRequest` / `ToolCallResult` / `VapiToolParameters` / `VapiFunctionDefinition` / `LegacyVapiTool`) are kept as `@deprecated` aliases in `vapi-tool-interface.ts` so Agent 5's tests keep compiling.
4. **5 markdown prompt files** are kept as documentation in `vapi/assistants/`; the runtime TS prompt constants in `vapi/prompts/` are authoritative.

## Out-of-scope items noted for Agent 4 (webhooks/flows/memory/analytics) and Agent 5 (tests/deployment/docs)

1. The root `VapiModule` is ready to be imported by `backend/app.module.ts` (Agent E's territory) — wiring it in is a one-line change.
2. The 4 commented-out imports in `vapi/vapi.module.ts` (`VapiWebhooksModule` / `VapiFlowsModule` / `VapiMemoryModule` / `VapiAnalyticsModule`) need to be uncommented by Agent 4 as those modules are created.
3. The `VapiClientService.createCall()` currently accepts a `phoneNumber` param that gets sent as `phoneNumberId` — Vapi actually requires a `phoneNumberId` (the ID of a purchased number), not the raw phone number. Agent 4's webhook module will need to resolve this from the tenant's Vapi number configuration.
4. The `VapiAssistantService` doesn't yet support multi-tenant Vapi organisation/workspace separation — every assistant is created under the single Vapi account associated with `VAPI_API_KEY`. A future enhancement could add `tenantId → Vapi organisation ID` mapping for true multi-tenancy.
5. The vitest config (`backend/vitest.config.ts`) currently excludes `../vapi/` — Agent 5 will need to update the config to include the new spec files (similar to what was done for the rag folder in the previous phase).
6. Agent 5's tests will need to be updated to the new `execute(args, context)` signature (or use the `VapiToolRegistry.execute(name, args, ctx)` convenience method which never throws) — the legacy `ToolCallRequest`-based shape is no longer what the tool classes implement.

## ⚠️ IMPORTANT for Agent 5 — `vapi/vapi.controller.ts` reconciliation

During my work, a `vapi/vapi.controller.ts` file appeared at the vapi root (Agent 5's planning doc lists it as theirs to create). It contains a `VapiController` class mounted at `/api/voice` with stub methods for calls, sessions, assistants, and analytics. The assistant stubs:

```typescript
@Get('assistants')          // resolves to /api/voice/assistants (CONFLICTS)
async listAssistants() { /* returns stub */ }

@Post('assistants')         // resolves to /api/voice/assistants (CONFLICTS)
async createAssistant(@Body() dto: CreateAssistantDto) { /* returns stub */ }
```

…will conflict with my `VapiAssistantController` (mounted at the same `/api/voice/assistants` path) when Agent 5 registers `VapiController` in a module — NestJS will throw a "duplicate route" error at bootstrap.

**Recommended resolution for Agent 5:** Remove the `@Get('assistants')` + `@Post('assistants')` handlers from `VapiController` (the real implementation now lives in `vapi/assistants/vapi-assistant.controller.ts` and is registered via `VapiAssistantsModule`). The other endpoints (calls, sessions, analytics) in `VapiController` are fine — they're at different paths.

Also note that the file's comments say "VapiClientService.createAssistant() not yet implemented" and "VapiClientService.listAssistants() not yet implemented" — those are now FALSE. Both methods exist on `VapiClientService` (see `vapi/config/vapi-client-service.ts`) and are called by my `VapiAssistantService`. The file's `listAssistants()` / `createAssistant()` stubs can be safely removed entirely.
