/**
 * Mock RAG Service — used by the channel-test RAG specs.
 *
 * Mirrors the public surface of `rag/search/search.service.ts` +
 * `rag/retriever/retrieval-service.ts` so the tests can drive a
 * deterministic, scripted RAG pipeline without a live Postgres + OpenAI
 * stack. The mock is intentionally simple: tests inject the chunks /
 * answers / citations they want each query to surface, then assert on
 * the downstream behaviour (precision, recall, citations, hallucination
 * hedging, etc.).
 *
 * The mock is also a faithful shape-match for the real `SearchService`:
 * `search(query, { topK })` returns `SearchResult[]` with
 * `{ documentId, score, ... }`, and `query(question)` returns a single
 * `{ answer, citations, ... }` payload. That way, when the real
 * `SearchService` is wired up, the tests can be flipped to use it
 * without rewriting the assertions.
 */

import { vi } from 'vitest';

/** A single retrieved chunk. */
export interface RagChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  snippet?: string;
  score: number;
  finalScore?: number;
  metadata?: { documentTitle?: string; [k: string]: unknown };
}

/** Single search() result row (lower-level than `query()`). */
export interface RagSearchResult {
  documentId: string;
  documentTitle: string;
  score: number;
  chunkId: string;
  snippet: string;
}

/** `query()` return shape — full RAG turn. */
export interface RagQueryResult {
  answer: string;
  citations: Array<{
    chunkId?: string;
    documentId?: string;
    documentTitle?: string;
    snippet?: string;
    score: number;
    index?: number;
    unresolved?: boolean;
  }>;
  queryId: string;
  latencyMs: number;
  confidence: number;
  retrievedChunks: number;
  tokens: number;
  model: string;
}

export interface RagSearchOptions {
  topK?: number;
  tenantId?: string;
  filter?: {
    documentId?: string;
    sourceId?: string;
    category?: string;
    tags?: string[];
  };
}

/** Build a mock RAG service that scripts per-query responses. */
export function createMockRagService() {
  const chunks: RagChunk[] = [];
  const queryResponses = new Map<string, RagQueryResult>();
  let defaultResponse: RagQueryResult | null = null;
  let queryCounter = 0;

  /** Seed the in-memory chunk store. */
  function seed(newChunks: RagChunk[]): void {
    chunks.push(...newChunks);
  }

  /** Register a scripted response for a given question (exact match). */
  function setResponse(question: string, response: RagQueryResult): void {
    queryResponses.set(question.toLowerCase().trim(), response);
  }

  /** Register a fallback response (used when no scripted match is found). */
  function setDefaultResponse(response: RagQueryResult | null): void {
    defaultResponse = response;
  }

  /** Reset all state. */
  function reset(): void {
    chunks.length = 0;
    queryResponses.clear();
    defaultResponse = null;
    queryCounter = 0;
  }

  const search = vi.fn(async (
    query: string,
    opts: RagSearchOptions = {},
  ): Promise<RagSearchResult[]> => {
    const topK = opts.topK ?? 5;
    const q = query.toLowerCase();

    // Naive BM25-ish scoring: count keyword overlaps weighted by
    // field (title matches are stronger than body matches). Tests
    // inject well-tuned chunks so the score is deterministic.
    const stopWords = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'has', 'had', 'you', 'your', 'our', 'from', 'what', 'how', 'who', 'when', 'why', 'where', 'this', 'that', 'with', 'into', 'does', 'did', 'have', 'has']);
    const terms = q
      // Strip trailing punctuation so "cream?" matches "cream".
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .filter((t) => !stopWords.has(t));

    const scored = chunks
      .map((c) => {
        const content = c.content.toLowerCase();
        const title = c.documentTitle.toLowerCase();
        const docId = c.documentId.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (content.includes(t)) score += 0.5;
          if (title.includes(t)) score += 0.5;
          if (docId.includes(t)) score += 0.5;
        }
        return { chunk: c, score: Math.min(0.95, score) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ chunk, score }) => ({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkId: chunk.chunkId,
      snippet:
        chunk.snippet ??
        (chunk.content.length > 200
          ? chunk.content.slice(0, 200) + '...'
          : chunk.content),
      score,
    }));
  });

  const query = vi.fn(async (question: string): Promise<RagQueryResult> => {
    queryCounter += 1;
    const key = question.toLowerCase().trim();
    const scripted = queryResponses.get(key);
    if (scripted) return scripted;
    if (defaultResponse) return defaultResponse;

    // Synthesise a minimal "I don't know" response.
    return {
      answer: "I'm sorry, I don't have information about that in our knowledge base.",
      citations: [],
      queryId: `q-mock-${queryCounter}`,
      latencyMs: 12,
      confidence: 0,
      retrievedChunks: 0,
      tokens: 24,
      model: 'gpt-4o-mock',
    };
  });

  /** Ingestion API — only the parts the tests assert on. */
  let ingestionCounter = 0;
  const ingestDocument = vi.fn(async (dto: {
    title: string;
    content: string;
    sourceName?: string;
    tenantId?: string;
  }) => {
    ingestionCounter += 1;
    // Use a counter so two documents ingested in the same millisecond
    // still get unique IDs (Date.now() alone collides on rapid calls).
    const documentId = `doc-${Date.now()}-${ingestionCounter}`;
    // Split on paragraph boundaries (matches the chunking service's
    // default behaviour) and create one chunk per paragraph.
    const paragraphs = dto.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    paragraphs.forEach((p, idx) => {
      chunks.push({
        chunkId: `${documentId}-chunk-${idx + 1}`,
        documentId,
        documentTitle: dto.title,
        content: p,
        snippet: p.length > 200 ? p.slice(0, 200) + '...' : p,
        score: 0.85 - idx * 0.05,
        finalScore: 0.85 - idx * 0.05,
        metadata: { documentTitle: dto.title, paragraphIndex: idx },
      });
    });

    return {
      documentId,
      title: dto.title,
      chunksCreated: paragraphs.length,
      status: 'READY' as const,
      embeddingDimensions: 1536,
    };
  });

  const deleteDocument = vi.fn(async (documentId: string) => {
    const before = chunks.length;
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i]?.documentId === documentId) chunks.splice(i, 1);
    }
    const removed = before - chunks.length;
    return { documentId, chunksRemoved: removed, status: 'DELETED' as const };
  });

  return {
    search,
    query,
    ingestDocument,
    deleteDocument,
    // Test-only inspection helpers.
    _seed: seed,
    _setResponse: setResponse,
    _setDefaultResponse: setDefaultResponse,
    _reset: reset,
    _chunks: chunks,
  };
}

export type MockRagService = ReturnType<typeof createMockRagService>;
