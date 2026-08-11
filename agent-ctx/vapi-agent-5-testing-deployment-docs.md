# Task: vapi-agent-5-testing-deployment-docs

**Agent:** full-stack-developer
**Scope:** Vapi Testing + Deployment + Documentation + Top-level Controller
**Status:** in-progress

## Files I will touch (ONLY these)

### Tests (ENHANCE/REWRITE)
- `vapi/tests/vapi-test-setup.ts` — ENHANCE with createTestModule, mock OpenAI, mock Vapi client
- `vapi/tests/vapi-tool-tests.ts` — REWRITE with real tests using vi.fn() mocks
- `vapi/tests/vapi-flow-tests.ts` — REWRITE with real tests for 7 flows
- `vapi/tests/vapi-memory-tests.ts` — REWRITE with real tests using VapiMemoryService
- `vapi/tests/vapi-webhook-tests.ts` — REWRITE with real tests for signature verification + handlers
- `vapi/tests/vapi-e2e-tests.ts` — REWRITE with full call lifecycle simulation
- `vapi/tests/vapi-load-tests.ts` — REWRITE with concurrency + race condition tests
- `vapi/tests/vapi-rag-integration-tests.ts` — NEW
- `vapi/tests/vapi-voice-test-cases.ts` — NEW

### Controller (NEW)
- `vapi/vapi.controller.ts` — top-level voice API controller

### Deployment (ENHANCE)
- `vapi/deployment/vapi-production-checklist.md`
- `vapi/deployment/vapi-environment-config.env`
- `vapi/deployment/vapi-docker-config.yml`
- `vapi/deployment/Dockerfile` — NEW
- `vapi/deployment/vapi-kubernetes-manifests.yml`

### Docs (ENHANCE/NEW)
- `vapi/docs/vapi-README.md` — NEW
- `vapi/docs/vapi-api-documentation.md` — ENHANCE
- `vapi/docs/vapi-user-guide.md` — ENHANCE
- `vapi/docs/vapi-runbooks.md` — ENHANCE
- `vapi/docs/vapi-troubleshooting-guide.md` — ENHANCE
- `vapi/docs/vapi-architecture.md` — NEW
- `vapi/docs/vapi-monitoring-checklist.md` — NEW

## Out of scope (DO NOT TOUCH)
- `vapi/config/` (Agent 3 owns)
- `vapi/assistants/`, `vapi/prompts/` (Agent 3 owns)
- `vapi/tools/` (Agent 3 owns)
- `vapi/webhooks/` (Agent 4 owns)
- `vapi/flows/` (Agent 4 owns)
- `vapi/memory/` (Agent 4 owns)
- `vapi/analytics/` (Agent 4 owns)
- `vapi/vapi.module.ts` (Agent 3/4 owns)

## Existing helpers I'll consume
- `backend/_shared/testing/mock-prisma.service.ts` → `createMockPrismaService()`
- `backend/_shared/testing/mock-redis.ts` → `createMockRedis()`
- `backend/_shared/auth/current-user.decorator.ts` → `CurrentUser`, `AuthenticatedUser`
- `backend/_shared/security/permissions.guard.ts` → `RequirePermissions`
- `backend/_shared/database/prisma.service.ts` → `PrismaService`

## Existing vapi code I'm integrating against
- `vapi/tools/vapi-search-knowledge-tool.ts` → `SearchKnowledgeTool` (constructor takes no args currently — I'll mock by injecting RAG service as needed; tests use `new` and spy)
- `vapi/tools/vapi-search-products-tool.ts` → `SearchProductsTool`
- `vapi/tools/vapi-customer-lookup-tool.ts` → `CustomerLookupTool`
- `vapi/tools/vapi-distributor-lookup-tool.ts` → `DistributorLookupTool`
- `vapi/tools/vapi-lead-capture-tool.ts` → `LeadCaptureTool`
- `vapi/tools/vapi-appointment-booking-tool.ts` → `AppointmentBookingTool`
- `vapi/tools/vapi-support-ticket-tool.ts` → `SupportTicketTool`
- `vapi/tools/vapi-human-transfer-tool.ts` → `HumanTransferTool`
- `vapi/flows/vapi-conversation-flow-manager.ts` → `ConversationFlowManager`
- `vapi/memory/vapi-memory-service.ts` → `VapiMemoryService`
- `vapi/webhooks/vapi-webhook-service.ts` → `VapiWebhookService`, `verifySignature()`
- `vapi/config/vapi-client-service.ts` → `VapiClientService`, `createCall()`, `endCall()`, `getCall()`

Note: All tool classes have a `mockX` private method currently — they execute the real code path. Tests will call `tool.execute({toolName, parameters, callId, sessionId})` directly and assert on the returned `ToolCallResult`.

## Worklog entry to be appended at end

Will include:
- Files created/modified
- Test count summary
- Stage summary
