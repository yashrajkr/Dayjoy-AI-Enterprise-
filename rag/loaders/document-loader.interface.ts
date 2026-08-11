/**
 * Document Loader Interfaces
 * ===========================
 *
 * Contract for the format-specific document loaders that turn raw file bytes
 * (PDF, DOCX, Markdown, plain text, CSV, HTML) into a normalised
 * {@link LoadedDocument} that the {@link ChunkingService} can split into
 * chunks and the {@link IngestionService} can persist.
 *
 * Design notes
 * ------------
 * - Loaders are pure transformations: bytes → text + sections + metadata.
 *   They never touch the database or the OpenAI API.
 * - The `sections` field carries the document's heading hierarchy (H1/H2/H3
 *   for markdown, font-size heuristics for PDF, `<h1>`/`<h2>` for HTML).
 *   The chunker uses it for hierarchical chunking (one chunk per section)
 *   so citations can carry a `section` breadcrumb.
 * - All loaders are `@Injectable()` NestJS providers, registered in
 *   {@link LoadersModule} and resolved by {@link DocumentLoaderFactory}
 *   based on the supplied MIME type.
 */

/**
 * Where the document came from. Persisted on `RagSource.type` so the
 * admin UI can bucket knowledge-base contributions by origin.
 */
export type DocumentSource = 'upload' | 'url' | 'sitemap' | 'manual';

/**
 * Caller-supplied metadata attached to every load request. The loader
 * echoes it back on the returned {@link LoadedDocument} (plus whatever
 * format-specific metadata it was able to extract — page count, title,
 * author, etc.).
 */
export interface DocumentMetadata {
  /** Original filename including extension (used for storage + display). */
  filename: string;
  /** Canonical MIME type — drives loader selection in the factory. */
  mimeType: string;
  /** Origin of the document: file upload, fetched URL, sitemap crawl, etc. */
  source: DocumentSource;
  /** Tenant that owns the document (multi-tenant isolation). */
  tenantId: string;
  /** User ID of the uploader (audit trail on `RagDocument`). */
  uploadedBy: string;
  /** Optional category bucket — surfaces in the admin UI + as a search filter. */
  category?: string;
  /** Optional free-form tags for faceted search. */
  tags?: string[];
}

/**
 * Loader output: the extracted text + structural sections + metadata.
 *
 * `metadata` is a superset of {@link DocumentMetadata} — the loader
 * augments the caller-supplied metadata with whatever it was able to
 * extract from the file itself (page count, word count, title, author,
 * creation date, detected language, ...).
 */
export interface LoadedDocument {
  /** The full extracted text, suitable for chunking + embedding. */
  text: string;
  /** Caller metadata + format-specific extracted metadata. */
  metadata: LoadedDocumentMetadata;
  /**
   * Hierarchical sections detected by the loader. Empty if the loader
   * could not detect a section structure (e.g. plain text without
   * headings). The chunker uses these for hierarchical chunking.
   */
  sections: DocumentSection[];
}

export interface LoadedDocumentMetadata extends DocumentMetadata {
  /** PDF / DOCX page count (when extractable). */
  pageCount?: number;
  /** Word count — populated for every loader. */
  wordCount: number;
  /** Character count — populated for every loader. */
  charCount: number;
  /** Detected ISO language code (e.g. `en`, `hi`). Defaults to `en`. */
  language?: string;
  /** Document title extracted from metadata, `<title>`, or first heading. */
  title?: string;
  /** Document author extracted from PDF/DOCX metadata. */
  author?: string;
  /** Document creation date extracted from PDF/DOCX metadata. */
  createdAt?: Date;
}

/**
 * A semantically-bounded section of the document. The chunker treats
 * each section as a candidate chunk (splitting further if the section
 * exceeds the max chunk size).
 */
export interface DocumentSection {
  /** Heading text (without the leading `#` markers for markdown). */
  heading: string;
  /**
   * Heading level: 1 = H1, 2 = H2, 3 = H3, etc.
   * Level 0 is used for "no heading detected" (e.g. document preamble).
   */
  level: number;
  /** Full text of the section (heading + body). */
  content: string;
  /** Page number when extractable (PDF, DOCX). */
  page?: number;
}

/**
 * Contract every loader implements. Pure synchronous-ish transform;
 * network/database access lives elsewhere.
 */
export interface DocumentLoader {
  load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument>;
}
