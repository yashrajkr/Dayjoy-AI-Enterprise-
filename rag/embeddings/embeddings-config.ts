/**
 * Embedding Pipeline Configuration
 * 
 * Optimized for:
 * - OpenAI ada-002 (1536 dimensions)
 * - OpenAI-compatible APIs (Azure OpenAI, local models)
 * - Batch processing for efficiency
 * - Cost optimization
 */

export interface EmbeddingConfig {
  // Model configuration
  model: string;                    // e.g., 'text-embedding-ada-002'
  dimensions: number;               // e.g., 1536
  
  // API configuration
  apiKey?: string;
  apiBase?: string;                 // For Azure or custom endpoints
  apiVersion?: string;              // For Azure OpenAI
  
  // Batch processing
  batchSize: number;                // Embeddings per batch
  maxRetries: number;               // Retry on API failures
  retryDelayMs: number;             // Delay between retries
  timeoutMs: number;                // Request timeout
  
  // Rate limiting
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  
  // Caching
  enableCache: boolean;
  cacheTTLSeconds: number;
}

/**
 * Default embedding configuration for OpenAI ada-002
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-ada-002',
  dimensions: 1536,
  
  // API keys should be set via environment variables
  apiKey: process.env.OPENAI_API_KEY,
  apiBase: process.env.OPENAI_API_BASE,  // Optional: for Azure or proxy
  apiVersion: process.env.OPENAI_API_VERSION,  // Optional: for Azure
  
  // Batch processing
  batchSize: 100,                   // ada-002 supports up to 2048, but 100 is safer
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,                 // 30 seconds
  
  // Rate limiting (ada-002 limits: 3000 RPM, 1M TPM)
  maxRequestsPerMinute: 100,        // Conservative to avoid hitting limits
  maxTokensPerMinute: 50000,        // ~50K tokens/min
  
  // Caching
  enableCache: true,
  cacheTTLSeconds: 3600 * 24 * 7,   // 7 days
};

/**
 * Azure OpenAI configuration example
 */
export const AZURE_EMBEDDING_CONFIG: EmbeddingConfig = {
  ...DEFAULT_EMBEDDING_CONFIG,
  model: process.env.AZURE_EMBEDDING_DEPLOYMENT_NAME || 'text-embedding-ada-002',
  apiBase: process.env.AZURE_OPENAI_API_BASE,  // e.g., 'https://your-resource.openai.azure.com'
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2023-05-15',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
};

/**
 * Local model configuration (e.g., via Ollama, vLLM)
 */
export const LOCAL_EMBEDDING_CONFIG: EmbeddingConfig = {
  ...DEFAULT_EMBEDDING_CONFIG,
  model: process.env.LOCAL_EMBEDDING_MODEL || 'nomic-embed-text',
  apiBase: process.env.LOCAL_EMBEDDING_API_BASE || 'http://localhost:11434',
  apiKey: 'ollama',  // Or empty for local
};

/**
 * Embedding cache entry
 */
export interface EmbeddingCacheEntry {
  text: string;
  embedding: number[];
  model: string;
  createdAt: Date;
  expiresAt: Date;
  hash: string;  // SHA-256 hash of text for fast lookup
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  dimensions: number;
  tokens: number;
  latencyMs: number;
  cached: boolean;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  results: EmbeddingResult[];
  totalTokens: number;
  totalLatencyMs: number;
  cached: number;
  apiCalls: number;
}

/**
 * Embedding statistics
 */
export interface EmbeddingStats {
  totalEmbeddings: number;
  totalTokens: number;
  totalCost: number;  // In USD
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  averageLatencyMs: number;
  errors: number;
}