/**
 * Vapi Tool Interface
 *
 * The canonical interface implemented by every Vapi tool. The shape was
 * enhanced to match the task brief:
 *
 *   - `parameters` is now a property (JSON schema), not a method.
 *   - `execute(args, context)` takes args + a `ToolContext` (instead of
 *     a single `ToolCallRequest`) so callers can build the context from
 *     the authenticated user + voice session without assembling a
 *     full DTO.
 *   - `ToolResult.speak` is the canonical way to tell Vapi what to
 *     actually say to the customer (separate from `data`, which is
 *     machine-readable context the LLM may use to compose a reply).
 *
 * The legacy `ToolCallRequest` / `ToolCallResult` / `VapiToolParameters`
 * types are kept as deprecated aliases so existing references (e.g.
 * Agent 5's tests) keep compiling.
 */

/**
 * Per-call execution context passed to every tool. Built by the webhook
 * handler from the authenticated user + the active voice session.
 */
export interface ToolContext {
  /** Required — every tool writes to a tenant-scoped table. */
  tenantId: string;
  /** Optional — the user that triggered the call (for audit). */
  userId?: string;
  /** Optional — identified customer (from customer_lookup or caller ID). */
  customerId?: string;
  /** Optional — identified distributor (from distributor_lookup). */
  distributorId?: string;
  /** Optional — AI conversation row that owns this call. */
  conversationId?: string;
  /** Optional — Vapi call ID (used for transfer / end-call). */
  callId?: string;
  /** Optional — voice session ID (for state lookup). */
  sessionId?: string;
  /** Optional — caller phone number (E.164). */
  phoneNumber?: string;
  /** Optional — call metadata bag (Vapi passes through `metadata`). */
  metadata?: Record<string, any>;
}

/**
 * Result of a tool execution. `speak` is the natural-language text the
 * assistant should say to the customer; `data` is the machine-readable
 * payload the LLM can reason over.
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  /** Structured error message for logs / debugging. */
  error?: string;
  /** Natural-language text to speak to the customer. */
  speak?: string;
}

/**
 * The canonical Vapi tool interface. Every tool must implement this.
 *
 * `parameters` is a JSON Schema (Vapi's `function.parameters` field) —
 * the LLM uses it to decide when to call the tool + how to populate
 * `args`.
 */
export interface VapiTool {
  /** Unique tool name (matches the Vapi `function.name` field). */
  name: string;
  /** Human-readable description shown to the LLM. */
  description: string;
  /** JSON Schema describing the tool's parameters. */
  parameters: Record<string, any>;
  /** Run the tool. Must never throw — return a failed `ToolResult` instead. */
  execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult>;
}

/**
 * JSON-Schema property descriptor. Used by tools that want strong typing
 * on their parameter schemas.
 */
export interface VapiToolProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'integer';
  description: string;
  enum?: string[];
  items?: VapiToolProperty;
  default?: any;
}

// =====================================================================
// Deprecated aliases — kept for backward compat with the original
// scaffold. New code should use the interfaces above.
// =====================================================================

/**
 * @deprecated Use `ToolContext` instead.
 */
export interface ToolCallRequest {
  toolName: string;
  parameters: Record<string, any>;
  callId: string;
  sessionId: string;
}

/**
 * @deprecated Use `ToolResult` instead.
 */
export interface ToolCallResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * @deprecated Use `Record<string, any>` for `VapiTool.parameters`.
 */
export interface VapiToolParameters {
  type: 'object';
  properties: Record<string, VapiToolProperty>;
  required?: string[];
}

/**
 * @deprecated — Vapi tools no longer need an `enabled` flag; the
 * `VapiToolRegistry` decides what's enabled.
 */
export interface LegacyVapiTool {
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * @deprecated Use `VapiTool.parameters` directly.
 */
export interface VapiFunctionDefinition {
  name: string;
  description: string;
  parameters: VapiToolParameters;
}

/**
 * @deprecated — kept for backward compat with the original scaffold.
 */
export function toVapiFunction(
  tool: { name: string; description: string },
  params: VapiToolParameters,
): VapiFunctionDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: params,
  };
}
