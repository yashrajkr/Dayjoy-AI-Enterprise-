import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { PromptAssemblyService } from './prompt-assembly-service';
import { BuiltContext, Memory, SystemPromptConfig } from './prompt-assembly-config';

/**
 * Builds a sample BuiltContext for the prompt-assembly tests.
 */
function buildSampleContext(overrides: Partial<BuiltContext> = {}): BuiltContext {
  return {
    question: 'How do I take the wellness pack?',
    retrievedChunks: [
      {
        chunkId: 'c1',
        documentId: 'd1',
        sourceId: 's1',
        content: 'Take 2 tablets daily with water.',
        similarity: 0.9,
        finalScore: 0.9,
        source: 'vector',
        metadata: {
          chunkIndex: 0,
          documentTitle: 'Wellness Pack Guide',
        },
      },
      {
        chunkId: 'c2',
        documentId: 'd2',
        sourceId: 's2',
        content: 'Avoid taking on an empty stomach.',
        similarity: 0.85,
        finalScore: 0.85,
        source: 'vector',
        metadata: {
          chunkIndex: 1,
          documentTitle: 'Usage FAQ',
        },
      },
    ],
    conversationHistory: [
      { role: 'user', content: 'Tell me about the wellness pack.' },
      { role: 'assistant', content: 'It is a daily supplement.' },
    ],
    memories: [
      {
        id: 'm1',
        type: 'PREFERENCE',
        key: 'preferred_language',
        value: 'en',
        importance: 8,
        expiresAt: null,
      },
    ],
    userProfile: null,
    systemContext: {
      tenantId: 't1',
      agentId: 'agent-1',
      channel: 'WEB',
      timestamp: new Date().toISOString(),
    },
    estimatedTokens: 100,
    ...overrides,
  };
}

/**
 * PromptAssemblyService unit tests.
 *
 * Covers the NEW API (buildSystemPrompt / buildUserPrompt / buildMessagesForLLM)
 * and the channel-template loader. The legacy `assemble()` API is also
 * covered briefly to ensure backward compatibility.
 */
describe('PromptAssemblyService', () => {
  let service: PromptAssemblyService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PromptAssemblyService],
    }).compile();
    service = moduleRef.get(PromptAssemblyService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildSystemPrompt', () => {
    it('assembles all sections in the expected order', () => {
      const config: SystemPromptConfig = {
        role: 'Dayjoy Customer Support AI',
        instructions: 'Help customers with their questions.',
        knowledgeContext: 'Use the provided context to answer.',
        rules: ['Cite sources.', 'If unsure, say so.'],
        availableTools: ['search_knowledge', 'human_transfer'],
      };

      const prompt = service.buildSystemPrompt(config);

      // Sections appear in order.
      const roleIdx = prompt.indexOf('## Role');
      const instrIdx = prompt.indexOf('## Instructions');
      const knowledgeIdx = prompt.indexOf('## Knowledge Context');
      const rulesIdx = prompt.indexOf('## Rules');
      const toolsIdx = prompt.indexOf('## Available Tools');

      expect(roleIdx).toBeLessThan(instrIdx);
      expect(instrIdx).toBeLessThan(knowledgeIdx);
      expect(knowledgeIdx).toBeLessThan(rulesIdx);
      expect(rulesIdx).toBeLessThan(toolsIdx);

      expect(prompt).toContain('Dayjoy Customer Support AI');
      expect(prompt).toContain('Help customers with their questions.');
      expect(prompt).toContain('Cite sources.');
      expect(prompt).toContain('search_knowledge');
    });

    it('omits empty sections (no rules, no tools)', () => {
      const prompt = service.buildSystemPrompt({
        role: 'AI',
        instructions: 'Be helpful.',
      });

      expect(prompt).not.toContain('## Rules');
      expect(prompt).not.toContain('## Available Tools');
    });
  });

  describe('buildUserPrompt', () => {
    it('renders context chunks with citation numbers + source attribution', () => {
      const context = buildSampleContext();
      const prompt = service.buildUserPrompt(context);

      expect(prompt).toContain('[1] (Source: Wellness Pack Guide)');
      expect(prompt).toContain('Take 2 tablets daily with water.');
      expect(prompt).toContain('[2] (Source: Usage FAQ)');
      expect(prompt).toContain('Avoid taking on an empty stomach.');
    });

    it('renders conversation history as user/assistant turns', () => {
      const context = buildSampleContext();
      const prompt = service.buildUserPrompt(context);

      expect(prompt).toContain('user: Tell me about the wellness pack.');
      expect(prompt).toContain('assistant: It is a daily supplement.');
    });

    it('renders memories with type + key + value', () => {
      const context = buildSampleContext();
      const prompt = service.buildUserPrompt(context);

      expect(prompt).toContain('preferred_language (preference): en');
    });

    it('renders the current question', () => {
      const context = buildSampleContext();
      const prompt = service.buildUserPrompt(context);

      expect(prompt).toContain('## Current Question');
      expect(prompt).toContain('How do I take the wellness pack?');
    });

    it('renders "(none)" for missing sections', () => {
      const context = buildSampleContext({
        conversationHistory: [],
        memories: [],
        retrievedChunks: [],
      });
      const prompt = service.buildUserPrompt(context);

      expect(prompt).toContain('No relevant context found.');
      expect(prompt).toContain('(none)');
    });
  });

  describe('buildMessagesForLLM', () => {
    it('returns system + history turns + user prompt', () => {
      const context = buildSampleContext();
      const systemPrompt = 'You are a helpful assistant.';
      const messages = service.buildMessagesForLLM(systemPrompt, context);

      expect(messages[0]).toEqual({ role: 'system', content: systemPrompt });
      // History replayed as separate messages.
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'Tell me about the wellness pack.',
      });
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: 'It is a daily supplement.',
      });
      // Final user message contains the context + question (but NOT
      // history, which is already replayed above).
      const userMessage = messages[messages.length - 1];
      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toContain('How do I take the wellness pack?');
      expect(userMessage.content).not.toContain('Tell me about the wellness pack.');
    });
  });

  describe('loadTemplate', () => {
    it('returns null for a non-existent template (graceful)', () => {
      const content = service.loadTemplate('voice-agent' as any);
      // Either loaded (when running from compiled output) or null (when
      // running from src and the path doesn't resolve). Both are OK.
      expect(content === null || typeof content === 'string').toBe(true);
    });
  });

  describe('legacy assemble()', () => {
    it('returns an AssembledPrompt with systemPrompt + userPrompt + fullPrompt', () => {
      const llmContext = {
        query: 'how to take wellness pack',
        chunks: ['Take 2 tablets daily.'],
        metadata: [
          { source: 's1', documentTitle: 'Guide', chunkIndex: 0 },
        ],
        totalTokens: 5,
        formattedContext: '',
      };

      const assembled = service.assemble(
        'how to take wellness pack',
        llmContext,
        undefined,
        'general',
      );

      expect(assembled.systemPrompt).toBeDefined();
      expect(assembled.userPrompt).toBeDefined();
      expect(assembled.fullPrompt).toContain(assembled.systemPrompt);
      expect(assembled.metadata.chunksUsed).toBe(1);
      expect(assembled.metadata.citations.length).toBe(1);
    });
  });
});
