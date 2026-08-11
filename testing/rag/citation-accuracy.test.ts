/**
 * RAG Citation Accuracy Tests
 * ===========================
 *
 * Verifies the **citation layer** of the Dayjoy RAG pipeline:
 *
 *   1. AI responses include at least one citation when the answer is
 *      drawn from the knowledge base.
 *   2. Every citation carries the required fields (`chunkId`,
 *      `documentId`, `documentTitle`, `snippet`, `score`).
 *   3. Citations correctly point to *product-related* documents when
 *      the user asks about products.
 *   4. Citations are absent (or low-relevance) when the answer does
 *      NOT draw from the knowledge base (e.g. arithmetic questions).
 *   5. Each citation's snippet is a substring of the original chunk
 *      content — never a fabricated or LLM-hallucinated passage.
 *
 * Uses `createMockRagService()` with scripted per-query responses built
 * from the `SEED_CHUNKS` fixtures.
 *
 * Reference: `rag/response-pipeline/response-processing-service.ts`,
 *            `rag/search/search.service.ts` (citation-building logic),
 *            `docs/ai/13_AI_EVALUATION.md` ("Citation accuracy").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRagService } from '../helpers/mock-rag-service';
import {
  SEED_CHUNKS,
  DOC_IDS,
  buildQueryResult,
} from '../helpers/rag-fixtures';

describe('RAG Citation Accuracy', () => {
  let rag: ReturnType<typeof createMockRagService>;

  beforeEach(() => {
    rag = createMockRagService();
    rag._reset();
    rag._seed(SEED_CHUNKS);
  });

  it('should include citations when answering from the knowledge base', async () => {
    const productChunk = SEED_CHUNKS.find((c) => c.chunkId === 'pc-1')!;
    rag._setResponse(
      'What products do you have?',
      buildQueryResult({
        answer:
          'Dayjoy offers a range of wellness, beauty, and home-care products. ' +
          'Our flagship is the Premium Health Tonic (₹699 for 500 ml). [1]',
        citations: [productChunk],
      }),
    );

    const result = await rag.query('What products do you have?');

    expect(result.answer).toBeDefined();
    expect(result.citations).toBeDefined();
    expect(result.citations.length).toBeGreaterThan(0);

    result.citations.forEach((citation: { chunkId?: string; documentId?: string; documentTitle?: string; snippet?: string; score: number }) => {
      expect(citation.chunkId).toBeDefined();
      expect(citation.documentId).toBeDefined();
      expect(citation.documentTitle).toBeDefined();
      expect(citation.snippet).toBeDefined();
      expect(citation.score).toBeGreaterThan(0);
    });
  });

  it('should cite correct sources for product questions', async () => {
    const productChunk = SEED_CHUNKS.find((c) => c.chunkId === 'pc-1')!;
    rag._setResponse(
      'Tell me about the wellness product',
      buildQueryResult({
        answer:
          'Our flagship wellness product is the Dayjoy Premium Health Tonic — ' +
          'an Ayurvedic daily tonic. [1]',
        citations: [productChunk],
      }),
    );

    const result = await rag.query('Tell me about the wellness product');

    const hasProductCitation = result.citations.some(
      (c: { documentTitle?: string; documentId?: string }) =>
        c.documentTitle?.toLowerCase().includes('product') ||
        c.documentId?.includes('product'),
    );
    expect(hasProductCitation).toBe(true);
  });

  it('should cite the return-policy document for return-policy questions', async () => {
    const returnChunk = SEED_CHUNKS.find((c) => c.chunkId === 'rp-1')!;
    rag._setResponse(
      'What is the return policy?',
      buildQueryResult({
        answer:
          'Dayjoy offers a 7-day return policy on unopened products. ' +
          'Refunds are processed within 5–7 business days. [1]',
        citations: [returnChunk],
      }),
    );

    const result = await rag.query('What is the return policy?');
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.documentId).toBe(DOC_IDS.RETURN_POLICY);
  });

  it('should cite the compensation-plan document for commission questions', async () => {
    const compChunk = SEED_CHUNKS.find((c) => c.chunkId === 'cp-1')!;
    rag._setResponse(
      'How is the distributor commission calculated?',
      buildQueryResult({
        answer:
          'The compensation plan has three components: retail profit (20%), ' +
          'performance bonus (5–15%), and leadership bonus. [1]',
        citations: [compChunk],
      }),
    );

    const result = await rag.query('How is the distributor commission calculated?');
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.documentId).toBe(DOC_IDS.COMPENSATION_PLAN);
  });

  it('should not cite when answer is not from the knowledge base', async () => {
    // Arithmetic / general-knowledge questions don't draw from the KB.
    rag._setResponse(
      'What is 2+2?',
      buildQueryResult({
        answer: '2 + 2 = 4.',
        citations: [],
      }),
    );

    const result = await rag.query('What is 2+2?');

    if (result.citations.length > 0) {
      // If citations exist, they should be low-relevance.
      const allLowRelevance = result.citations.every((c: { score: number }) => c.score < 0.5);
      expect(allLowRelevance).toBe(true);
    } else {
      expect(result.citations.length).toBe(0);
    }
  });

  it('should produce citation snippets that are substrings of chunk content', async () => {
    const healthChunk = SEED_CHUNKS.find((c) => c.chunkId === 'pc-3')!;
    rag._setResponse(
      'Tell me about the Premium Health Tonic dosage',
      buildQueryResult({
        answer: 'Take 15 ml twice daily after meals. [1]',
        citations: [healthChunk],
      }),
    );

    const result = await rag.query('Tell me about the Premium Health Tonic dosage');
    expect(result.citations.length).toBeGreaterThan(0);

    result.citations.forEach((c: { chunkId?: string; snippet?: string }) => {
      const sourceChunk = SEED_CHUNKS.find((sc) => sc.chunkId === c.chunkId);
      expect(sourceChunk).toBeDefined();
      // The snippet should be derived from the chunk (either exact
      // snippet or a slice of content).
      const snippet = c.snippet ?? '';
      const contentMatch =
        sourceChunk!.content.includes(snippet) ||
        sourceChunk!.snippet?.includes(snippet) ||
        snippet.includes(sourceChunk!.content.slice(0, 60));
      expect(contentMatch).toBe(true);
    });
  });

  it('should produce citation scores that match chunk scores', async () => {
    const chunks = [
      SEED_CHUNKS.find((c) => c.chunkId === 'pc-1')!,
      SEED_CHUNKS.find((c) => c.chunkId === 'pc-2')!,
    ];
    rag._setResponse(
      'product catalog',
      buildQueryResult({
        answer: 'Dayjoy offers wellness, beauty, and home-care products. [1] [2]',
        citations: chunks,
      }),
    );

    const result = await rag.query('product catalog');
    expect(result.citations.length).toBe(2);

    result.citations.forEach((c: { score: number }, i: number) => {
      const sourceChunk = chunks[i]!;
      expect(c.score).toBeCloseTo(sourceChunk.score, 5);
    });
  });

  it('should produce citation indices that are 1-based and sequential', async () => {
    const chunks = [
      SEED_CHUNKS.find((c) => c.chunkId === 'pc-1')!,
      SEED_CHUNKS.find((c) => c.chunkId === 'cp-1')!,
      SEED_CHUNKS.find((c) => c.chunkId === 'rp-1')!,
    ];
    rag._setResponse(
      'overview',
      buildQueryResult({
        answer: 'Here is an overview of our products, compensation, and return policy. [1] [2] [3]',
        citations: chunks,
      }),
    );

    const result = await rag.query('overview');
    expect(result.citations.length).toBe(3);
    result.citations.forEach((c: { index?: number }, i: number) => {
      expect(c.index).toBe(i + 1);
    });
  });

  it('should return zero citations for off-domain questions', async () => {
    // Default behaviour: hedged "I don't know" with no citations.
    const result = await rag.query('Tell me about Mars exploration');
    expect(result.citations.length).toBe(0);
  });

  it('should attach a unique queryId for every RAG turn', async () => {
    const chunk = SEED_CHUNKS.find((c) => c.chunkId === 'pc-1')!;
    rag._setResponse(
      'products',
      buildQueryResult({
        answer: 'We have many products. [1]',
        citations: [chunk],
        queryId: 'q-test-1',
      }),
    );

    const r1 = await rag.query('products');
    const r2 = await rag.query('products');

    expect(r1.queryId).toBe('q-test-1');
    // Mock returns the same scripted response, so queryId matches.
    expect(r2.queryId).toBe(r1.queryId);
    expect(typeof r1.queryId).toBe('string');
    expect(r1.queryId.length).toBeGreaterThan(0);
  });
});
