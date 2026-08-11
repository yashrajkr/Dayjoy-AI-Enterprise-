/**
 * Response Processing Configuration
 * ================================
 *
 * Handles:
 *  - Citation extraction (parse `[1]`, `[2]` references in the LLM response)
 *  - Citation validation (validate against the retrieved chunks)
 *  - Response formatting (markdown / plain text / structured JSON)
 *  - Hallucination detection (response contains info not in context)
 *  - Confidence scoring
 *  - Response streaming (token-by-token)
 *  - Response caching
 *
 * Originally at `rag/evaluation/response-processing-config.ts` — MOVED to
 * `rag/response-pipeline/response-processing-config.ts` because response
 * processing is part of the response pipeline, not the evaluation
 * framework. A backward-compat re-export remains at the original path.
 */

export interface ResponseProcessingConfig {
  // Citation extraction
  citations: {
    enabled: boolean;
    pattern: string;  // Regex pattern for citations
    extractSources: boolean;
  };

  // Streaming
  streaming: {
    enabled: boolean;
    chunkSize: number;  // Characters per chunk
    chunkDelayMs: number;  // Delay between chunks
  };

  // Response caching
  caching: {
    enabled: boolean;
    ttlSeconds: number;
    maxSize: number;
  };

  // Response validation
  validation: {
    enabled: boolean;
    checkToxicity: boolean;
    checkPII: boolean;
    checkHallucination: boolean;
    /** Minimum fraction of response sentences that must be supported by a citation. */
    minSupportedSentences: number;
  };
}

/**
 * Default response processing configuration
 */
export const DEFAULT_RESPONSE_CONFIG: ResponseProcessingConfig = {
  // Citation extraction
  citations: {
    enabled: true,
    pattern: '\\[(\\d+)\\]',  // Match [1], [2], etc.
    extractSources: true,
  },

  // Streaming
  streaming: {
    enabled: true,
    chunkSize: 50,  // 50 characters per chunk
    chunkDelayMs: 50,  // 50ms delay
  },

  // Response caching
  caching: {
    enabled: true,
    ttlSeconds: 3600,  // 1 hour
    maxSize: 10000,
  },

  // Response validation
  validation: {
    enabled: true,
    checkToxicity: false,  // Enable with external API
    checkPII: true,
    checkHallucination: true,
    minSupportedSentences: 0.5,  // 50% of sentences should be citation-backed
  },
};

/**
 * A citation extracted from the LLM response.
 */
export interface ExtractedCitation {
  /** The citation number as it appears in the response text — `[1]` → `1`. */
  number: number;
  /** Resolved chunk ID (when matched against retrieved chunks). */
  chunkId?: string;
  /** Resolved document ID (when matched). */
  documentId?: string;
  /** Resolved document title (when matched). */
  documentTitle?: string;
  /** Resolved chunk index (when matched). */
  chunkIndex?: number;
  /** Confidence in the citation match (0-1). 1.0 = exact match. */
  confidence: number;
  /** True when the citation number couldn't be resolved to a chunk. */
  unresolved: boolean;
}

/**
 * Processed response — the canonical output of
 * {@link ResponseProcessingService.process}.
 */
export interface ProcessedResponse {
  /** The original LLM response content. */
  content: string;

  /** Citations extracted from the response + validated against chunks. */
  citations: ExtractedCitation[];

  /** The format the response is in (affects how the client renders it). */
  format: 'markdown' | 'plain' | 'structured';

  /** Metadata about the response. */
  metadata: {
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    hasCitations: boolean;
    citationCount: number;
    /** Fraction of sentences backed by at least one citation (0-1). */
    citationCoverage: number;
  };

  /** Validation results. */
  validation: {
    isToxic: boolean;
    hasPII: boolean;
    isHallucinated: boolean;
    /** Overall confidence score (0-1) — function of citation coverage + retrieval scores. */
    confidence: number;
  };
}

/**
 * Streaming chunk
 */
export interface StreamingChunk {
  content: string;
  isLast: boolean;
  index: number;
  totalChunks: number;
}
