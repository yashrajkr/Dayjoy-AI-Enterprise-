# Tool Design — Overview

> **Phase 6 — Tool Specifications**
>
> This folder contains the design specifications for the eight tools the Dayjoy AI assistant (Sarah) can call. Each spec describes the tool's purpose, when to use it, its parameters, its response shape, its error handling, and its integration with the backend services.
>
> The runtime implementations live in `vapi/tools/` (TypeScript). These design docs are the source of truth for **what** each tool does and **why**; the code is the source of truth for **how**.

---

## The Eight Tools

| # | Tool | Purpose | File | Spec |
|---|---|---|---|---|
| 1 | `search_knowledge` | Search the knowledge base (RAG pipeline) for product info, policies, FAQs, SOPs | `vapi-search-knowledge-tool.ts` | `01_search_knowledge.md` |
| 2 | `search_products` | Search the live product catalog (name, SKU, category, price, stock) | `vapi-search-products-tool.ts` | `02_search_products.md` |
| 3 | `customer_lookup` | Look up an existing customer by phone or email | `vapi-customer-lookup-tool.ts` | `03_customer_lookup.md` |
| 4 | `distributor_lookup` | Look up an existing distributor by code or phone | `vapi-distributor-lookup-tool.ts` | `04_distributor_lookup.md` |
| 5 | `create_lead` | Capture a new lead from a voice call | `vapi-lead-capture-tool.ts` | `05_create_lead.md` |
| 6 | `book_appointment` | Schedule an appointment with a Dayjoy team member | `vapi-appointment-booking-tool.ts` | `06_book_appointment.md` |
| 7 | `create_support_ticket` | Create a support ticket for a customer issue | `vapi-support-ticket-tool.ts` | `07_create_support_ticket.md` |
| 8 | `human_transfer` | Transfer the call to a human agent | `vapi-human-transfer-tool.ts` | `08_human_transfer.md` |

---

## Tool Calling Framework

The eight tools share a common interface (`VapiTool` in `vapi/tools/vapi-tool-interface.ts`) and are orchestrated by the tool registry (`vapi/tools/vapi-tool-registry.service.ts`). The framework is deliberately simple — every tool is a NestJS injectable that implements the same three-field interface.

### The `VapiTool` Interface

```typescript
interface VapiTool {
  name: string;                    // unique tool name (matches Vapi function.name)
  description: string;             // shown to the LLM
  parameters: Record<string, any>; // JSON Schema for the LLM
  execute(args, context): Promise<ToolResult>;
}
```

### The `ToolContext`

Every tool receives a `ToolContext` built by the webhook handler from the authenticated user + the active voice session:

```typescript
interface ToolContext {
  tenantId: string;          // required — every tool writes to a tenant-scoped table
  userId?: string;           // optional — the user that triggered the call (for audit)
  customerId?: string;       // optional — identified customer
  distributorId?: string;    // optional — identified distributor
  conversationId?: string;   // optional — AI conversation row
  callId?: string;           // optional — Vapi call ID (for transfer / end-call)
  sessionId?: string;        // optional — voice session ID
  phoneNumber?: string;      // optional — caller phone (E.164)
  metadata?: Record<string, any>; // optional — Vapi metadata passthrough
}
```

The `tenantId` is **required** on every tool call — this is the first line of defence for multi-tenant isolation. A tool that receives a context without a `tenantId` returns `{ success: false, error: 'ToolContext.tenantId is required' }` immediately.

### The `ToolResult`

Every tool returns a `ToolResult` with three fields:

```typescript
interface ToolResult {
  success: boolean;       // true if the operation succeeded
  data?: any;             // machine-readable payload (LLM may use this to compose a reply)
  error?: string;         // structured error message for logs / debugging
  speak?: string;         // natural-language text to speak to the customer
}
```

The `speak` field is the canonical way to tell Vapi what to say. The LLM may also compose its own reply using the `data` field, but the `speak` field is the safe default — it's already grounded in the tool's result.

### Tool Execution Flow

```
Caller speaks ──▶ Vapi ──▶ Webhook ──▶ FunctionCallHandler
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │  ToolRegistry.get(name)│
                                  └───────────┬───────────┘
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │  Validate args against│
                                  │  tool.parameters JSON │
                                  │  Schema               │
                                  └───────────┬───────────┘
                                              │ valid?
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │  tool.execute(args,   │
                                  │    context)           │
                                  └───────────┬───────────┘
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │  ToolResult           │
                                  │  { success, data,     │
                                  │    speak }            │
                                  └───────────┬───────────┘
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │  Return to Vapi as    │
                                  │  function-call result │
                                  └───────────────────────┘
```

Tools **must never throw**. Every tool wraps its body in a `try/catch` and returns a failed `ToolResult` with a `speak` field that apologises and offers to transfer to a human. This guarantees the LLM never sees an unhandled exception.

---

## Tool Registry

The `VapiToolRegistry` (`vapi/tools/vapi-tool-registry.service.ts`) is the central catalog:

- **`get(name)`** — return a tool instance by name (throws if not found).
- **`getAll()`** — return all 8 tools (used by the assistant-creation flow to populate the Vapi `assistant.tools` array).
- **`execute(name, args, context)`** — convenience wrapper: validate args → call `execute()` → log the call to the analytics tracker.
- **`toVapiFunctionDefinitions()`** — return the tools in Vapi's `function` definition format (used when creating or updating a Vapi assistant).

The registry is populated by NestJS DI in `vapi/tools/vapi-tools.module.ts`. Adding a new tool requires:

1. Create a new `vapi/tools/vapi-{name}-tool.ts` file implementing `VapiTool`.
2. Register it as an `@Injectable()` provider in `vapi-tools.module.ts`.
3. Add it to the registry's constructor injection list.
4. Add a spec doc in `docs/tool-design/`.

---

## Tool Calling Conventions

### Argument validation

Every tool's `parameters` field is a JSON Schema. The registry validates the LLM-supplied `args` against this schema before calling `execute()`. If validation fails, the registry returns a `ToolResult` with `success: false` and a `speak` field asking the customer to clarify — the tool's `execute()` method is never invoked.

### Idempotency

Tools that create rows (`create_lead`, `book_appointment`, `create_support_ticket`, `human_transfer`) are **not** idempotent by default — calling them twice creates two rows. The Vapi function-call webhook dedupes by `callId + toolName + argHash` within a 60-second window, so a webhook retry does not create a duplicate. Beyond that window, a duplicate is treated as a legitimate second call.

### Tenant isolation

Every tool's `execute()` method enforces tenant isolation by passing `context.tenantId` to every Prisma query. There is no global read — a tool in tenant A cannot see tenant B's data, even if the LLM is tricked into trying.

### PII handling

Tool inputs and outputs are PII-redacted before they are logged:

- Phone numbers are hashed to `phone:sha256:abcdef...`
- Email addresses are hashed to `email:sha256:abcdef...`
- The full, unredacted values are persisted in the tool's target table (e.g., `leads.phone`) but never in the logs.

### Latency budgets

Each tool has a latency budget. If a tool exceeds its budget, the registry logs a warning and the analytics tracker flags the call for review:

| Tool | Latency budget (p95) |
|---|---|
| `search_knowledge` | 1500 ms (RAG pipeline is the slowest) |
| `search_products` | 300 ms |
| `customer_lookup` | 200 ms |
| `distributor_lookup` | 200 ms |
| `create_lead` | 300 ms |
| `book_appointment` | 300 ms |
| `create_support_ticket` | 300 ms |
| `human_transfer` | 500 ms (includes notification dispatch) |

---

## Spec Doc Template

Each spec doc in this folder follows the same structure:

1. **Purpose** — one-paragraph summary of what the tool does.
2. **When to Use** — the situations in which the LLM should call this tool.
3. **When NOT to Use** — common anti-patterns to avoid.
4. **Parameters** — the JSON Schema for the tool's arguments.
5. **Response** — the `ToolResult.data` and `ToolResult.speak` shapes.
6. **Error Handling** — what happens on failure.
7. **Integration** — which backend service the tool calls and how.
8. **Latency + Cost** — the performance budget and the per-call cost (if any).
9. **Examples** — at least two worked examples (success + failure).

---

## Related Documentation

- Tool calling framework (deep dive): `docs/ai/08_TOOL_CALLING_FRAMEWORK.md`
- AI tool API design: `docs/api/08_AI_TOOL_API_DESIGN.md`
- Vapi tool analytics: `vapi/analytics/vapi-tool-usage-tracker.ts`
- Vapi tool tests: `vapi/tests/vapi-tool-tests.ts`
- Conversation flow designs: `docs/conversation-design/`
