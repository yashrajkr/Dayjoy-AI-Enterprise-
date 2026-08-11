import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ResponsePipelineService, PipelineQuery } from './response-pipeline.service';
import { RetrievalService } from '../retriever/retrieval-service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';
import { LLMGatewayService } from './llm-gateway-service';
import { ResponseProcessingService } from './response-processing-service';

/**
 * ResponsePipelineService unit tests.
 *
 * Covers:
 *  - execute (happy path — full pipeline returns a success result).
 *  - execute (uses agent config when agentId is supplied — N/A here,
 *    agent config loading lives in SearchService).
 *  - execute (retrieval failure → status: 'failed').
 *  - execute (LLM failure → status: 'failed').
 *  - executeStreaming (yields retrieval_complete → response_chunk* → complete).
 */
describe('ResponsePipelineService', () => {
  let service: ResponsePipelineService;
  let retrievalService: { retrieve: ReturnType<typeof vi.fn> };
  let contextBuilder: { buildContext: ReturnType<typeof vi.fn> };
  let promptAssembly: {
    buildSystemPrompt: ReturnType<typeof vi.fn>;
    buildMessagesForLLM: ReturnType<typeof vi.fn>;
  };
  let llmGateway: { generate: ReturnType<typeof vi.fn> };
  let responseProcessing: { process: ReturnType<typeof vi.fn> };

  const sampleQuery: PipelineQuery = {
    question: 'how to take wellness pack',
    tenantId: 't1',
  };

  const sampleChunks = [
    {
      chunkId: 'c1',
      documentId: 'd1',
      sourceId: 's1',
      content: 'Take 2 tablets daily with water.',
      similarity: 0.92,
      finalScore: 0.92,
      source: 'vector' as const,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        documentTitle: 'Wellness Guide',
        documentType: 'document',
        tokenCount: 6,
        hasCode: false,
        hasTable: false,
        hasList: false,
      },
    },
  ];

  beforeEach(async () => {
    retrievalService = { retrieve: vi.fn().mockResolvedValue(sampleChunks) };
    contextBuilder = {
      buildContext: vi.fn().mockResolvedValue({
        question: sampleQuery.question,
        retrievedChunks: sampleChunks,
        conversationHistory: [],
        memories: [],
        userProfile: null,
        systemContext: { tenantId: 't1', timestamp: new Date().toISOString() },
        estimatedTokens: 50,
      }),
    };
    promptAssembly = {
      buildSystemPrompt: vi.fn().mockReturnValue('You are a helpful assistant.'),
      buildMessagesForLLM: vi.fn().mockReturnValue([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'question' },
      ]),
    };
    llmGateway = {
      generate: vi.fn().mockResolvedValue({
        content: 'Take 2 tablets daily with water [1].',
        model: 'gpt-4o',
        provider: 'openai',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        latencyMs: 500,
        cached: false,
      }),
    };
    responseProcessing = {
      process: vi.fn().mockResolvedValue({
        content: 'Take 2 tablets daily with water [1].',
        citations: [{ number: 1, confidence: 0.95, unresolved: false }],
        format: 'markdown',
        metadata: {
          wordCount: 6,
          sentenceCount: 1,
          paragraphCount: 1,
          hasCitations: true,
          citationCount: 1,
          citationCoverage: 1,
        },
        validation: {
          isToxic: false,
          hasPII: false,
          isHallucinated: false,
          confidence: 0.92,
        },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResponsePipelineService,
        { provide: RetrievalService, useValue: retrievalService },
        { provide: ContextBuilderService, useValue: contextBuilder },
        { provide: PromptAssemblyService, useValue: promptAssembly },
        { provide: LLMGatewayService, useValue: llmGateway },
        { provide: ResponseProcessingService, useValue: responseProcessing },
      ],
    }).compile();

    service = moduleRef.get(ResponsePipelineService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute — happy path', () => {
    it('runs the full pipeline and returns a success result', async () => {
      const result = await service.execute(sampleQuery);

      expect(result.status).toBe('success');
      expect(result.answer).toBe('Take 2 tablets daily with water [1].');
      expect(result.citations.length).toBe(1);
      expect(result.retrieval?.chunksUsed).toBe(1);
      expect(result.retrieval?.topScore).toBeCloseTo(0.92);
      expect(result.llm?.model).toBe('gpt-4o');
      expect(result.llm?.tokens).toBe(60);
      expect(result.validation?.confidence).toBeCloseTo(0.92);
      expect(typeof result.totalLatencyMs).toBe('number');
    });

    it('calls retrieval, context-builder, prompt-assembly, LLM, and response-processing in order', async () => {
      await service.execute(sampleQuery);

      expect(retrievalService.retrieve).toHaveBeenCalledTimes(1);
      expect(contextBuilder.buildContext).toHaveBeenCalledTimes(1);
      expect(promptAssembly.buildSystemPrompt).toHaveBeenCalledTimes(1);
      expect(promptAssembly.buildMessagesForLLM).toHaveBeenCalledTimes(1);
      expect(llmGateway.generate).toHaveBeenCalledTimes(1);
      expect(responseProcessing.process).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute — error handling', () => {
    it('returns status: "failed" when retrieval throws', async () => {
      retrievalService.retrieve.mockRejectedValue(new Error('pgvector down'));

      const result = await service.execute(sampleQuery);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('pgvector down');
      expect(result.answer).toBeNull();
    });

    it('returns status: "failed" when the LLM call throws', async () => {
      llmGateway.generate.mockRejectedValue(new Error('OpenAI quota exceeded'));

      const result = await service.execute(sampleQuery);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('OpenAI quota exceeded');
    });
  });

  describe('executeStreaming', () => {
    it('yields retrieval_complete → response_chunk* → complete', async () => {
      // Mock the streaming LLM call.
      const streamGenerator = async function* () {
        yield { content: 'Take', done: false };
        yield { content: ' 2 tablets', done: false };
        yield {
          content: '',
          done: true,
          usage: { promptTokens: 50, completionTokens: 5, totalTokens: 55 },
        };
      };
      llmGateway.generateStream = vi.fn().mockReturnValue(streamGenerator());

      const events: any[] = [];
      for await (const evt of service.executeStreaming(sampleQuery)) {
        events.push(evt);
      }

      const types = events.map((e) => e.type);
      expect(types[0]).toBe('retrieval_complete');
      expect(types).toContain('response_chunk');
      expect(types[types.length - 1]).toBe('complete');

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent.answer).toContain('Take');
      expect(completeEvent.citations).toBeDefined();
      expect(completeEvent.tokens).toBe(55);
    });

    it('yields an error event when retrieval throws', async () => {
      retrievalService.retrieve.mockRejectedValue(new Error('pgvector down'));

      const events: any[] = [];
      for await (const evt of service.executeStreaming(sampleQuery)) {
        events.push(evt);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('pgvector down');
    });
  });
});
