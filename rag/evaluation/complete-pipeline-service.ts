import { Injectable, Logger } from '@nestjs/common';
import { RetrievalPipelineService } from '../retriever/retrieval-pipeline';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';
import { LLMGatewayService } from '../response-pipeline/llm-gateway-service';
import { ResponseProcessingService } from '../response-pipeline/response-processing-service';
import { ExtractedCitation } from '../response-pipeline/response-processing-config';

@Injectable()
export class RAGPipelineService {
  private readonly logger = new Logger(RAGPipelineService.name);

  constructor(
    private readonly retrievalPipeline: RetrievalPipelineService,
    private readonly promptAssembly: PromptAssemblyService,
    private readonly llmGateway: LLMGatewayService,
    private readonly responseProcessing: ResponseProcessingService,
  ) {}

  /**
   * Complete RAG pipeline
   * 
   * Flow:
   * 1. Retrieve relevant chunks
   * 2. Assemble prompt with context
   * 3. Generate LLM response
   * 4. Process response (citations, validation)
   * 5. Return final response
   */
  async query(
    query: string,
    tenantId: string,
    options?: {
      agentId?: string;
      conversationHistory?: string[];
      templateName?: string;
      stream?: boolean;
    },
  ): Promise<RAGPipelineResult> {
    const startTime = Date.now();
    this.logger.log(`Starting RAG pipeline for: "${query}"`);

    try {
      // Step 1: Retrieve chunks
      const retrievalResult = await this.retrievalPipeline.retrieveForAI(
        query,
        tenantId,
        options?.agentId,
      );

      if (retrievalResult.status === 'failed') {
        return {
          status: 'failed',
          error: 'Retrieval failed',
          query,
          response: null,
          retrieval: null,
          llm: null,
          processingResult: null,
          totalLatencyMs: Date.now() - startTime,
        };
      }

      // Step 2: Assemble prompt
      const assembledPrompt = this.promptAssembly.assemble(
        query,
        retrievalResult.context,
        options?.conversationHistory,
        options?.templateName || 'general',
      );

      // Step 3: Generate LLM response
      const llmResponse = await this.llmGateway.generate({
        prompt: assembledPrompt.userPrompt,
        systemPrompt: assembledPrompt.systemPrompt,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000,
        metadata: {
          query,
          tenantId,
          agentId: options?.agentId,
        },
      });

      // Step 4: Process response (citation validation needs the actual
      // retrieved chunks, not just the LLM-context metadata projection).
      const processedResponse = await this.responseProcessing.process(
        llmResponse.content,
        retrievalResult.chunks,
      );

      const result: RAGPipelineResult = {
        status: 'success',
        query,
        response: {
          content: processedResponse.content,
          citations: processedResponse.citations,
          metadata: processedResponse.metadata,
          validation: processedResponse.validation,
        },
        retrieval: {
          chunksUsed: retrievalResult.chunks.length,
          totalTokens: retrievalResult.context?.totalTokens || 0,
        },
        llm: {
          model: llmResponse.model,
          provider: llmResponse.provider,
          tokens: llmResponse.usage.totalTokens,
          latencyMs: llmResponse.latencyMs,
          cost: this.estimateCost(llmResponse),
        },
        processingResult: processedResponse,
        totalLatencyMs: Date.now() - startTime,
      };

      this.logger.log(
        `RAG pipeline complete: ${result.totalLatencyMs}ms, ${result.llm.tokens} tokens`,
      );

      return result;
    } catch (error) {
      this.logger.error(`RAG pipeline failed: ${error.message}`);

      return {
        status: 'failed',
        error: error.message,
        query,
        response: null,
        retrieval: null,
        llm: null,
        processingResult: null,
        totalLatencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Stream RAG response
   */
  async *streamQuery(
    query: string,
    tenantId: string,
    options?: {
      agentId?: string;
      conversationHistory?: string[];
      templateName?: string;
    },
  ): AsyncGenerator<RAGStreamingChunk, void, unknown> {
    const startTime = Date.now();

    try {
      // Step 1: Retrieve chunks (non-streaming)
      const retrievalResult = await this.retrievalPipeline.retrieveForAI(
        query,
        tenantId,
        options?.agentId,
      );

      yield {
        type: 'retrieval_complete',
        chunksUsed: retrievalResult.chunks.length,
        totalTokens: retrievalResult.context?.totalTokens || 0,
      };

      // Step 2: Assemble prompt (non-streaming)
      const assembledPrompt = this.promptAssembly.assemble(
        query,
        retrievalResult.context,
        options?.conversationHistory,
        options?.templateName || 'general',
      );

      // Step 3: Generate LLM response (streaming)
      const llmResponse = await this.llmGateway.generate({
        prompt: assembledPrompt.userPrompt,
        systemPrompt: assembledPrompt.systemPrompt,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000,
        stream: false,  // Enable streaming in production
      });

      // Step 4: Stream response chunks
      const chunks = this.responseProcessing.streamResponse(llmResponse.content);

      for await (const chunk of chunks) {
        yield {
          type: 'response_chunk',
          content: chunk.content,
          isLast: chunk.isLast,
          index: chunk.index,
        };
      }

      yield {
        type: 'complete',
        totalLatencyMs: Date.now() - startTime,
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Estimate LLM cost
   */
  private estimateCost(llmResponse: any): number {
    const pricing: Record<string, number> = {
      'gpt-4o': 0.005,
      'gpt-4-turbo': 0.01,
      'gpt-3.5-turbo': 0.0005,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025,
    };

    const pricePer1K = pricing[llmResponse.model] || 0.001;
    return (llmResponse.usage.totalTokens / 1000) * pricePer1K;
  }
}

/**
 * RAG pipeline result
 */
export interface RAGPipelineResult {
  status: 'success' | 'failed';
  error?: string;
  query: string;
  response: {
    content: string;
    citations: ExtractedCitation[];
    metadata: {
      wordCount: number;
      sentenceCount: number;
      paragraphCount: number;
      hasCitations: boolean;
      citationCount: number;
    };
    validation: {
      isToxic: boolean;
      hasPII: boolean;
      isHallucinated: boolean;
      confidence: number;
    };
  } | null;
  retrieval: {
    chunksUsed: number;
    totalTokens: number;
  } | null;
  llm: {
    model: string;
    provider: string;
    tokens: number;
    latencyMs: number;
    cost: number;
  } | null;
  processingResult: any | null;
  totalLatencyMs: number;
}

/**
 * RAG streaming chunk
 */
export interface RAGStreamingChunk {
  type: 'retrieval_complete' | 'response_chunk' | 'complete' | 'error';
  chunksUsed?: number;
  totalTokens?: number;
  content?: string;
  isLast?: boolean;
  index?: number;
  error?: string;
  totalLatencyMs?: number;
}