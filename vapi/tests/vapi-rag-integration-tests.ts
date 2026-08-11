/**
 * Vapi RAG Integration Tests
 *
 * Verifies the integration between the `search_knowledge` tool and the
 * RAG (retrieval-augmented generation) pipeline exposed by the backend
 * `KnowledgeService`.
 *
 * Coverage:
 *   - Happy path — `KnowledgeService.query()` returns an answer +
 *     citations, the tool surfaces both in its result.
 *   - No citations → escalate via `speak` ("I don't have that
 *     information").
 *   - Top-K parameter forwarded to the service.
 *   - Tenant scoping — the query is passed the tenantId from
 *     ToolContext.
 *   - Conversation context — the conversationId is forwarded so the
 *     RAG pipeline can record a `RagQuery` row.
 *   - Error path — service throws → tool returns a structured failure
 *     with a friendly `speak`.
 *   - Empty query — validation short-circuits before the service is
 *     invoked.
 *
 * The `KnowledgeService` is mocked at the constructor boundary so we
 * exercise the real tool code path (validation + try/catch + result
 * shaping + speak formatting) without a real vector DB.
 *
 * Run with: `vitest run vapi/tests/vapi-rag-integration-tests.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VapiSearchKnowledgeTool } from '../tools/vapi-search-knowledge-tool';
import type { ToolContext } from '../tools/vapi-tool-interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    tenantId: 't1',
    userId: 'u1',
    conversationId: 'conv-1',
    callId: 'call-1',
    sessionId: 'sess-1',
    ...overrides,
  };
}

function makeKnowledgeServiceMock() {
  return { query: vi.fn() };
}

// ===========================================================================
// RAG integration via VapiSearchKnowledgeTool
// ===========================================================================
describe('VapiRAGIntegration', () => {
  let knowledgeService: ReturnType<typeof makeKnowledgeServiceMock>;
  let tool: VapiSearchKnowledgeTool;

  beforeEach(() => {
    knowledgeService = makeKnowledgeServiceMock();
    tool = new VapiSearchKnowledgeTool(knowledgeService as any);
  });

  // -------------------------------------------------------------------------
  // Basic RAG call shape
  // -------------------------------------------------------------------------
  describe('Basic RAG call shape', () => {
    it('returns the answer + citations structure on a happy-path call', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'Returns are accepted within 30 days of purchase.',
        citations: [
          {
            chunkId: 'c1',
            documentId: 'd1',
            documentTitle: 'Return Policy',
            content: 'Returns accepted within 30 days...',
            score: 0.92,
          },
          {
            chunkId: 'c2',
            documentId: 'd1',
            documentTitle: 'Return Policy',
            content: 'Items must be unopened...',
            score: 0.85,
          },
        ],
        latencyMs: 38,
        queryId: 'rag-q-1',
      });

      const result = await tool.execute(
        { query: 'return policy' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('answer');
      expect(result.data).toHaveProperty('citations');
      expect(result.data).toHaveProperty('queryId');
      expect(result.data).toHaveProperty('latencyMs');
      expect(Array.isArray(result.data.citations)).toBe(true);
      expect(result.data.citations).toHaveLength(2);
      expect(result.data.citations[0]).toHaveProperty('chunkId');
      expect(result.data.citations[0]).toHaveProperty('documentTitle');
      expect(result.data.citations[0]).toHaveProperty('score');
      expect(result.speak).toBe('Returns are accepted within 30 days of purchase.');
    });

    it('forwards the query + tenantId + conversationId to the knowledge service', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'OK',
        citations: [{ chunkId: 'c1', documentId: 'd1', content: '...', score: 0.5 }],
        latencyMs: 5,
        queryId: 'q1',
      });

      await tool.execute(
        { query: 'BV calculation', topK: 5 },
        makeContext({ tenantId: 'tenant-42', conversationId: 'conv-42' }),
      );

      expect(knowledgeService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'BV calculation',
          topK: 5,
          tenantId: 'tenant-42',
          conversationId: 'conv-42',
        }),
        expect.objectContaining({
          tenantId: 'tenant-42',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Escalation when no citations
  // -------------------------------------------------------------------------
  describe('No-citations handling', () => {
    it('escalates via speak when the RAG service returns no citations', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'No relevant information found for query: "xyz".',
        citations: [],
        latencyMs: 4,
        queryId: 'q-empty',
      });

      const result = await tool.execute({ query: 'xyz' }, makeContext());

      expect(result.success).toBe(true);
      expect(result.data.citations).toEqual([]);
      expect(result.speak).toContain("don't have that information");
    });

    it('escalates when the answer text contains "no relevant information"', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'No relevant information found in the knowledge base.',
        citations: [{ chunkId: 'c1', documentId: 'd1', content: '...', score: 0.1 }],
        latencyMs: 6,
        queryId: 'q-low',
      });

      const result = await tool.execute({ query: 'obscure topic' }, makeContext());

      expect(result.speak).toContain("don't have that information");
    });
  });

  // -------------------------------------------------------------------------
  // Top-K parameter
  // -------------------------------------------------------------------------
  describe('Top-K parameter', () => {
    it('defaults to topK=3 when not supplied', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'OK',
        citations: [],
        latencyMs: 1,
        queryId: 'q1',
      });

      await tool.execute({ query: 'x' }, makeContext());

      expect(knowledgeService.query).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 3 }),
        expect.anything(),
      );
    });

    it('honours an explicit topK override', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'OK',
        citations: [],
        latencyMs: 1,
        queryId: 'q1',
      });

      await tool.execute({ query: 'x', topK: 7 }, makeContext());

      expect(knowledgeService.query).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 7 }),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('Service error handling', () => {
    it('returns a structured failure when the knowledge service throws', async () => {
      knowledgeService.query.mockRejectedValue(new Error('Vector DB unreachable'));

      const result = await tool.execute({ query: 'x' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Vector DB unreachable');
      expect(result.speak).toContain('trouble searching');
    });

    it('returns a structured failure when the knowledge service times out', async () => {
      knowledgeService.query.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await tool.execute({ query: 'x' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('ETIMEDOUT');
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  describe('Validation', () => {
    it('rejects an empty query without calling the knowledge service', async () => {
      const result = await tool.execute({ query: '' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query is required');
      expect(knowledgeService.query).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only query', async () => {
      const result = await tool.execute({ query: '   ' }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query is required');
      expect(knowledgeService.query).not.toHaveBeenCalled();
    });

    it('rejects when tenantId is missing from context', async () => {
      const result = await tool.execute(
        { query: 'x' },
        makeContext({ tenantId: '' as any }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/tenantId/i);
      expect(knowledgeService.query).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // QueryId round-trip (for feedback loops)
  // -------------------------------------------------------------------------
  describe('QueryId round-trip', () => {
    it('persists the queryId returned by the RAG service for feedback loops', async () => {
      knowledgeService.query.mockResolvedValue({
        answer: 'OK',
        citations: [],
        latencyMs: 5,
        queryId: 'rag-q-feedback',
      });

      const result = await tool.execute({ query: 'x' }, makeContext());

      expect(result.data.queryId).toBe('rag-q-feedback');
    });
  });
});
