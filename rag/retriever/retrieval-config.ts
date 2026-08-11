/**
 * Retrieval Pipeline Configuration
 *
 * Orchestrates:
 * - Query embedding generation
 * - Vector similarity search
 * - Keyword (PostgreSQL full-text) search
 * - Hybrid merge (Reciprocal Rank Fusion)
 * - Re-ranking (cross-encoder / LLM)
 * - Context selection
 */

export interface RetrievalConfig {
  // Search configuration
  topK: number;              // Initial results to retrieve
  finalTopK: number;         // Final results after re-ranking
  similarityThreshold: number;  // Minimum similarity score

  // Hybrid search (vector + keyword via RRF)
  hybrid: {
    enabled: boolean;
    rrfConstant: number;     // k in 1/(k+rank) — standard value is 60
    overFetchFactor: number; // multiplier on topK when over-fetching for fusion
    keywordTopK: number;     // top-K for the keyword leg
  };

  // Re-ranking
  rerank: {
    enabled: boolean;
    model: string;           // Re-ranking model (e.g., 'bge-reranker')
    topK: number;            // Results after re-ranking
    llmRerank: boolean;      // Use LLM for re-ranking (expensive)
  };

  // Context building
  context: {
    maxTokens: number;       // Maximum tokens for LLM context
    maxChunks: number;       // Maximum chunks in context
    includeMetadata: boolean; // Include chunk metadata
  };

  // Caching
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

/**
 * Default retrieval configuration
 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 10,                // Retrieve 10 initially
  finalTopK: 5,            // Return top 5 after re-ranking
  similarityThreshold: 0.7, // 70% minimum similarity

  // Hybrid search — RRF (Reciprocal Rank Fusion)
  hybrid: {
    enabled: true,
    rrfConstant: 60,        // Standard RRF k value
    overFetchFactor: 2,     // Over-fetch 2x for fusion
    keywordTopK: 20,        // Top-20 keyword matches
  },

  // Re-ranking (optional but recommended)
  rerank: {
    enabled: true,
    model: 'bge-reranker-large',  // Or cross-encoder model
    topK: 5,
    llmRerank: false,       // Default OFF — expensive
  },

  // Context building
  context: {
    maxTokens: 4000,       // Leave room for prompt + response
    maxChunks: 10,         // Max chunks in context
    includeMetadata: true, // Include source info
  },

  // Caching
  cache: {
    enabled: true,
    ttlSeconds: 3600,      // 1 hour cache
  },
};

/**
 * Retrieval query
 */
export interface RetrievalQuery {
  query: string;
  tenantId: string;
  filters?: RetrievalFilters;
  topK?: number;
  similarityThreshold?: number;
  enableReranking?: boolean;
  /** Enable LLM-based re-ranking (expensive — defaults to OFF). */
  enableLlmRerank?: boolean;
  /**
   * Enable hybrid (vector + keyword) retrieval. Defaults to `true` when
   * {@link RetrievalConfig.hybrid.enabled} is true. Set to `false` to
   * run vector-only retrieval.
   */
  enableHybrid?: boolean;
  /** Skip the cache (force a fresh retrieval). */
  skipCache?: boolean;
  /** User ID for access-control filtering. */
  userId?: string;
  /** User role for access-control filtering (public/customer/distributor/employee/admin). */
  userRole?: string;
}

/**
 * Retrieval filters
 */
export interface RetrievalFilters {
  // Document filters
  documentId?: string;
  sourceId?: string;
  documentType?: string;
  category?: string;
  tags?: string[];

  // Content filters
  hasCode?: boolean;
  hasTable?: boolean;
  hasList?: boolean;

  // Token range
  minTokenCount?: number;
  maxTokenCount?: number;
}

/**
 * Retrieval result
 */
export interface RetrievalResult {
  // Chunk info
  chunkId: string;
  documentId: string;
  sourceId: string;
  content: string;

  // Scores
  similarity: number;      // Vector similarity (0-1)
  rerankScore?: number;    // Re-ranking score (0-1)
  finalScore: number;      // Final ranking score
  keywordScore?: number;   // BM25/keyword rank score (when hybrid)

  /**
   * Which retrieval leg produced this result. `vector` = pure vector
   * similarity, `keyword` = pure PostgreSQL full-text, `hybrid` = RRF
   * fusion produced it (chunk was matched by both legs).
   */
  source?: 'vector' | 'keyword' | 'hybrid';

  // Metadata
  metadata: {
    chunkIndex: number;
    totalChunks: number;
    heading?: string;
    headingLevel?: number;
    documentTitle: string;
    documentType: string;
    tokenCount: number;
    hasCode: boolean;
    hasTable: boolean;
    hasList: boolean;
  };
}

/**
 * Context for LLM
 */
export interface LLMContext {
  query: string;
  chunks: string[];
  metadata: Array<{
    source: string;
    documentTitle: string;
    chunkIndex: number;
  }>;
  totalTokens: number;
  formattedContext: string;
}

/**
 * Retrieval statistics
 */
export interface RetrievalStats {
  totalQueries: number;
  averageLatencyMs: number;
  averageResultsCount: number;
  cacheHits: number;
  cacheMisses: number;
  rerankEnabled: number;
  hybridEnabled: number;
  keywordFallbacks: number;
  errors: number;
}
