/**
 * Vector Store Configuration
 * 
 * Optimized for:
 * - PostgreSQL with pgvector extension
 * - HNSW index for fast similarity search
 * - Hybrid search (BM25 + vector)
 * - Multi-tenant isolation
 */

export interface VectorStoreConfig {
  // Vector dimensions
  dimensions: number;  // 1536 for ada-002
  
  // Index configuration
  indexType: 'hnsw' | 'ivfflat';
  hnswM: number;           // HNSW: max connections per layer (default: 16)
  hnswEfConstruction: number;  // HNSW: size of dynamic candidate list (default: 64)
  hnswEfSearch: number;    // HNSW: search depth (default: 40)
  
  // Search configuration
  topK: number;            // Default results to return
  similarityThreshold: number;  // Minimum similarity score (0-1)
  distanceMetric: 'cosine' | 'l2' | 'ip';  // Distance metric
  
  // Hybrid search
  hybridSearch: {
    enabled: boolean;
    bm25Weight: number;    // Weight for BM25 (0-1)
    vectorWeight: number;  // Weight for vector similarity (0-1)
  };
  
  // Performance
  maxSearchResults: number;  // Hard limit on results
  searchTimeoutMs: number;   // Query timeout
}

/**
 * Default vector store configuration for pgvector
 */
export const DEFAULT_VECTOR_STORE_CONFIG: VectorStoreConfig = {
  dimensions: 1536,  // OpenAI ada-002
  
  // HNSW index (best for accuracy and speed)
  indexType: 'hnsw',
  hnswM: 16,
  hnswEfConstruction: 64,
  hnswEfSearch: 40,
  
  // Search defaults
  topK: 5,
  similarityThreshold: 0.7,  // 70% similarity minimum
  distanceMetric: 'cosine',  // Cosine similarity
  
  // Hybrid search (BM25 + vector)
  hybridSearch: {
    enabled: true,
    bm25Weight: 0.3,   // 30% BM25
    vectorWeight: 0.7, // 70% vector similarity
  },
  
  // Performance limits
  maxSearchResults: 100,
  searchTimeoutMs: 5000,  // 5 seconds
};

/**
 * Search filters
 */
export interface SearchFilters {
  // Document filters
  documentId?: string;
  sourceId?: string;
  documentType?: string;
  
  // Content filters
  hasCode?: boolean;
  hasTable?: boolean;
  hasList?: boolean;
  
  // Metadata filters
  heading?: string;
  minTokenCount?: number;
  maxTokenCount?: number;
  
  // Tenant isolation
  tenantId: string;
}

/**
 * Search result
 */
export interface SearchResult {
  chunkId: string;
  documentId: string;
  sourceId: string;
  content: string;
  similarity: number;  // 0-1 (1 = identical)
  score: number;       // Hybrid score (if enabled)
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
 * Search query
 */
export interface SearchQuery {
  query: string;
  queryEmbedding: number[];
  filters?: SearchFilters;
  topK?: number;
  similarityThreshold?: number;
  enableHybridSearch?: boolean;
}

/**
 * Index statistics
 */
export interface IndexStats {
  totalVectors: number;
  indexSize: string;  // Human-readable size
  avgSearchTimeMs: number;
  indexType: string;
  dimensions: number;
  lastBuilt: Date;
}