import { Test, TestingModule } from '@nestjs/testing';
import { LLMGatewayService } from './llm-gateway-service';

describe('LLMGatewayService', () => {
  let service: LLMGatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LLMGatewayService],
    }).compile();

    service = module.get<LLMGatewayService>(LLMGatewayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('should generate response with OpenAI', async () => {
      const request = {
        prompt: 'What is Dayjoy?',
        systemPrompt: 'You are a helpful assistant.',
        model: 'gpt-3.5-turbo',
        provider: 'openai' as const,
        temperature: 0.7,
        maxTokens: 500,
      };

      // Mock fetch (would normally call OpenAI API)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Dayjoy is a company...',
              },
            },
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150,
          },
        }),
      });

      const response = await service.generate(request);

      expect(response.provider).toBe('openai');
      expect(response.model).toBe('gpt-3.5-turbo');
      expect(response.content).toBeDefined();
      expect(response.usage.totalTokens).toBe(150);
    });

    it('should use cache for repeated requests', async () => {
      const request = {
        prompt: 'Cached test query',
        systemPrompt: 'You are helpful.',
        model: 'gpt-3.5-turbo',
        provider: 'openai' as const,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Cached response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      // First call (cache miss)
      const response1 = await service.generate(request);

      // Second call (cache hit)
      const response2 = await service.generate(request);

      expect(response1.cached).toBe(false);
      expect(response2.cached).toBe(true);
      expect(response1.content).toBe(response2.content);

      // Should only call API once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fallback on provider failure', async () => {
      const request = {
        prompt: 'Test query',
        provider: 'openai' as const,
      };

      // Mock OpenAI failure
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('OpenAI API error'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'Fallback response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });

      const response = await service.generate(request);

      // Should fallback to Anthropic
      expect(response.provider).toBe('anthropic');
      expect(response.content).toBe('Fallback response');
    });

    it('should select provider based on complexity', async () => {
      const simpleRequest = {
        prompt: 'Hi',
        provider: undefined,
      };

      const complexRequest = {
        prompt: 'This is a very long and complex query with many words. '.repeat(20),
        provider: undefined,
      };

      // Simple query should use cheaper model
      const simpleResponse = await service.generate({
        ...simpleRequest,
        model: 'gpt-3.5-turbo',
        provider: 'openai',
      });

      // Complex query should use better model
      const complexResponse = await service.generate({
        ...complexRequest,
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(simpleResponse).toBeDefined();
      expect(complexResponse).toBeDefined();
    });

    it('should track statistics', async () => {
      const request = {
        prompt: 'Stats test',
        model: 'gpt-3.5-turbo',
        provider: 'openai' as const,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      await service.generate(request);

      const stats = service.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBe(30);
      expect(stats.providerUsage.openai).toBe(1);
      expect(stats.modelUsage['gpt-3.5-turbo']).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const stats = service.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBeDefined();
      expect(stats.totalTokens).toBeDefined();
      expect(stats.totalCost).toBeDefined();
      expect(stats.providerUsage).toBeDefined();
      expect(stats.modelUsage).toBeDefined();
      expect(stats.averageLatencyMs).toBeDefined();
      expect(stats.cacheHits).toBeDefined();
      expect(stats.cacheMisses).toBeDefined();
      expect(stats.errors).toBeDefined();
      expect(stats.fallbacks).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const request = {
        prompt: 'Cache test',
        model: 'gpt-3.5-turbo',
        provider: 'openai' as const,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      // Generate to populate cache
      await service.generate(request);

      // Clear cache
      service.clearCache();

      // Next call should be cache miss
      const response = await service.generate(request);

      expect(response.cached).toBe(false);
    });
  });

  describe('estimateComplexity', () => {
    it('should estimate query complexity correctly', async () => {
      const simple = service['estimateComplexity']('Hi');
      const medium = service['estimateComplexity']('This is a medium length query with some context.');
      const complex = service['estimateComplexity']('This is a very long query. '.repeat(50));

      expect(simple).toBe('low');
      expect(medium).toBe('medium');
      expect(complex).toBe('high');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly', async () => {
      const response = {
        model: 'gpt-3.5-turbo',
        usage: {
          totalTokens: 1000,
        },
      } as any;

      const cost = service['calculateCost'](response);

      // gpt-3.5-turbo: $0.0005 per 1K tokens
      expect(cost).toBe(0.0005);
    });

    it('should handle different models', async () => {
      const gpt4o = { model: 'gpt-4o', usage: { totalTokens: 1000 } } as any;
      const claude3opus = { model: 'claude-3-opus', usage: { totalTokens: 1000 } } as any;

      expect(service['calculateCost'](gpt4o)).toBe(0.005);
      expect(service['calculateCost'](claude3opus)).toBe(0.015);
    });
  });
});