import { Injectable, Logger } from '@nestjs/common';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';
import { VapiSearchKnowledgeTool } from './vapi-search-knowledge-tool';
import { VapiSearchProductsTool } from './vapi-search-products-tool';
import { VapiCustomerLookupTool } from './vapi-customer-lookup-tool';
import { VapiDistributorLookupTool } from './vapi-distributor-lookup-tool';
import { VapiLeadCaptureTool } from './vapi-lead-capture-tool';
import { VapiAppointmentBookingTool } from './vapi-appointment-booking-tool';
import { VapiSupportTicketTool } from './vapi-support-ticket-tool';
import { VapiHumanTransferTool } from './vapi-human-transfer-tool';

/**
 * VapiToolRegistry — holds all 8 Vapi tools and provides:
 *
 *   - `listTools()` — array of registered tools (for introspection).
 *   - `getTool(name)` — fetch a single tool by name.
 *   - `execute(name, args, context)` — run a tool by name. Catches
 *     thrown errors so callers always get a `ToolResult` back.
 *   - `getToolDefinitions()` — Vapi-shaped function definitions array
 *     (`{ type: 'function', function: { name, description, parameters } }`)
 *     that gets injected into the assistant's `model.tools` field.
 *
 * The registry is constructed via NestJS DI — every tool is injected
 * as a constructor param so the tools' own dependencies (KnowledgeService,
 * ProductsService, PrismaService, etc.) are wired up transitively.
 */
@Injectable()
export class VapiToolRegistry {
  private readonly logger = new Logger(VapiToolRegistry.name);
  private readonly tools: Map<string, VapiTool> = new Map();

  constructor(
    private readonly searchKnowledgeTool: VapiSearchKnowledgeTool,
    private readonly searchProductsTool: VapiSearchProductsTool,
    private readonly customerLookupTool: VapiCustomerLookupTool,
    private readonly distributorLookupTool: VapiDistributorLookupTool,
    private readonly leadCaptureTool: VapiLeadCaptureTool,
    private readonly appointmentBookingTool: VapiAppointmentBookingTool,
    private readonly supportTicketTool: VapiSupportTicketTool,
    private readonly humanTransferTool: VapiHumanTransferTool,
  ) {
    this.register(this.searchKnowledgeTool);
    this.register(this.searchProductsTool);
    this.register(this.customerLookupTool);
    this.register(this.distributorLookupTool);
    this.register(this.leadCaptureTool);
    this.register(this.appointmentBookingTool);
    this.register(this.supportTicketTool);
    this.register(this.humanTransferTool);
    this.logger.log(`VapiToolRegistry initialised with ${this.tools.size} tools.`);
  }

  /** Register a tool. Last registration wins on name collision. */
  register(tool: VapiTool): void {
    if (!tool?.name) {
      this.logger.warn('Attempted to register a tool without a name — skipped.');
      return;
    }
    this.tools.set(tool.name, tool);
  }

  /** Fetch a tool by name. Returns `undefined` when not found. */
  getTool(name: string): VapiTool | undefined {
    return this.tools.get(name);
  }

  /** Array of all registered tools (insertion order). */
  listTools(): VapiTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Run a tool by name. Always returns a `ToolResult` — if the tool
   * throws, the error is captured into `{ success: false, error }`.
   */
  async execute(
    name: string,
    args: Record<string, any>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
        speak: `I'm sorry, I don't have a tool to handle that request.`,
      };
    }
    try {
      return await tool.execute(args ?? {}, context);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Tool "${name}" threw: ${message}`);
      return {
        success: false,
        error: message,
        speak: `I ran into an unexpected problem running ${name}. Could I transfer you to a human agent?`,
      };
    }
  }

  /**
   * Build the Vapi `tools` array for an assistant. Each tool is
   * serialised as `{ type: 'function', function: { name, description, parameters } }`
   * — the shape Vapi's API expects on `POST /assistant` and
   * `PATCH /assistant/:id`.
   */
  getToolDefinitions(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, any> };
  }> {
    return this.listTools().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Return a serialisable summary of every tool (name + description +
   * required params). Useful for the assistant management UI.
   */
  getToolSummaries(): Array<{
    name: string;
    description: string;
    requiredParams: string[];
  }> {
    return this.listTools().map((t) => ({
      name: t.name,
      description: t.description,
      requiredParams: Array.isArray(t.parameters?.required) ? t.parameters.required : [],
    }));
  }
}
