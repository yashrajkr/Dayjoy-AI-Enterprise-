import { Test, TestingModule } from '@nestjs/testing';
import { PromptAssemblyService } from './prompt-assembly-service';
import { LLMContext } from '../retriever/retrieval-config';

describe('PromptAssemblyService', () => {
  let service: PromptAssemblyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptAssemblyService],
    }).compile();

    service = module.get<PromptAssemblyService>(PromptAssemblyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assemble', () => {
    it('should assemble prompt with context and query', async () => {
      const query = 'What is the return policy?';
      const context: LLMContext = {
        query,
        chunks: [
          'Returns are accepted within 30 days of purchase.',
          'Items must be in original condition with tags attached.',
        ],
        metadata: [
          {
            source: 'source-1',
            documentTitle: 'Return Policy',
            chunkIndex: 0,
          },
          {
            source: 'source-1',
            documentTitle: 'Return Policy',
            chunkIndex: 1,
          },
        ],
        totalTokens: 50,
        formattedContext: '',
      };

      const result = service.assemble(query, context);

      expect(result.systemPrompt).toBeDefined();
      expect(result.userPrompt).toBeDefined();
      expect(result.fullPrompt).toBeDefined();
      expect(result.metadata.contextTokens).toBeGreaterThan(0);
      expect(result.metadata.queryTokens).toBeGreaterThan(0);
      expect(result.metadata.totalTokens).toBeGreaterThan(0);
      expect(result.metadata.chunksUsed).toBe(2);
      expect(result.metadata.citations.length).toBe(2);
      expect(result.metadata.citations[0].documentTitle).toBe('Return Policy');
    });

    it('should include conversation history', async () => {
      const query = 'What is the return policy?';
      const context: LLMContext = {
        query,
        chunks: ['Returns accepted within 30 days.'],
        metadata: [
          {
            source: 'source-1',
            documentTitle: 'Return Policy',
            chunkIndex: 0,
          },
        ],
        totalTokens: 20,
        formattedContext: '',
      };

      const history = [
        'User: I need help with my order',
        'Assistant: Sure, what\'s your question?',
      ];

      const result = service.assemble(query, context, history);

      expect(result.userPrompt).toContain('Conversation history');
      expect(result.userPrompt).toContain('I need help with my order');
    });

    it('should use custom template', async () => {
      const query = 'I want to join Dayjoy business';
      const context: LLMContext = {
        query,
        chunks: ['Dayjoy offers great business opportunity.'],
        metadata: [
          {
            source: 'source-1',
            documentTitle: 'Business Opportunity',
            chunkIndex: 0,
          },
        ],
        totalTokens: 20,
        formattedContext: '',
      };

      const result = service.assemble(query, context, undefined, 'sales');

      expect(result.systemPrompt).toContain('Sales AI');
      expect(result.systemPrompt).toContain('business opportunity');
    });

    it('should handle empty context', async () => {
      const query = 'What is Dayjoy?';
      const context: LLMContext = {
        query,
        chunks: [],
        metadata: [],
        totalTokens: 0,
        formattedContext: '',
      };

      const result = service.assemble(query, context);

      expect(result.systemPrompt).toBeDefined();
      expect(result.userPrompt).toBeDefined();
      expect(result.metadata.chunksUsed).toBe(0);
      expect(result.metadata.citations.length).toBe(0);
    });

    it('should include citations', async () => {
      const query = 'Test query';
      const context: LLMContext = {
        query,
        chunks: ['Chunk 1', 'Chunk 2'],
        metadata: [
          {
            source: 'source-1',
            documentTitle: 'Doc 1',
            chunkIndex: 0,
          },
          {
            source: 'source-2',
            documentTitle: 'Doc 2',
            chunkIndex: 1,
          },
        ],
        totalTokens: 40,
        formattedContext: '',
      };

      const result = service.assemble(query, context);

      expect(result.userPrompt).toContain('[1]');
      expect(result.userPrompt).toContain('[2]');
      expect(result.metadata.citations[0].number).toBe(1);
      expect(result.metadata.citations[0].source).toBe('source-1');
      expect(result.metadata.citations[1].number).toBe(2);
      expect(result.metadata.citations[1].source).toBe('source-2');
    });
  });

  describe('exceedsTokenLimit', () => {
    it('should detect when prompt exceeds limit', async () => {
      const exceeds = service.exceedsTokenLimit(7000);
      expect(exceeds).toBe(true);
    });

    it('should detect when prompt is within limit', async () => {
      const exceeds = service.exceedsTokenLimit(5000);
      expect(exceeds).toBe(false);
    });
  });

  describe('truncateContextToFit', () => {
    it('should truncate context to fit token limit', async () => {
      const context: LLMContext = {
        query: 'Test query',
        chunks: Array.from({ length: 20 }, (_, i) => `Chunk ${i} content `.repeat(50)),
        metadata: Array.from({ length: 20 }, (_, i) => ({
          source: 'source-1',
          documentTitle: 'Test Doc',
          chunkIndex: i,
        })),
        totalTokens: 10000, // Very large
        formattedContext: '',
      };

      const truncated = service.truncateContextToFit(context, 4000);

      expect(truncated.chunks.length).toBeLessThan(context.chunks.length);
      expect(truncated.totalTokens).toBeLessThanOrEqual(4000);
    });

    it('should not truncate if already within limit', async () => {
      const context: LLMContext = {
        query: 'Test query',
        chunks: ['Chunk 1', 'Chunk 2'],
        metadata: [
          { source: 'source-1', documentTitle: 'Doc 1', chunkIndex: 0 },
          { source: 'source-1', documentTitle: 'Doc 1', chunkIndex: 1 },
        ],
        totalTokens: 100,
        formattedContext: '',
      };

      const truncated = service.truncateContextToFit(context, 4000);

      expect(truncated.chunks.length).toBe(context.chunks.length);
      expect(truncated.totalTokens).toBe(context.totalTokens);
    });
  });

  describe('updateSystemPrompt', () => {
    it('should update system prompt', async () => {
      const newPrompt = 'You are a custom assistant.';
      service.updateSystemPrompt(newPrompt);

      const config = service.getConfig();
      expect(config.systemPrompt).toBe(newPrompt);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', async () => {
      const config = service.getConfig();

      expect(config.systemPrompt).toBeDefined();
      expect(config.context).toBeDefined();
      expect(config.history).toBeDefined();
      expect(config.query).toBeDefined();
      expect(config.constraints).toBeDefined();
      expect(config.citations).toBeDefined();
    });
  });
});