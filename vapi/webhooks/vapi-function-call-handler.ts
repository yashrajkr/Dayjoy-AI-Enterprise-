import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import { VapiMemoryService } from '../memory/vapi-memory-service';

/**
 * Injection token for the Vapi tool registry.
 *
 * The concrete `VapiToolRegistry` class is owned by Agent 3 and lives
 * in `vapi/tools/`. To keep this module compilable in isolation (and
 * resilient to Agent 3 renaming their class), we depend on this token
 * rather than the concrete class. Agent 3 wires the binding via:
 *
 *   ```ts
 *   { provide: VAPI_TOOL_REGISTRY, useExisting: VapiToolRegistry }
 *   ```
 *
 * If the registry isn't registered (e.g. during early integration
 * testing), `execute()` returns a clear "tool not available" error
 * rather than crashing.
 */
export const VAPI_TOOL_REGISTRY = Symbol('VAPI_TOOL_REGISTRY');

/**
 * Context passed to every tool execution. The registry implementation
 * is expected to use these fields to scope its queries (e.g. only
 * return customers within the current tenant).
 */
export interface VapiToolExecutionContext {
  tenantId: string;
  customerId?: string;
  conversationId?: string;
  callId: string;
  sessionId: string;
  userMessage?: string;
}

/**
 * Result returned by a tool execution. Mirrors the `ToolCallResult`
 * shape from `vapi-tool-interface.ts` but kept here so this module
 * doesn't depend on Agent 3's interface file.
 */
export interface VapiToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  /** Natural-language text the assistant should say to the caller (the real `VapiTool`/`ToolResult` implementation's canonical field — see `vapi-tool-interface.ts`). */
  speak?: string;
  latencyMs?: number;
}

/**
 * Minimal contract the Vapi tool registry must implement for the
 * webhook function-call handler to invoke tools.
 */
export interface IVapiToolRegistry {
  execute(
    name: string,
    args: Record<string, any>,
    context: VapiToolExecutionContext,
  ): Promise<VapiToolExecutionResult>;
  has(name: string): boolean;
  list(): string[];
}

/**
 * Normalized tool-call shape from Vapi. Vapi wraps the actual tool
 * definition in a `function` object (matching OpenAI's tool-call
 * structure), so we accept either that or the flat shape.
 */
export interface VapiToolCall {
  id?: string;
  name?: string;
  function?: {
    name?: string;
    arguments?: string; // JSON string in OpenAI format
  };
  arguments?: string | Record<string, any>;
  /** Real Vapi `tool-calls` event shape: `toolCallList[i].parameters` — already a parsed object, not a JSON string. */
  parameters?: Record<string, any>;
  toolCallId?: string;
}

export interface VapiFunctionCallResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result: any;
  latencyMs: number;
}

/**
 * Vapi Function-Call Handler.
 *
 * Vapi fires a `function-call` webhook whenever the assistant's LLM
 * decides to call a tool. The webhook is *synchronous* — Vapi blocks
 * waiting for our response, then speaks the result back to the
 * caller. Latency budget is ~5s before Vapi times out and the call
 * experience degrades ("one moment, please...").
 *
 * Responsibilities:
 *   1. Resolve the session by Vapi call id (so we have tenant /
 *      customer / conversation context for the tool).
 *   2. **Build the memory context** (caller profile, long-term
 *      memories, recent messages, active flow) so the tool result we
 *      return to Vapi can carry the context the assistant's LLM needs
 *      to phrase a personalised response. The summary is attached to
 *      the tool result under `result.memoryContext` and also stored
 *      in session memory under `memoryContextSummary` for downstream
 *      consumers (flow manager, analytics).
 *   3. Parse the tool name + arguments (Vapi sends args as a JSON
 *      string, matching OpenAI's format).
 *   4. Delegate execution to the {@link IVapiToolRegistry}.
 *   5. Persist the execution as an `AnalyticsEvent`
 *      (`eventType='tool_execution'`) — this is the canonical
 *      "tool execution" record per the existing analytics convention
 *      (the schema has no dedicated `tool_executions` table; the
 *      `analytics_events` table with `eventType='tool_execution'`
 *      is the agreed storage).
 *   6. Increment the session's tool-call counter.
 *   7. Return the result in Vapi's expected response shape.
 */
@Injectable()
export class VapiFunctionCallHandler {
  private readonly logger = new Logger(VapiFunctionCallHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMemory: VapiSessionMemory,
    private readonly memoryService: VapiMemoryService,
    @Optional() @Inject(VAPI_TOOL_REGISTRY) private readonly toolRegistry: IVapiToolRegistry | null,
  ) {}

  async handle(
    toolCall: VapiToolCall,
    call: { id: string; tenantId?: string },
    _rawBody?: any,
  ): Promise<VapiFunctionCallResult> {
    const startedAt = Date.now();
    const toolCallId =
      toolCall.id ?? toolCall.toolCallId ?? `tc-${Date.now()}`;
    const toolName =
      toolCall.function?.name ?? toolCall.name ?? 'unknown';
    const argsRaw = toolCall.function?.arguments ?? toolCall.arguments ?? toolCall.parameters;

    let args: Record<string, any> = {};
    if (typeof argsRaw === 'string') {
      try {
        args = argsRaw ? JSON.parse(argsRaw) : {};
      } catch (err) {
        this.logger.warn(
          `Tool ${toolName} received malformed JSON arguments: ${(err as Error).message}`,
        );
        return this.fail(toolCallId, toolName, 'Malformed JSON arguments', startedAt);
      }
    } else if (argsRaw && typeof argsRaw === 'object') {
      args = argsRaw as Record<string, any>;
    }

    this.logger.log(
      `Tool call: ${toolName} (callId=${call.id}, args=${JSON.stringify(args).slice(0, 200)})`,
    );

    // -------------------------------------------------------------
    // 1. Resolve session context
    // -------------------------------------------------------------
    const session = await this.sessionMemory.getByCallId(call.id);
    if (!session) {
      return this.fail(
        toolCallId,
        toolName,
        `No active session for call ${call.id}`,
        startedAt,
      );
    }

    const context: VapiToolExecutionContext = {
      tenantId: session.tenantId ?? call.tenantId ?? '',
      customerId: session.customerId,
      conversationId: session.conversationId,
      callId: call.id,
      sessionId: session.sessionId,
      userMessage: session.lastUserMessage,
    };

    // -------------------------------------------------------------
    // 1b. Build the memory context (caller profile, long-term
    //     memories, recent messages, active flow). The summary is
    //     attached to the tool result so Vapi's LLM can phrase a
    //     personalised response, and also stashed in the session
    //     blob for the flow manager / next turn.
    // -------------------------------------------------------------
    let memoryContextSummary: string | undefined;
    try {
      const memoryContext = await this.memoryService.buildMemoryContext(
        context.sessionId,
      );
      memoryContextSummary = memoryContext.summary;
      if (memoryContextSummary) {
        await this.sessionMemory.set(
          context.sessionId,
          'memoryContextSummary',
          memoryContextSummary,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to build memory context for session ${context.sessionId}: ${(err as Error).message}`,
      );
    }

    // -------------------------------------------------------------
    // 2. Execute via the registry
    // -------------------------------------------------------------
    let result: VapiToolExecutionResult;
    if (!this.toolRegistry) {
      result = {
        success: false,
        error: 'TOOL_REGISTRY_UNAVAILABLE',
        message: 'Tool registry is not configured on this server.',
      };
    } else if (!this.toolRegistry.has(toolName)) {
      result = {
        success: false,
        error: 'TOOL_NOT_FOUND',
        message: `No tool registered with name "${toolName}".`,
      };
    } else {
      try {
        result = await this.toolRegistry.execute(toolName, args, context);
      } catch (err) {
        result = {
          success: false,
          error: 'TOOL_EXECUTION_ERROR',
          message: (err as Error).message,
        };
        this.logger.error(
          `Tool ${toolName} threw: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }

    const latencyMs = Date.now() - startedAt;

    // -------------------------------------------------------------
    // 3. Persist as AnalyticsEvent (the canonical tool-execution log)
    // -------------------------------------------------------------
    await this.prisma.analyticsEvent
      .create({
        data: {
          tenantId: context.tenantId,
          eventType: 'tool_execution',
          customerId: context.customerId ?? null,
          eventData: {
            toolName,
            toolCallId,
            arguments: args,
            result: result.data ?? null,
            success: result.success,
            error: result.error ?? null,
            message: result.message ?? null,
            latencyMs,
            callId: call.id,
            sessionId: context.sessionId,
            conversationId: context.conversationId ?? null,
          } as any,
          timestamp: new Date(),
        },
      })
      .catch((err) =>
        this.logger.error(
          `Failed to record tool execution analytics: ${err.message}`,
        ),
      );

    // -------------------------------------------------------------
    // 4. Bump the session's tool-call counter (atomic-ish)
    // -------------------------------------------------------------
    await this.sessionMemory.incrementToolCalls(context.sessionId).catch(() => undefined);

    // -------------------------------------------------------------
    // 5. Return Vapi-compatible response
    // -------------------------------------------------------------
    const toolResult =
      result.data ?? { error: result.error, message: result.message };

    // Attach the memory-context summary to the tool result so Vapi's
    // LLM can use it when phrasing the next assistant turn. Kept as a
    // separate field so existing callers that read `result` aren't
    // disrupted.
    const enrichedResult: any =
      toolResult && typeof toolResult === 'object'
        ? { ...toolResult }
        : { value: toolResult };
    if (memoryContextSummary) {
      enrichedResult.memoryContext = memoryContextSummary;
    }
    // `speak` is `ToolResult`'s canonical field for "what the assistant
    // should literally say" (see vapi-tool-interface.ts) — several
    // tools rely on it (e.g. search_knowledge's no-citations escalation
    // message). Without forwarding it here, that guidance never reached
    // Vapi's LLM; only the machine-readable `data` did.
    const speakText = result.speak ?? result.message;
    if (speakText) {
      enrichedResult.speak = speakText;
    }

    return {
      toolCallId,
      toolName,
      success: result.success,
      result: enrichedResult,
      latencyMs,
    };
  }

  /**
   * Build a failure result and emit a warning log. Centralizes the
   * shape so all error paths return consistently.
   */
  private fail(
    toolCallId: string,
    toolName: string,
    message: string,
    startedAt: number,
  ): VapiFunctionCallResult {
    this.logger.warn(`Tool ${toolName} failed: ${message}`);
    return {
      toolCallId,
      toolName,
      success: false,
      result: { error: message },
      latencyMs: Date.now() - startedAt,
    };
  }
}
