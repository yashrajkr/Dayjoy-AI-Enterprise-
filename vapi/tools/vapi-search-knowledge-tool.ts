import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { KnowledgeService } from '../../backend/knowledge/knowledge.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiSearchKnowledgeTool — search the Dayjoy knowledge base via the
 * real `KnowledgeService.query()` (RAG pipeline).
 *
 * The `KnowledgeService` lives in `backend/knowledge/` and is imported
 * via `forwardRef` to avoid a circular DI dependency (the AI module
 * imports Knowledge, the Vapi tools module will also import it).
 *
 * The tool returns:
 *   - `data.answer` — the RAG-synthesised answer.
 *   - `data.citations` — array of citation chunks for transparency.
 *   - `data.queryId` — the persisted `RagQuery.id` for feedback loops.
 *   - `speak` — same as `data.answer` so the assistant reads it aloud.
 *
 * When `KnowledgeService.query()` throws, the tool returns
 * `{ success: false, error }` and lets the LLM fall back to escalation.
 */
@Injectable()
export class VapiSearchKnowledgeTool implements VapiTool {
  name = 'search_knowledge';
  description =
    'Search the Dayjoy knowledge base for product info, policies, FAQs, ' +
    'compensation plan details, and SOPs. Use this BEFORE answering any ' +
    'product / business / policy question. Returns a natural-language ' +
    'answer plus supporting citations.';

  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Concise search query (2-6 words works best). Examples: ' +
          '"return policy", "starter kit price", "BV calculation".',
      },
      topK: {
        type: 'integer',
        description: 'Number of chunks to retrieve (default: 3).',
        default: 3,
      },
    },
    required: ['query'],
  };

  private readonly logger = new Logger(VapiSearchKnowledgeTool.name);

  constructor(
    @Inject(forwardRef(() => KnowledgeService))
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async execute(
    args: { query: string; topK?: number },
    context: ToolContext,
  ): Promise<ToolResult> {
    const query = (args?.query ?? '').toString().trim();
    if (!query) {
      return {
        success: false,
        error: 'Query is required',
        speak:
          "I'm sorry, I didn't catch what you're looking for. Could you repeat that?",
      };
    }
    if (!context.tenantId) {
      return {
        success: false,
        error: 'ToolContext.tenantId is required',
      };
    }

    try {
      this.logger.log(
        `search_knowledge(query="${query}", tenant=${context.tenantId}, call=${context.callId ?? '-'})`,
      );

      const result = await this.knowledgeService.query(
        {
          query,
          topK: args.topK ?? 3,
          tenantId: context.tenantId,
          agentId: undefined,
          conversationId: context.conversationId,
        },
        {
          userId: context.userId,
          tenantId: context.tenantId,
        } as any,
      );

      // If no citations + the synthesised answer says "No relevant
      // information found", escalate via the `speak` channel so the LLM
      // knows to offer a transfer.
      const hasCitations = result.citations && result.citations.length > 0;
      const escalate =
        !hasCitations ||
        /no relevant information/i.test(result.answer ?? '');

      return {
        success: true,
        data: {
          answer: result.answer,
          citations: (result.citations ?? []).map((c) => ({
            chunkId: c.chunkId,
            documentId: c.documentId,
            documentTitle: c.documentTitle,
            content: c.content,
            score: c.score,
          })),
          queryId: result.queryId,
          latencyMs: result.latencyMs,
        },
        speak: escalate
          ? "I don't have that information in my knowledge base right now. Let me transfer you to a human agent who can help."
          : result.answer,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`search_knowledge failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I'm having trouble searching our knowledge base right now. Could I transfer you to a human agent?",
      };
    }
  }
}
