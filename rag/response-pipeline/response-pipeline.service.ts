import { Injectable, Logger } from '@nestjs/common';
import { RetrievalService } from '../retriever/retrieval-service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';
import { LLMGatewayService } from './llm-gateway-service';
import { ResponseProcessingService } from './response-processing-service';
import { BuiltContext } from '../prompts/prompt-assembly-config';

/**
 * ResponsePipelineService — orchestrates the full RAG response pipeline.
 *
 * Flow:
 *  1. **Retrieve** — `RetrievalService.retrieve()` runs hybrid vector +
 *     keyword search with RRF fusion + cheap keyword-overlap rerank.
 *  2. **Build context** — `ContextBuilderService.buildContext()` augments
 *     the retrieved chunks with conversation history + long-term memories
 *     + customer profile.
 *  3. **Build prompts** — `PromptAssemblyService.buildSystemPrompt()` +
 *     `buildMessagesForLLM()` produce the Chat Completions payload.
 *  4. **Call LLM** — `LLMGatewayService.generate()` calls the LLM
 *     (OpenAI by default, with fallback to Anthropic / Google).
 *  5. **Process response** — `ResponseProcessingService.process()`
 *     extracts citations, validates them against the retrieved chunks,
 *     detects hallucination, calculates confidence.
 *  6. **Return** — the final `PipelineResult` with the answer +
 *     citations + validation + retrieval/LLM metadata.
 *
 * Replaces the existing `rag/evaluation/complete-pipeline-service.ts`
 * (which had broken imports to non-existent folders). That file is left
 * in place for Agent H (who owns `evaluation/`) — when ready, it can be
 * removed or refactored to delegate to this service.
 */
@Injectable()
export class ResponsePipelineService {
  private readonly logger = new Logger(ResponsePipelineService.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly promptAssembly: PromptAssemblyService,
    private readonly llmGateway: LLMGatewayService,
    private readonly responseProcessing: ResponseProcessingService,
  ) {}

  /**
   * Execute the full RAG response pipeline.
   */
  async execute(query: PipelineQuery): Promise<PipelineResult> {
    const startTime = Date.now();
    this.logger.log(`Starting RAG response pipeline for: "${query.question}"`);

    try {
      // Step 1: Retrieve relevant chunks.
      const retrievedChunks = await this.retrievalService.retrieve({
        query: query.question,
        tenantId: query.tenantId,
        topK: query.topK || 5,
        filters: query.filter,
        enableReranking: true,
      });

      // Step 2: Build context (history + memories + profile).
      const context = await this.contextBuilder.buildContext({
        question: query.question,
        tenantId: query.tenantId,
        agentId: query.agentId,
        conversationId: query.conversationId,
        userId: query.userId,
        customerId: query.customerId,
        channel: query.channel,
        maxChunks: query.topK || 5,
        maxHistoryTurns: query.maxHistoryTurns || 5,
        maxMemories: query.maxMemories || 5,
      });

      // Replace the context's retrieved chunks with the freshly-retrieved
      // ones (the context builder also retrieves, but we want the
      // retrieval metadata + scores from this pipeline's retrieval call).
      // The context builder's retrieval is a fallback / consistency check.
      context.retrievedChunks = retrievedChunks;

      // Step 3: Build system prompt + messages.
      const systemPrompt = this.promptAssembly.buildSystemPrompt({
        role: query.role || 'Dayjoy AI Assistant',
        instructions:
          query.instructions ||
          'Answer the user question using the provided context. If the context does not contain the answer, say so explicitly.',
        knowledgeContext:
          'Use the provided context to answer. Cite sources using [1], [2], etc.',
        rules: query.rules || [
          'If unsure, say so.',
          'Cite sources using [N] markers.',
          'Do not fabricate information not in the context.',
        ],
        availableTools: query.availableTools || [],
      });
      const messages = this.promptAssembly.buildMessagesForLLM(
        systemPrompt,
        context,
      );

      // Step 4: Call LLM.
      const llmResponse = await this.llmGateway.generate({
        messages,
        model: query.model,
        temperature: query.temperature ?? 0.7,
        maxTokens: query.maxTokens || 1000,
        metadata: {
          query: query.question,
          tenantId: query.tenantId,
          agentId: query.agentId,
          conversationId: query.conversationId,
        },
      });

      // Step 5: Process response (citations + validation + confidence).
      const processed = await this.responseProcessing.process(
        llmResponse.content,
        retrievedChunks,
        { format: query.responseFormat },
      );

      const totalLatencyMs = Date.now() - startTime;

      this.logger.log(
        `RAG pipeline complete: ${totalLatencyMs}ms, ` +
          `${llmResponse.usage.totalTokens} tokens, ` +
          `confidence=${processed.validation.confidence.toFixed(2)}`,
      );

      return {
        status: 'success',
        query: query.question,
        answer: processed.content,
        citations: processed.citations,
        format: processed.format,
        metadata: processed.metadata,
        validation: processed.validation,
        retrieval: {
          chunksUsed: retrievedChunks.length,
          topScore: retrievedChunks[0]?.finalScore ?? 0,
          sources: Array.from(
            new Set(retrievedChunks.map((c) => c.metadata.documentTitle)),
          ),
        },
        llm: {
          model: llmResponse.model,
          provider: llmResponse.provider,
          tokens: llmResponse.usage.totalTokens,
          latencyMs: llmResponse.latencyMs,
          cost: this.estimateCost(llmResponse),
          cached: llmResponse.cached,
        },
        context,
        totalLatencyMs,
      };
    } catch (error) {
      this.logger.error(
        `RAG response pipeline failed: ${(error as Error).message}`,
      );

      return {
        status: 'failed',
        error: (error as Error).message,
        query: query.question,
        answer: null,
        citations: [],
        format: 'markdown',
        metadata: null,
        validation: null,
        retrieval: null,
        llm: null,
        context: null,
        totalLatencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Stream the LLM response token-by-token.
   *
   * Yields `PipelineStreamEvent`s: `retrieval_complete` (with the chunks
   * used), `response_chunk` (token deltas), `complete` (final metadata).
   *
   * Retrieval + context-building + prompt assembly still happen upfront
   * (they're not naturally streamable) — only the LLM call is streamed.
   */
  async *executeStreaming(
    query: PipelineQuery,
  ): AsyncGenerator<PipelineStreamEvent, void, unknown> {
    const startTime = Date.now();
    this.logger.log(`Starting streaming RAG pipeline for: "${query.question}"`);

    try {
      // Steps 1-3: synchronous setup.
      const retrievedChunks = await this.retrievalService.retrieve({
        query: query.question,
        tenantId: query.tenantId,
        topK: query.topK || 5,
        filters: query.filter,
        enableReranking: true,
      });

      const context = await this.contextBuilder.buildContext({
        question: query.question,
        tenantId: query.tenantId,
        agentId: query.agentId,
        conversationId: query.conversationId,
        userId: query.userId,
        customerId: query.customerId,
        channel: query.channel,
        maxChunks: query.topK || 5,
      });
      context.retrievedChunks = retrievedChunks;

      const systemPrompt = this.promptAssembly.buildSystemPrompt({
        role: query.role || 'Dayjoy AI Assistant',
        instructions: query.instructions || 'Answer using the provided context.',
        rules: ['Cite sources using [N] markers.', 'If unsure, say so.'],
      });
      const messages = this.promptAssembly.buildMessagesForLLM(
        systemPrompt,
        context,
      );

      // Emit retrieval-complete event so the client can render citations
      // before the first token arrives.
      yield {
        type: 'retrieval_complete',
        chunksUsed: retrievedChunks.length,
        topScore: retrievedChunks[0]?.finalScore ?? 0,
        sources: Array.from(
          new Set(retrievedChunks.map((c) => c.metadata.documentTitle)),
        ),
      };

      // Step 4: stream the LLM response.
      let fullContent = '';
      let finalUsage:
        | { promptTokens: number; completionTokens: number; totalTokens: number }
        | undefined;

      const stream = this.llmGateway.generateStream({
        messages,
        model: query.model,
        temperature: query.temperature ?? 0.7,
        maxTokens: query.maxTokens || 1000,
      });

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield {
            type: 'response_chunk',
            content: chunk.content,
          };
        }
        if (chunk.done && chunk.usage) {
          finalUsage = chunk.usage;
        }
      }

      // Step 5: process the full response for citations + validation.
      const processed = await this.responseProcessing.process(
        fullContent,
        retrievedChunks,
      );

      yield {
        type: 'complete',
        answer: fullContent,
        citations: processed.citations,
        validation: processed.validation,
        metadata: processed.metadata,
        totalLatencyMs: Date.now() - startTime,
        tokens: finalUsage?.totalTokens,
      };
    } catch (error) {
      this.logger.error(
        `Streaming RAG pipeline failed: ${(error as Error).message}`,
      );
      yield {
        type: 'error',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Estimate LLM cost (mirrors `LLMGatewayService.calculateCost` but
   * exposed here so the pipeline result includes it without requiring
   * access to the gateway's private method).
   */
  private estimateCost(llmResponse: {
    model: string;
    usage: { totalTokens: number };
  }): number {
    const pricing: Record<string, number> = {
      'gpt-4o': 0.005,
      'gpt-4-turbo': 0.01,
      'gpt-3.5-turbo': 0.0005,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025,
      'gemini-pro': 0.00025,
      'gemini-ultra': 0.002,
    };

    const pricePer1K = pricing[llmResponse.model] || 0.001;
    return (llmResponse.usage.totalTokens / 1000) * pricePer1K;
  }
}

// =====================================================================
// Types
// =====================================================================

/**
 * Input to {@link ResponsePipelineService.execute}.
 */
export interface PipelineQuery {
  question: string;
  tenantId: string;
  agentId?: string;
  conversationId?: string;
  userId?: string;
  customerId?: string;
  channel?: 'VOICE' | 'WHATSAPP' | 'WEB' | 'API';

  /** Override the default system-prompt role. */
  role?: string;
  /** Override the default instructions. */
  instructions?: string;
  /** Override the default rules. */
  rules?: string[];
  /** List of available tools (for awareness in the system prompt). */
  availableTools?: string[];

  /** Retrieval top-K (default 5). */
  topK?: number;
  /** Max history turns to include (default 5). */
  maxHistoryTurns?: number;
  /** Max long-term memories to include (default 5). */
  maxMemories?: number;
  /** Retrieval filter. */
  filter?: {
    documentId?: string;
    sourceId?: string;
    category?: string;
    tags?: string[];
  };

  /** LLM model override (e.g. 'gpt-4o'). */
  model?: string;
  /** LLM temperature (default 0.7). */
  temperature?: number;
  /** LLM max tokens (default 1000). */
  maxTokens?: number;
  /** Desired response format (default 'markdown'). */
  responseFormat?: 'markdown' | 'plain' | 'structured';
}

/**
 * Result of {@link ResponsePipelineService.execute}.
 */
export interface PipelineResult {
  status: 'success' | 'failed';
  error?: string;
  query: string;
  answer: string | null;
  citations: Array<{
    number: number;
    chunkId?: string;
    documentId?: string;
    documentTitle?: string;
    chunkIndex?: number;
    confidence: number;
    unresolved: boolean;
  }>;
  format: 'markdown' | 'plain' | 'structured';
  metadata: {
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    hasCitations: boolean;
    citationCount: number;
    citationCoverage: number;
  } | null;
  validation: {
    isToxic: boolean;
    hasPII: boolean;
    isHallucinated: boolean;
    confidence: number;
  } | null;
  retrieval: {
    chunksUsed: number;
    topScore: number;
    sources: string[];
  } | null;
  llm: {
    model: string;
    provider: string;
    tokens: number;
    latencyMs: number;
    cost: number;
    cached: boolean;
  } | null;
  context: BuiltContext | null;
  totalLatencyMs: number;
}

/**
 * Streaming event yielded by {@link ResponsePipelineService.executeStreaming}.
 */
export type PipelineStreamEvent =
  | {
      type: 'retrieval_complete';
      chunksUsed: number;
      topScore: number;
      sources: string[];
    }
  | { type: 'response_chunk'; content: string }
  | {
      type: 'complete';
      answer: string;
      citations: PipelineResult['citations'];
      validation: NonNullable<PipelineResult['validation']>;
      metadata: NonNullable<PipelineResult['metadata']>;
      totalLatencyMs: number;
      tokens?: number;
    }
  | { type: 'error'; error: string };
