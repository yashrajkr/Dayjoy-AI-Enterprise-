import { Injectable, BadRequestException } from '@nestjs/common';
import {
  DocumentLoader,
  DocumentMetadata,
} from './document-loader.interface';
import { PdfLoader } from './pdf.loader';
import { DocxLoader } from './docx.loader';
import { MarkdownLoader } from './markdown.loader';
import { TextLoader } from './text.loader';
import { CsvLoader } from './csv.loader';
import { HtmlLoader } from './html.loader';

/**
 * Names of the (private, constructor-injected) loader properties on
 * {@link DocumentLoaderFactory}. `keyof DocumentLoaderFactory` can't be used
 * here — from outside the class, `keyof` only sees its public members
 * (`getLoader`, ...), not the private loader fields.
 */
type LoaderKey =
  | 'pdfLoader'
  | 'docxLoader'
  | 'markdownLoader'
  | 'textLoader'
  | 'csvLoader'
  | 'htmlLoader';

/**
 * MIME type → loader map. Centralised so the factory + the
 * extension-based lookup share one source of truth.
 */
const MIME_TO_LOADER: Record<string, LoaderKey> = {
  'application/pdf': 'pdfLoader',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docxLoader',
  'text/markdown': 'markdownLoader',
  'text/x-markdown': 'markdownLoader',
  'text/csv': 'csvLoader',
  'text/html': 'htmlLoader',
  'application/xhtml+xml': 'htmlLoader',
  'text/plain': 'textLoader',
  'text/plain; charset=utf-8': 'textLoader',
};

/**
 * File extension → MIME type map. Lowercased lookup.
 */
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
};

/**
 * Document Loader Factory
 * ------------------------
 *
 * Resolves a {@link DocumentLoader} implementation for a given MIME
 * type (or file extension). Used by the {@link IngestionService} to
 * pick the right loader before invoking `load(buffer, metadata)`.
 *
 * Throws `BadRequestException` for unsupported types — surfaces as a
 * 400 to the API caller (better UX than a 500 from a downstream crash).
 */
@Injectable()
export class DocumentLoaderFactory {
  constructor(
    private readonly pdfLoader: PdfLoader,
    private readonly docxLoader: DocxLoader,
    private readonly markdownLoader: MarkdownLoader,
    private readonly textLoader: TextLoader,
    private readonly csvLoader: CsvLoader,
    private readonly htmlLoader: HtmlLoader,
  ) {}

  /**
   * Resolve a loader by canonical MIME type. Accepts MIME types with
   * optional `; charset=...` suffix — the charset is ignored (loaders
   * always decode as UTF-8 or the format's native encoding).
   */
  getLoader(mimeType: string): DocumentLoader {
    if (!mimeType) {
      throw new BadRequestException('MIME type is required to select a document loader');
    }
    // Strip `; charset=...` suffix for the lookup.
    const normalized = mimeType.split(';')[0].trim().toLowerCase();
    const key = MIME_TO_LOADER[normalized] ?? MIME_TO_LOADER[mimeType.toLowerCase()];
    if (!key) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
    return this[key];
  }

  /**
   * Resolve a loader by file extension (without leading dot).
   * Useful for upload endpoints where the MIME type is missing or
   * browser-supplied and unreliable.
   */
  getLoaderByExtension(ext: string): DocumentLoader {
    if (!ext) {
      throw new BadRequestException('File extension is required to select a document loader');
    }
    const normalized = ext.toLowerCase().replace(/^\./, '');
    const mimeType = EXT_TO_MIME[normalized];
    if (!mimeType) {
      throw new BadRequestException(`Unsupported file extension: ${ext}`);
    }
    return this.getLoader(mimeType);
  }

  /**
   * Convenience: resolve a loader from either the MIME type or the
   * filename extension, whichever is more reliable. Prefer MIME type
   * when available — extension is the fallback (browsers sometimes
   * sniff wrong).
   */
  getLoaderFor(filename: string, mimeType?: string): DocumentLoader {
    if (mimeType) {
      try {
        return this.getLoader(mimeType);
      } catch {
        // fall through to extension-based lookup
      }
    }
    const ext = filename.split('.').pop() ?? '';
    return this.getLoaderByExtension(ext);
  }
}
