import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { SearchService } from './search.service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { RetrievalService } from '../retriever/retrieval-service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';
import { LLMGatewayService } from '../response-pipeline/llm-gateway-service';
import { ResponseProcessingService } from '../response-pipeline/response-processing-service';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { SearchQueryDto } from './search.dto';

/**
 * Builds a sample BuiltContext returned by the (mocked) ContextBuilder.
 */
function buildSampleContext() {
  return {
    question: 'how to take wellness pack',
    retrievedChunks: [
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
    ],
    conversationHistory: [],
    memories: [],
    userProfile: null,
    systemContext: {
      tenantId: 't1',
      agentId: undefined,
      channel: 'API',
      timestamp: new Date().toISOString(),
    },
    estimatedTokens: 50,
  };
}

/**
 * SearchService unit tests.
 *
 * Covers:
 *  - search (minimal query — returns answer + citations).
 *  - search (uses agent config when agentId is supplied).
 *  - search (persists the ragQuery row).
 *  - search (best-effort — persistence failure doesn't fail the search).
 *  - getHistory (paginated).
 *  - recordFeedback (404 on unknown query, updates feedback column on success).
 */
describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;
  let retrievalService: { retrieve: ReturnType<typeof vi.fn> };
  let contextBuilder: { buildContext: ReturnType<typeof vi.fn> };
  let promptAssembly: { buildSystemPrompt: ReturnType<typeof vi.fn>; buildMessagesForLLM: ReturnType<typeof vi.fn> };
  let llmGateway: { generate: ReturnType<typeof vi.fn> };
  let responseProcessing: { process: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.ragQuery.create = vi.fn().mockResolvedValue({ id: 'q-1' });
    prisma.ragQuery.findUnique = vi.fn();
    prisma.ragQuery.update = vi.fn().mockResolvedValue({});
    prisma.ragQuery.findMany = vi.fn().mockResolvedValue([]);
    prisma.ragQuery.count = vi.fn().mockResolvedValue(0);
    prisma.aiAgent.findUnique = vi.fn().mockResolvedValue(null);

    retrievalService = { retrieve: vi.fn().mockResolvedValue([]) };
    contextBuilder = {
      buildContext: vi.fn().mockResolvedValue(buildSampleContext()),
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
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: RetrievalService, useValue: retrievalService },
        { provide: ContextBuilderService, useValue: contextBuilder },
        { provide: PromptAssemblyService, useValue: promptAssembly },
        { provide: LLMGatewayService, useValue: llmGateway },
        { provide: ResponseProcessingService, useValue: responseProcessing },
      ],
    }).compile();

    service = moduleRef.get(SearchService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    const dto: SearchQueryDto = {
      question: 'how to take wellness pack',
      tenantId: 't1',
    };

    it('returns an answer + citations + metadata', async () => {
      const result = await service.search(dto, { tenantId: 't1', userId: 'u1' });

      expect(result.answer).toBe('Take 2 tablets daily with water [1].');
      expect(result.citations.length).toBe(1);
      expect(result.citations[0].index).toBe(1);
      expect(result.citations[0].documentTitle).toBe('Wellness Guide');
      expect(result.format).toBe('markdown');
      expect(result.confidence).toBe(0.92);
      expect(result.tokens).toBe(60);
      expect(result.model).toBe('gpt-4o');
      expect(result.queryId).toBe('q-1');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('uses agent config when agentId is supplied', async () => {
      prisma.aiAgent.findUnique.mockResolvedValue({
        id: 'agent-1',
        name: 'Support Bot',
        configuration: {
          systemPrompt: 'You are Support Bot.',
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          maxTokens: 500,
        },
      });

      await service.search({ ...dto, agentId: 'agent-1' }, { tenantId: 't1' });

      expect(prisma.aiAgent.findUnique).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
      });
      expect(promptAssembly.buildSystemPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'Support Bot' }),
      );
      expect(llmGateway.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          temperature: 0.5,
          maxTokens: 500,
        }),
      );
    });

    it('persists the ragQuery row with the retrieved chunk IDs + response', async () => {
      await service.search(dto, { tenantId: 't1' });

      expect(prisma.ragQuery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            queryText: 'how to take wellness pack',
            responseText: 'Take 2 tablets daily with water [1].',
            retrievedChunkIds: ['c1'],
          }),
        }),
      );
    });

    it('still returns a result when ragQuery persistence fails (best-effort)', async () => {
      prisma.ragQuery.create.mockRejectedValue(new Error('DB down'));

      const result = await service.search(dto, { tenantId: 't1' });

      // queryId is 'unknown' but the search still succeeded.
      expect(result.queryId).toBe('unknown');
      expect(result.answer).toBeDefined();
    });

    it('throws when no tenantId is available (neither dto nor user)', async () => {
      await expect(service.search({ question: 'q' }, {})).rejects.toThrow(
        /Tenant ID is required/,
      );
    });
  });

  describe('getHistory', () => {
    it('returns paginated history for the tenant', async () => {
      prisma.ragQuery.findMany.mockResolvedValue([
        { id: 'q1', queryText: 'foo' },
      ]);
      prisma.ragQuery.count.mockResolvedValue(1);

      const result = await service.getHistory(
        { page: 1, limit: 10 },
        { tenantId: 't1' },
      );

      expect(result.data.length).toBe(1);
      expect(result.pagination.total).toBe(1);
      expect(prisma.ragQuery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1' },
          take: 10,
        }),
      );
    });
  });

  describe('recordFeedback', () => {
    it('updates the feedback column on the ragQuery row', async () => {
      prisma.ragQuery.findUnique.mockResolvedValue({
        id: 'q1',
        tenantId: 't1',
      });

      const result = await service.recordFeedback(
        'q1',
        { rating: 'positive' },
        { tenantId: 't1' },
      );

      expect(result.success).toBe(true);
      expect(prisma.ragQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'q1' },
          data: { feedback: 'positive' },
        }),
      );
    });

    it('throws 404 when the query does not exist', async () => {
      prisma.ragQuery.findUnique.mockResolvedValue(null);

      await expect(
        service.recordFeedback('q1', { rating: 'positive' }, { tenantId: 't1' }),
      ).rejects.toThrow(/not found/);
    });

    it('throws 404 when the query belongs to a different tenant', async () => {
      prisma.ragQuery.findUnique.mockResolvedValue({
        id: 'q1',
        tenantId: 'other-tenant',
      });

      await expect(
        service.recordFeedback('q1', { rating: 'positive' }, { tenantId: 't1' }),
      ).rejects.toThrow(/not found/);
    });
  });
});
