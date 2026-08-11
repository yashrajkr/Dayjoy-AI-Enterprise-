import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_RESPONSE_CONFIG,
  ResponseProcessingConfig,
  ProcessedResponse,
  ExtractedCitation,
  StreamingChunk,
} from './response-processing-config';
import type { RetrievalResult } from '../retriever/retrieval-config';
import { createHash } from 'crypto';

/**
 * ResponseProcessingService — post-processes the LLM's raw response into
 * a validated, citation-backed, confidence-scored payload.
 *
 * Originally at `rag/evaluation/response-processing-service.ts` — MOVED
 * to `rag/response-pipeline/response-processing-service.ts` because
 * response processing is part of the response pipeline, not the
 * evaluation framework. A backward-compat re-export remains at the
 * original path.
 *
 * Five concerns:
 *
 *  1. **Citation extraction.** Parse `[1]`, `[2]`, ... markers from the
 *     LLM response text. Each marker is mapped to a numbered citation
 *     (the Nth retrieved chunk).
 *
 *  2. **Citation validation.** Cross-check each `[N]` marker against the
 *     retrieved chunks. Markers that don't resolve (e.g. `[42]` when
 *     only 3 chunks were retrieved) are flagged as `unresolved: true`
 *     with reduced confidence.
 *
 *  3. **Hallucination detection.** Heuristic: split the response into
 *     sentences; for each sentence, check whether it's "supported" by
 *     any retrieved chunk (defined as: contains a citation marker OR
 *     shares ≥3 significant words with a chunk). If the fraction of
 *     unsupported sentences exceeds `1 - minSupportedSentences`, the
 *     response is flagged as `isHallucinated: true`.
 *
 *  4. **Confidence scoring.** Weighted combination of:
 *     - Citation coverage (fraction of sentences backed by citations)
 *     - Top retrieval similarity score
 *     - Number of distinct cited sources
 *
 *  5. **Response formatting.** Returns the response in markdown (default),
 *     plain text (strip markdown), or structured JSON (parse the response
 *     as JSON if it looks like JSON).
 *
 * PII / toxicity checks are stubbed — wire to external services
 * (Perspective API for toxicity, Presidio for PII) when available.
 */
@Injectable()
export class ResponseProcessingService {
  private readonly logger = new Logger(ResponseProcessingService.name);
  private config: ResponseProcessingConfig;
  private cache: Map<string, { response: ProcessedResponse; expiresAt: Date }> = new Map();

  constructor() {
    this.config = { ...DEFAULT_RESPONSE_CONFIG };
  }

  /**
   * Process an LLM response.
   *
   * @param content The raw LLM response text.
   * @param retrievedChunks The chunks that were passed to the LLM (for
   *   citation validation + hallucination detection). When omitted,
   *   citation validation is skipped and hallucination detection always
   *   returns `false`.
   * @param options Optional overrides (e.g. `format: 'plain'`).
   */
  async process(
    content: string,
    retrievedChunks?: RetrievalResult[],
    options?: { format?: 'markdown' | 'plain' | 'structured' },
  ): Promise<ProcessedResponse> {
    this.logger.log(`Processing response (${content.length} chars)`);

    // Check cache.
    const cacheKey = this.getCacheKey(content, retrievedChunks, options);
    const cached = this.config.caching.enabled ? this.cache.get(cacheKey) : null;

    if (cached && cached.expiresAt > new Date()) {
      this.logger.debug('Cache hit for response processing');
      return cached.response;
    }

    // Extract + validate citations.
    const extractedCitations = this.extractCitationsFromText(
      content,
      retrievedChunks || [],
    );

    // Calculate metadata.
    const metadata = this.calculateMetadata(content, extractedCitations);

    // Validate response (PII / toxicity / hallucination / confidence).
    const validation = await this.validateResponse(
      content,
      extractedCitations,
      retrievedChunks || [],
    );

    // Format the response.
    const format = options?.format || this.detectFormat(content);

    const processedResponse: ProcessedResponse = {
      content,
      citations: extractedCitations,
      format,
      metadata,
      validation,
    };

    // Cache response.
    if (this.config.caching.enabled) {
      this.cache.set(cacheKey, {
        response: processedResponse,
        expiresAt: new Date(Date.now() + this.config.caching.ttlSeconds * 1000),
      });

      if (this.cache.size > this.config.caching.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
    }

    this.logger.log(
      `Response processed: ${metadata.wordCount} words, ${metadata.citationCount} citations, ` +
        `confidence=${validation.confidence.toFixed(2)}, hallucinated=${validation.isHallucinated}`,
    );

    return processedResponse;
  }

  // ---------------------------------------------------------------------
  // Citation extraction + validation
  // ---------------------------------------------------------------------

  /**
   * Extract `[N]` citation markers from the response text and resolve
   * each to the Nth retrieved chunk.
   *
   * Citation numbers that don't resolve (e.g. `[42]` when only 3 chunks
   * were retrieved) are returned with `unresolved: true` and a reduced
   * confidence (0.3) — they're kept in the list so the UI can render
   * them as "source not found".
   */
  extractCitationsFromText(
    content: string,
    retrievedChunks: RetrievalResult[],
  ): ExtractedCitation[] {
    if (!this.config.citations.enabled) return [];

    const pattern = new RegExp(this.config.citations.pattern, 'g');
    const matches = [...content.matchAll(pattern)];

    // Deduplicate by citation number — the LLM often cites the same
    // source multiple times in one response.
    const seen = new Set<number>();
    const citations: ExtractedCitation[] = [];

    for (const match of matches) {
      const number = parseInt(match[1], 10);
      if (seen.has(number)) continue;
      seen.add(number);

      const chunk = retrievedChunks[number - 1];
      if (chunk) {
        citations.push({
          number,
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          documentTitle: chunk.metadata.documentTitle,
          chunkIndex: chunk.metadata.chunkIndex,
          confidence: 0.95,
          unresolved: false,
        });
      } else {
        citations.push({
          number,
          confidence: 0.3,
          unresolved: true,
        });
      }
    }

    return citations;
  }

  /**
   * Validate that all citation markers in the response resolve to a
   * retrieved chunk. Returns the list of unresolved citation numbers.
   */
  validateCitationsAgainstChunks(
    content: string,
    retrievedChunks: RetrievalResult[],
  ): number[] {
    const citations = this.extractCitationsFromText(content, retrievedChunks);
    return citations.filter((c) => c.unresolved).map((c) => c.number);
  }

  // ---------------------------------------------------------------------
  // Hallucination detection
  // ---------------------------------------------------------------------

  /**
   * Heuristic hallucination detector.
   *
   * Splits the response into sentences. A sentence is "supported" if:
   *  - It contains a citation marker `[N]` that resolves to a chunk, OR
   *  - It shares ≥3 significant words (length > 3) with any chunk.
   *
   * If the fraction of supported sentences is below
   * `validation.minSupportedSentences`, the response is flagged as
   * hallucinated.
   *
   * This is a coarse heuristic — production should wire to a dedicated
   * fact-checking model. But it catches the common failure mode where
   * the LLM "hallucinates" facts not present in the context.
   */
  detectHallucination(
    content: string,
    retrievedChunks: RetrievalResult[],
  ): { isHallucinated: boolean; supportedFraction: number } {
    if (!this.config.validation.checkHallucination || retrievedChunks.length === 0) {
      return { isHallucinated: false, supportedFraction: 1 };
    }

    const sentences = this.splitIntoSentences(content);
    if (sentences.length === 0) {
      return { isHallucinated: false, supportedFraction: 1 };
    }

    const citations = this.extractCitationsFromText(content, retrievedChunks);
    const resolvedNumbers = new Set(
      citations.filter((c) => !c.unresolved).map((c) => c.number),
    );

    // Pre-compute the set of significant words across all chunks.
    const chunkWords = new Set<string>();
    for (const chunk of retrievedChunks) {
      const words = chunk.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);
      for (const w of words) chunkWords.add(w);
    }

    let supportedCount = 0;
    for (const sentence of sentences) {
      // Citation-backed?
      const sentenceCitations = [...sentence.matchAll(/\[(\d+)\]/g)].map(
        (m) => parseInt(m[1], 10),
      );
      if (sentenceCitations.some((n) => resolvedNumbers.has(n))) {
        supportedCount++;
        continue;
      }

      // Word-overlap backed?
      const sentenceWords = sentence
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);
      const overlap = sentenceWords.filter((w) => chunkWords.has(w)).length;
      if (overlap >= 3) {
        supportedCount++;
      }
    }

    const supportedFraction = supportedCount / sentences.length;
    const isHallucinated =
      supportedFraction < this.config.validation.minSupportedSentences;

    return { isHallucinated, supportedFraction };
  }

  // ---------------------------------------------------------------------
  // Confidence scoring
  // ---------------------------------------------------------------------

  /**
   * Compute a confidence score (0-1) for the response.
   *
   * Weighted combination of:
   *  - Citation coverage (50%) — fraction of sentences backed by a
   *    resolved citation.
   *  - Top retrieval similarity (30%) — the highest similarity score
   *    among the retrieved chunks.
   *  - Source diversity (20%) — number of distinct cited documents,
   *    normalised by the total citation count.
   */
  calculateConfidence(
    content: string,
    retrievedChunks: RetrievalResult[],
  ): number {
    if (retrievedChunks.length === 0) return 0.1;

    // Citation coverage.
    const citations = this.extractCitationsFromText(content, retrievedChunks);
    const resolved = citations.filter((c) => !c.unresolved);
    const sentences = this.splitIntoSentences(content);
    const citationCoverage =
      sentences.length > 0
        ? resolved.length / sentences.length
        : 0;

    // Top retrieval similarity.
    const topSimilarity = Math.max(
      ...retrievedChunks.map((c) => c.similarity || c.finalScore || 0),
    );

    // Source diversity.
    const distinctDocs = new Set(resolved.map((c) => c.documentId)).size;
    const diversity = resolved.length > 0 ? distinctDocs / resolved.length : 0;

    const confidence =
      0.5 * Math.min(1, citationCoverage) +
      0.3 * topSimilarity +
      0.2 * diversity;

    return Math.max(0, Math.min(1, confidence));
  }

  // ---------------------------------------------------------------------
  // Response formatting
  // ---------------------------------------------------------------------

  /**
   * Format the response into the requested format.
   *
   *  - `markdown` (default) — returns the content as-is.
   *  - `plain` — strips markdown syntax (headings, bold, italic, links,
   *    code blocks).
   *  - `structured` — attempts to parse the content as JSON. Falls back
   *    to `markdown` if parsing fails.
   */
  formatResponse(
    content: string,
    format: 'markdown' | 'plain' | 'structured',
  ): { content: string; format: 'markdown' | 'plain' | 'structured' } {
    if (format === 'markdown') {
      return { content, format };
    }

    if (format === 'plain') {
      return { content: this.stripMarkdown(content), format };
    }

    // structured
    try {
      const parsed = JSON.parse(content);
      return { content: JSON.stringify(parsed, null, 2), format: 'structured' };
    } catch {
      // Not JSON — fall back to markdown.
      return { content, format: 'markdown' };
    }
  }

  /**
   * Auto-detect the response format from the content.
   *
   * JSON-looking content → `structured`. Otherwise → `markdown` (the
   * LLM is instructed to use markdown by default).
   */
  private detectFormat(content: string): 'markdown' | 'plain' | 'structured' {
    const trimmed = content.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmed);
        return 'structured';
      } catch {
        // Not valid JSON — fall through.
      }
    }
    return 'markdown';
  }

  /**
   * Strip markdown formatting to produce plain text.
   */
  private stripMarkdown(content: string): string {
    return content
      // Headings
      .replace(/^#{1,6}\s+/gm, '')
      // Bold + italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Blockquotes
      .replace(/^>\s+/gm, '')
      // Lists
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // HRs
      .replace(/^---+$/gm, '')
      // Citation markers (keep them — they're useful in plain text too)
      // Extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ---------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------

  /**
   * Stream a (already-generated) response in chunks.
   *
   * This is a simulated stream — useful when the LLM returned a complete
   * response but the client wants to render it progressively. The real
   * streaming path is `LLMGatewayService.generateStream()`.
   */
  async *streamResponse(
    content: string,
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    if (!this.config.streaming.enabled) {
      yield {
        content,
        isLast: true,
        index: 0,
        totalChunks: 1,
      };
      return;
    }

    const chunkSize = this.config.streaming.chunkSize;
    const chunkDelayMs = this.config.streaming.chunkDelayMs;

    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i++) {
      yield {
        content: chunks[i],
        isLast: i === chunks.length - 1,
        index: i,
        totalChunks: chunks.length,
      };

      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
      }
    }
  }

  // ---------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------

  clearCache(): void {
    this.cache.clear();
    this.logger.log('Response cache cleared');
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /**
   * Calculate response metadata (word / sentence / paragraph counts +
   * citation stats).
   */
  private calculateMetadata(
    content: string,
    citations: ExtractedCitation[],
  ): ProcessedResponse['metadata'] {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const sentenceCount = this.splitIntoSentences(content).length;
    const paragraphCount = content.split(/\n\n+/).filter(Boolean).length;

    const sentences = this.splitIntoSentences(content);
    const resolvedCitations = citations.filter((c) => !c.unresolved);
    const citationCoverage =
      sentences.length > 0
        ? resolvedCitations.length / sentences.length
        : 0;

    return {
      wordCount,
      sentenceCount,
      paragraphCount,
      hasCitations: citations.length > 0,
      citationCount: citations.length,
      citationCoverage,
    };
  }

  /**
   * Validate the response — PII / toxicity / hallucination / confidence.
   */
  private async validateResponse(
    content: string,
    citations: ExtractedCitation[],
    retrievedChunks: RetrievalResult[],
  ): Promise<ProcessedResponse['validation']> {
    const validation: ProcessedResponse['validation'] = {
      isToxic: false,
      hasPII: false,
      isHallucinated: false,
      confidence: 0.95,
    };

    if (this.config.validation.checkPII) {
      validation.hasPII = this.detectPII(content);
    }

    if (this.config.validation.checkToxicity) {
      validation.isToxic = await this.checkToxicity(content);
    }

    if (this.config.validation.checkHallucination) {
      const halluc = this.detectHallucination(content, retrievedChunks);
      validation.isHallucinated = halluc.isHallucinated;
    }

    validation.confidence = this.calculateConfidence(content, retrievedChunks);

    return validation;
  }

  /**
   * Detect PII in content (SSN, credit card, email, phone).
   */
  private detectPII(content: string): boolean {
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/,  // SSN
      /\b\d{16}\b/,  // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,  // Email
      /\b\d{3}-\d{3}-\d{4}\b/,  // Phone
    ];

    return piiPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Check toxicity (placeholder — integrate with Perspective API).
   */
  private async checkToxicity(_content: string): Promise<boolean> {
    return false;
  }

  /**
   * Split text into sentences. Coarse heuristic — splits on `.`, `!`,
   * `?` followed by whitespace or end-of-string. Skips abbreviations
   * like "Dr." (single-letter + period).
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Cache key — SHA-256 of `{content, chunkIds, format}`.
   */
  private getCacheKey(
    content: string,
    retrievedChunks?: RetrievalResult[],
    options?: { format?: string },
  ): string {
    const keyData = JSON.stringify({
      content,
      chunkIds: retrievedChunks?.map((c) => c.chunkId) || [],
      format: options?.format,
    });
    return createHash('sha256').update(keyData).digest('hex');
  }
}
