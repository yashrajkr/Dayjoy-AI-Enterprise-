import { Injectable, Logger } from '@nestjs/common';
import { encode, decode } from 'gpt-tokenizer';
import { randomUUID } from 'crypto';
import {
  DEFAULT_CHUNKING_CONFIG,
  ChunkingConfig,
  ChunkMetadata,
} from './chunking-config';
import {
  LoadedDocument,
  DocumentSection,
} from '../loaders/document-loader.interface';

/**
 * Output of the chunker — one chunk of text plus its position /
 * section attribution / token count. The {@link VectorStoreService}
 * persists each Chunk as a `RagChunk` row + its embedding.
 */
export interface Chunk {
  /** Stable per-chunk UUID (assigned here, persisted as `RagChunk.id`). */
  id: string;
  /** The chunk's text content — what gets embedded and searched. */
  content: string;
  /** Token count via `gpt-tokenizer` (cl100k_base — matches GPT-4 / text-embedding-3-*). */
  tokenCount: number;
  /** 0-indexed position of this chunk within the document. */
  position: number;
  /** Heading text of the section this chunk belongs to (loader-detected). */
  section?: string;
  /** Heading level of the section this chunk belongs to. */
  sectionLevel?: number;
  /** Page number (PDF/DOCX) when extractable. */
  pageNumber?: number;
  /** Per-chunk metadata persisted on `RagChunk.metadata`. */
  metadata: {
    documentId: string;
    tenantId: string;
    source: string;
    category?: string;
    tags?: string[];
    pageNumber?: number;
    [key: string]: unknown;
  };
}

/**
 * Chunking Service
 * -----------------
 *
 * Splits a {@link LoadedDocument} into embedding-friendly chunks using
 * one of three strategies, picked based on the document's structure:
 *
 *  1. **Hierarchical chunking** — when the loader detected `sections`
 *     with non-empty headings, each section becomes a chunk. Sections
 *     larger than `maxChunkSize` are split at sentence boundaries.
 *  2. **Paragraph-based chunking** (default) — split on `\n\n`,
 *     accumulate paragraphs into chunks until `chunkSize` is reached,
 *     then start a new chunk with `chunkOverlap` tokens carried over.
 *  3. **Sentence-based chunking** (fallback) — for documents with no
 *     paragraph structure (single block of text), split at sentence
 *     boundaries with overlap.
 *
 * After the primary split, post-processing merges under-sized chunks
 * and splits over-sized ones so every emitted chunk falls within
 * `[minChunkSize, maxChunkSize]` (with the caveat that a single
 * sentence / paragraph larger than `maxChunkSize` is hard-split — there
 * is no other way to fit it under a token cap).
 */
@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  /**
   * Default constructor — uses {@link DEFAULT_CHUNKING_CONFIG}. A
   * config can be supplied per call via {@link chunk}(doc, config) for
   * document-type-specific tuning, but most callers will use the
   * default.
   */
  constructor() {}

  /**
   * Chunk a loaded document. Picks the strategy based on whether the
   * loader detected section structure.
   *
   * @param document Loader output (text + sections + metadata).
   * @param config   Optional override of the default chunking config.
   * @returns        Ordered list of chunks (position 0..N-1).
   */
  chunk(document: LoadedDocument, config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG): Chunk[] {
    const docConfig = this.getConfigForDocumentType(document.metadata.mimeType, config);
    this.logger.log(
      `Chunking document "${document.metadata.filename}" ` +
        `(${document.metadata.wordCount} words, ${document.sections.length} sections) ` +
        `→ strategy=${this.pickStrategy(document, docConfig)}`,
    );

    let rawChunks: Chunk[];
    if (docConfig.preserveHeadings && document.sections.length > 0) {
      rawChunks = this.chunkBySections(document, docConfig);
    } else if (docConfig.splitByParagraph) {
      rawChunks = this.chunkByParagraphs(document, docConfig);
    } else {
      rawChunks = this.chunkBySentences(document, docConfig);
    }

    // Post-processing: enforce [min, max] bounds + add overlap.
    const merged = this.mergeSmallChunks(rawChunks, docConfig.minChunkSize, docConfig);
    const split = this.splitOversizedChunks(merged, docConfig.maxChunkSize);
    const withOverlap = docConfig.chunkOverlap > 0
      ? this.addOverlap(split, docConfig.chunkOverlap)
      : split;

    // Re-assign positions (post-processing may have changed the order / count).
    withOverlap.forEach((c, i) => {
      c.position = i;
      c.tokenCount = this.countTokens(c.content);
    });

    this.logger.log(`Produced ${withOverlap.length} chunks for "${document.metadata.filename}"`);
    return withOverlap;
  }

  /**
   * Token-aware chunking of an arbitrary text — the building block
   * used internally by all three strategies. Splits at the
   * `maxTokens` boundary, keeping sentences intact where possible.
   *
   * Exposed publicly so the {@link IngestionService} can chunk raw
   * content (e.g. a fetched URL body) without going through a loader.
   */
  chunkByTokens(
    text: string,
    maxTokens: number = DEFAULT_CHUNKING_CONFIG.chunkSize,
    overlap: number = DEFAULT_CHUNKING_CONFIG.chunkOverlap,
  ): string[] {
    if (!text.trim()) return [];

    // Fast path: text fits in one chunk.
    if (this.countTokens(text) <= maxTokens) return [text.trim()];

    const sentences = this.splitIntoSentences(text);
    const chunks: string[] = [];
    let current = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);
      // If a single sentence exceeds maxTokens, hard-split it by tokens.
      if (sentenceTokens > maxTokens) {
        if (current.trim()) {
          chunks.push(current.trim());
          current = '';
          currentTokens = 0;
        }
        const pieces = this.hardSplitByTokens(sentence, maxTokens, overlap);
        chunks.push(...pieces);
        continue;
      }

      if (currentTokens + sentenceTokens > maxTokens && current.trim()) {
        chunks.push(current.trim());
        if (overlap > 0) {
          const overlapText = this.takeTrailingTokens(current, overlap);
          current = overlapText + ' ' + sentence;
          currentTokens = this.countTokens(current);
        } else {
          current = sentence;
          currentTokens = sentenceTokens;
        }
      } else {
        current = current ? `${current} ${sentence}` : sentence;
        currentTokens += sentenceTokens;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  /**
   * Merge adjacent chunks whose token count is below `minSize`. The
   * merge is greedy and stops when the merged chunk would exceed
   * `config.maxChunkSize` (to avoid creating a chunk that violates the
   * hard ceiling).
   */
  mergeSmallChunks(chunks: Chunk[], minSize: number, config: ChunkingConfig): Chunk[] {
    if (chunks.length === 0) return [];
    const result: Chunk[] = [{ ...chunks[0] }];

    for (let i = 1; i < chunks.length; i++) {
      const prev = result[result.length - 1];
      const curr = chunks[i];
      const mergedTokens = prev.tokenCount + curr.tokenCount + 1; // +1 for the joiner
      if (
        prev.tokenCount < minSize &&
        mergedTokens <= config.maxChunkSize
      ) {
        // Merge.
        prev.content = `${prev.content}\n\n${curr.content}`;
        prev.tokenCount = mergedTokens;
        if (!prev.section && curr.section) {
          prev.section = curr.section;
          prev.sectionLevel = curr.sectionLevel;
        }
      } else {
        result.push({ ...curr });
      }
    }
    return result;
  }

  /**
   * Split any chunk whose token count exceeds `maxSize` at sentence
   * boundaries. Falls back to a hard token-split for paragraphs that
   * contain a single over-long sentence.
   */
  splitLargeChunk(chunk: Chunk, maxSize: number): Chunk[] {
    if (chunk.tokenCount <= maxSize) return [chunk];

    const pieces = this.chunkByTokens(chunk.content, maxSize, 0);
    return pieces.map((content, i) => ({
      id: randomUUID(),
      content,
      tokenCount: this.countTokens(content),
      position: chunk.position + i,
      section: chunk.section,
      sectionLevel: chunk.sectionLevel,
      pageNumber: chunk.pageNumber,
      metadata: { ...chunk.metadata },
    }));
  }

  /**
   * Add `overlapSize` tokens of trailing context from each chunk to
   * the start of the next chunk. Operates on the chunk list (not the
   * raw text) so per-chunk metadata (section, pageNumber, ...) is
   * preserved.
   */
  addOverlap(chunks: Chunk[], overlapSize: number): Chunk[] {
    if (overlapSize <= 0 || chunks.length <= 1) return chunks;

    const result: Chunk[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const curr = chunks[i];
      const overlapText = this.takeTrailingTokens(prev.content, overlapSize);
      if (overlapText && !curr.content.startsWith(overlapText)) {
        const newContent = `${overlapText} ${curr.content}`;
        result.push({
          ...curr,
          content: newContent,
          tokenCount: this.countTokens(newContent),
        });
      } else {
        result.push(curr);
      }
    }
    return result;
  }

  // ===================================================================
  // Strategy implementations
  // ===================================================================

  private pickStrategy(doc: LoadedDocument, config: ChunkingConfig): string {
    if (config.preserveHeadings && doc.sections.length > 0) return 'hierarchical';
    if (config.splitByParagraph) return 'paragraph';
    return 'sentence';
  }

  /**
   * Hierarchical chunking — one chunk per loader-detected section.
   * Sections larger than `maxChunkSize` are sub-split at sentence
   * boundaries (each sub-chunk inherits the section heading).
   */
  private chunkBySections(doc: LoadedDocument, config: ChunkingConfig): Chunk[] {
    const chunks: Chunk[] = [];
    let position = 0;

    for (const section of doc.sections) {
      const sectionTokens = this.countTokens(section.content);
      if (sectionTokens <= config.maxChunkSize) {
        chunks.push(this.makeChunk(section, section.content, position++, doc));
      } else {
        // Sub-split the section at sentence boundaries.
        const pieces = this.chunkByTokens(section.content, config.chunkSize, config.chunkOverlap);
        for (const piece of pieces) {
          chunks.push(this.makeChunk(section, piece, position++, doc));
        }
      }
    }
    return chunks;
  }

  /**
   * Paragraph-based chunking — split on `\n\n`, accumulate paragraphs
   * until `chunkSize` is reached. Falls back to sentence-splitting
   * for paragraphs larger than `chunkSize`.
   */
  private chunkByParagraphs(doc: LoadedDocument, config: ChunkingConfig): Chunk[] {
    const chunks: Chunk[] = [];
    const paragraphs = doc.text.split(/\n\s*\n+/).filter((p) => p.trim());

    let current = '';
    let currentTokens = 0;
    let position = 0;
    let currentSection: DocumentSection | undefined;

    for (const para of paragraphs) {
      // Track which section this paragraph belongs to (for metadata).
      currentSection = this.findSectionForParagraph(doc.sections, para, currentSection);

      const paraTokens = this.countTokens(para);
      if (paraTokens > config.maxChunkSize) {
        // Flush current first, then split the over-sized paragraph.
        if (current.trim()) {
          chunks.push(this.makeChunk(currentSection, current.trim(), position++, doc));
          current = '';
          currentTokens = 0;
        }
        const pieces = this.chunkByTokens(para, config.chunkSize, config.chunkOverlap);
        for (const piece of pieces) {
          chunks.push(this.makeChunk(currentSection, piece, position++, doc));
        }
        continue;
      }

      if (currentTokens + paraTokens > config.chunkSize && current.trim()) {
        chunks.push(this.makeChunk(currentSection, current.trim(), position++, doc));
        current = para;
        currentTokens = paraTokens;
      } else {
        current = current ? `${current}\n\n${para}` : para;
        currentTokens += paraTokens;
      }
    }
    if (current.trim()) {
      chunks.push(this.makeChunk(currentSection, current.trim(), position++, doc));
    }
    return chunks;
  }

  /**
   * Sentence-based fallback — for documents with no paragraph structure
   * (single long block of text). Splits at sentence boundaries with
   * overlap.
   */
  private chunkBySentences(doc: LoadedDocument, config: ChunkingConfig): Chunk[] {
    const pieces = this.chunkByTokens(doc.text, config.chunkSize, config.chunkOverlap);
    return pieces.map((content, i) => this.makeChunk(undefined, content, i, doc));
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  private makeChunk(
    section: DocumentSection | undefined,
    content: string,
    position: number,
    doc: LoadedDocument,
  ): Chunk {
    return {
      id: randomUUID(),
      content,
      tokenCount: this.countTokens(content),
      position,
      section: section?.heading,
      sectionLevel: section?.level,
      pageNumber: section?.page,
      metadata: {
        documentId: '', // populated by IngestionService after RagDocument is created
        tenantId: doc.metadata.tenantId,
        source: doc.metadata.source,
        category: doc.metadata.category,
        tags: doc.metadata.tags,
        pageNumber: section?.page,
        documentTitle: doc.metadata.title ?? doc.metadata.filename,
        documentType: this.documentTypeFromMime(doc.metadata.mimeType),
      },
    };
  }

  private findSectionForParagraph(
    sections: DocumentSection[],
    paragraph: string,
    fallback: DocumentSection | undefined,
  ): DocumentSection | undefined {
    if (sections.length === 0) return undefined;
    // The paragraph is part of the section whose content contains this paragraph.
    // Walk from the last match backward — sections accumulate, so the most-recent
    // section that contains the paragraph is the right one.
    for (let i = sections.length - 1; i >= 0; i--) {
      if (sections[i].content.includes(paragraph.trim())) {
        return sections[i];
      }
    }
    return fallback;
  }

  private splitOversizedChunks(chunks: Chunk[], maxSize: number): Chunk[] {
    const result: Chunk[] = [];
    for (const chunk of chunks) {
      const split = this.splitLargeChunk(chunk, maxSize);
      result.push(...split);
    }
    return result;
  }

  /**
   * Sentence splitter — handles `.`, `!`, `?` followed by whitespace,
   * preserving common abbreviations (`Mr.`, `Dr.`, `e.g.`, `i.e.`).
   */
  private splitIntoSentences(text: string): string[] {
    if (!text) return [];
    // Negative-lookahead for common abbreviations.
    const matches = text.match(
      /[^.!?]+(?:\.(?!\s*(?:[A-Z]\s|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\b)[^.!?]*|[!?]+)*[.!?]+/g,
    );
    if (!matches) return [text];
    return matches.map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Hard-split a long text by exact token count. Used as a last-resort
   * fallback when sentence splitting can't keep a chunk under
   * `maxTokens` (e.g. a single 4000-token sentence with no internal
   * punctuation).
   */
  private hardSplitByTokens(text: string, maxTokens: number, overlap: number): string[] {
    const tokens = encode(text);
    const pieces: string[] = [];
    const step = Math.max(1, maxTokens - overlap);
    for (let i = 0; i < tokens.length; i += step) {
      const slice = tokens.slice(i, i + maxTokens);
      pieces.push(decode(slice));
    }
    return pieces;
  }

  /**
   * Extract the trailing `n` tokens of `text` as a string. Used for
   * chunk overlap — the tail of one chunk becomes the prefix of the
   * next so context spans the boundary.
   */
  private takeTrailingTokens(text: string, n: number): string {
    const tokens = encode(text);
    if (tokens.length <= n) return text;
    return decode(tokens.slice(tokens.length - n)).trim();
  }

  /**
   * Token counter — uses `gpt-tokenizer`'s cl100k_base encoding
   * (matches GPT-4 / `text-embedding-3-*`). Cheap enough for inline
   * use; for very large documents the chunker caches counts on the
   * emitted `Chunk` objects.
   */
  countTokens(text: string): number {
    if (!text) return 0;
    try {
      return encode(text).length;
    } catch (err) {
      this.logger.debug(`token count fallback: ${(err as Error).message}`);
      // Fallback heuristic: 1 token ≈ 4 chars.
      return Math.ceil(text.length / 4);
    }
  }

  private getConfigForDocumentType(
    mimeType: string,
    base: ChunkingConfig,
  ): ChunkingConfig {
    const type = this.documentTypeFromMime(mimeType);
    return base.byDocumentType[type as keyof typeof base.byDocumentType] ?? base;
  }

  private documentTypeFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/markdown': 'markdown',
      'text/x-markdown': 'markdown',
      'text/plain': 'text',
      'text/csv': 'csv',
      'text/html': 'html',
      'application/xhtml+xml': 'html',
    };
    return map[mimeType?.split(';')[0].trim().toLowerCase()] ?? 'text';
  }
}

/**
 * Build a {@link ChunkMetadata} object from a {@link Chunk}. Used by
 * the {@link VectorStoreService} when persisting — kept here so the
 * metadata shape stays co-located with the chunker that produces it.
 */
export function buildChunkMetadata(chunk: Chunk, totalChunks: number): ChunkMetadata {
  return {
    documentId: chunk.metadata.documentId,
    documentTitle: (chunk.metadata.documentTitle as string) ?? '',
    documentType: (chunk.metadata.documentType as string) ?? 'text',
    chunkIndex: chunk.position,
    totalChunks,
    heading: chunk.section,
    headingLevel: chunk.sectionLevel,
    section: chunk.section,
    sectionLevel: chunk.sectionLevel,
    paragraphIndex: undefined,
    pageNumber: chunk.pageNumber,
    tokenCount: chunk.tokenCount,
    language: 'en',
    hasCode: /```|function|class|import|from/.test(chunk.content),
    hasTable: /\|\s*[\w\s]+\s*\|/.test(chunk.content),
    hasList: /^[\s]*[-*•]\s+/m.test(chunk.content),
    source: chunk.metadata.source,
    tenantId: chunk.metadata.tenantId,
    category: chunk.metadata.category,
    tags: chunk.metadata.tags,
    custom: {},
  };
}
