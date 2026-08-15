/**
 * Chunking Strategy Configuration
 * ================================
 *
 * Drives the {@link ChunkingService}'s default behaviour. Values are
 * expressed in TOKENS (not characters) — token-aware chunking is
 * important because OpenAI's embedding + chat models bill and bound
 * context in tokens, not characters. A 1000-char English chunk is
 * ~250 tokens, but a 1000-char CJK chunk is ~700 tokens, so
 * character-based limits leak silently across languages.
 *
 * Why these specific values
 * -------------------------
 * - **chunkSize = 1000 tokens**: OpenAI's published sweet-spot for
 *   `text-embedding-3-small`/`text-embedding-3-large`. Smaller chunks
 *   (e.g. 256) lose surrounding context; larger chunks (e.g. 4096)
 *   dilute per-chunk relevance and waste context tokens in the LLM
 *   prompt.
 * - **chunkOverlap = 200 tokens**: 20% of chunk size. Prevents the
 *   chunker from cutting a sentence / list item at the boundary and
 *   losing its referent (e.g. "the second item above" landing in the
 *   previous chunk).
 * - **minChunkSize = 100**: Anything smaller lacks enough context to
 *   embed meaningfully (a 30-token chunk like "See section 4.2" embeds
 *   as noise). Below this threshold the chunker merges with a neighbor.
 * - **maxChunkSize = 2000**: Hard ceiling to prevent a single
 *   pathological paragraph (rare but seen in legal contracts and
 *   scraped tables) from blowing past the embedding model's 8191-token
 *   input limit AND the LLM's prompt-token budget.
 * - **splitByParagraph = true**: Prefer paragraph boundaries (`\n\n`)
 *   over fixed-size sliding windows — yields cleaner chunks that don't
 *   cut sentences mid-way.
 * - **splitBySentence = true**: When a paragraph is larger than
 *   `chunkSize`, split it at sentence boundaries (`.`, `!`, `?`)
 *   rather than mid-word.
 * - **preserveHeadings = true**: When the loader detected section
 *   structure, emit one chunk per section (with the heading as
 *   metadata) so citations carry a `section` breadcrumb.
 */

/**
 * Shape shared by the top-level defaults and each per-document-type
 * override. Deliberately excludes `byDocumentType` itself — a
 * self-referential `ChunkingConfig` here would require every override to
 * carry its own (infinitely recursive) set of overrides.
 */
export interface BaseChunkingConfig {
  // Token-based chunking
  chunkSize: number; // Target tokens per chunk
  chunkOverlap: number; // Overlap tokens between adjacent chunks

  // Minimum/maximum bounds
  minChunkSize: number; // Merge chunks smaller than this with a neighbor
  maxChunkSize: number; // Hard split ceiling — chunks larger than this are split

  // Semantic boundary preferences
  splitByParagraph: boolean; // Break at \n\n when possible
  splitBySentence: boolean; // When forced to split mid-paragraph, break at sentence boundaries
  preserveHeadings: boolean; // Use the loader's section structure for hierarchical chunking
}

export interface ChunkingConfig extends BaseChunkingConfig {
  // Document type specific overrides (same shape, indexed by document type).
  byDocumentType: {
    pdf: BaseChunkingConfig;
    docx: BaseChunkingConfig;
    html: BaseChunkingConfig;
    markdown: BaseChunkingConfig;
    text: BaseChunkingConfig;
    csv: BaseChunkingConfig;
  };
}

/**
 * Default chunking configuration optimised for:
 * - OpenAI text-embedding-3-small (1536 dimensions, 8191 token input limit)
 * - GPT-4o / GPT-4 Turbo context windows
 * - pgvector cosine-similarity search (HNSW index)
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 1000, // ~1000 tokens — OpenAI's recommended chunk size
  chunkOverlap: 200, // 20% overlap — preserves context at boundaries
  minChunkSize: 100, // Merge below 100 tokens (too sparse to embed well)
  maxChunkSize: 2000, // Hard ceiling — prevents over-sized chunks

  splitByParagraph: true, // Prefer paragraph boundaries (\n\n)
  splitBySentence: true, // Fall back to sentence boundaries for over-sized paragraphs
  preserveHeadings: true, // Honour the loader's section structure

  byDocumentType: {
    pdf: {
      chunkSize: 1000,
      chunkOverlap: 200,
      minChunkSize: 100,
      maxChunkSize: 2000,
      splitByParagraph: true,
      splitBySentence: true,
      preserveHeadings: true,
    },
    docx: {
      chunkSize: 1000,
      chunkOverlap: 200,
      minChunkSize: 100,
      maxChunkSize: 2000,
      splitByParagraph: true,
      splitBySentence: true,
      preserveHeadings: true,
    },
    html: {
      // HTML extraction yields noisier text (lists, tables, captions);
      // slightly smaller chunks keep each chunk on a single topic.
      chunkSize: 800,
      chunkOverlap: 160,
      minChunkSize: 80,
      maxChunkSize: 1600,
      splitByParagraph: true,
      splitBySentence: true,
      preserveHeadings: true,
    },
    markdown: {
      chunkSize: 1000,
      chunkOverlap: 200,
      minChunkSize: 100,
      maxChunkSize: 2000,
      splitByParagraph: true,
      splitBySentence: true,
      preserveHeadings: true,
    },
    text: {
      chunkSize: 1000,
      chunkOverlap: 200,
      minChunkSize: 100,
      maxChunkSize: 2000,
      splitByParagraph: true,
      splitBySentence: true,
      preserveHeadings: false, // Plain text has no heading structure
    },
    csv: {
      // One row per chunk — CSV rows are semantically atomic.
      // Use a small chunkSize so rows are never merged.
      chunkSize: 400,
      chunkOverlap: 0,
      minChunkSize: 10,
      maxChunkSize: 1000,
      splitByParagraph: false, // Row delimiter is `\n\n` from the loader, not paragraph break
      splitBySentence: false,
      preserveHeadings: false,
    },
  },
};

/**
 * Per-chunk metadata persisted on `RagChunk.metadata` (JSON column) and
 * surfaced in retrieval results so the LLM prompt can include a
 * `section` breadcrumb for each cited chunk.
 */
export interface ChunkMetadata {
  // Document hierarchy
  documentId: string;
  documentTitle: string;
  documentType: string;

  // Chunk position
  chunkIndex: number;
  totalChunks: number;

  // Content structure (from the loader's section detection)
  heading?: string;
  headingLevel?: number;
  section?: string;
  sectionLevel?: number;
  paragraphIndex?: number;
  pageNumber?: number;

  // Token information
  tokenCount: number;
  startOffset?: number;
  endOffset?: number;

  // Source attribution
  source: string; // 'upload' | 'url' | 'sitemap' | 'manual'
  tenantId: string;
  category?: string;
  tags?: string[];

  // Content characteristics (used for filtering at retrieval time)
  language?: string;
  hasCode?: boolean;
  hasTable?: boolean;
  hasList?: boolean;

  // Custom metadata pass-through from the loader.
  custom?: Record<string, unknown>;
}

export const DEFAULT_CHUNK_METADATA: Partial<ChunkMetadata> = {
  heading: undefined,
  headingLevel: undefined,
  section: undefined,
  sectionLevel: undefined,
  paragraphIndex: undefined,
  pageNumber: undefined,
  startOffset: undefined,
  endOffset: undefined,
  language: 'en',
  hasCode: false,
  hasTable: false,
  hasList: false,
  custom: {},
};
