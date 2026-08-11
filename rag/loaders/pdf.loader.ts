import { Injectable, Logger } from '@nestjs/common';
import type pdfParse from 'pdf-parse';
import {
  DocumentLoader,
  DocumentMetadata,
  DocumentSection,
  LoadedDocument,
} from './document-loader.interface';

/**
 * PDF Document Loader
 * --------------------
 *
 * Uses `pdf-parse` to extract plain text + embedded metadata (title,
 * author, page count, creation date) from PDF files.
 *
 * `pdf-parse` does not expose heading-level structure (PDFs don't have
 * semantic headings — only font-size variations), so we use a simple
 * heuristic: blocks separated by a blank line, where the first line is
 * short and doesn't end with sentence punctuation, are treated as
 * headings (level 1 or 2 based on line length).
 *
 * The page estimate (`Math.floor(i / 3) + 1`) is a coarse approximation
 * — `pdf-parse` doesn't expose per-block page numbers without resorting
 * to a more capable engine (pdfjs-dist with text-layer coordinates).
 * Good enough for chunk metadata; the chunker falls back to "no page"
 * if the loader returns undefined.
 */
@Injectable()
export class PdfLoader implements DocumentLoader {
  private readonly logger = new Logger(PdfLoader.name);

  async load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument> {
    this.logger.debug(`Loading PDF "${metadata.filename}" (${buffer.length} bytes)`);

    // Lazy-import so the dependency is only loaded when actually needed
    // (keeps startup fast for tenants that never ingest PDFs).
    const { default: pdf } = await import('pdf-parse') as { default: typeof pdfParse };
    const data = await pdf(buffer);

    const text = (data.text ?? '').trim();
    const sections = this.extractSections(text);
    const wordCount = this.countWords(text);

    return {
      text,
      metadata: {
        ...metadata,
        pageCount: data.numpages,
        wordCount,
        charCount: text.length,
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        createdAt: this.parsePdfDate(data.info?.CreationDate),
        language: 'en',
      },
      sections,
    };
  }

  /**
   * Split the extracted text into sections by double-newline blocks.
   * Each block becomes a `DocumentSection`; the first line is treated
   * as the heading when it's short and free of sentence-ending
   * punctuation (rough proxy for PDF heading styling).
   */
  private extractSections(text: string): DocumentSection[] {
    if (!text) return [];

    const blocks = text.split(/\n\s*\n/);
    const sections: DocumentSection[] = [];

    blocks.forEach((block, i) => {
      const trimmed = block.trim();
      if (!trimmed) return;

      const firstLine = trimmed.split('\n')[0];
      const heading = firstLine.slice(0, 100);
      const level = this.detectHeadingLevel(firstLine);

      sections.push({
        heading,
        level,
        content: trimmed,
        page: Math.floor(i / 3) + 1,
      });
    });

    return sections;
  }

  /**
   * Heuristic heading-level detection.
   *
   * - Markdown-style `#`, `##` → respected (some PDFs embed markdown).
   * - ALL-CAPS short line → H1.
   * - Short line without terminal punctuation → H1.
   * - Short line with terminal punctuation → H2.
   * - Long line → body (level 0).
   */
  private detectHeadingLevel(firstLine: string): number {
    if (/^#+\s+/.test(firstLine)) {
      const match = firstLine.match(/^#+/);
      return match ? match[0].length : 1;
    }
    if (firstLine.length <= 60 && firstLine === firstLine.toUpperCase() && /[A-Z]/.test(firstLine)) {
      return 1;
    }
    if (firstLine.length < 50 && !/[.!?]$/.test(firstLine)) return 1;
    if (firstLine.length < 80) return 2;
    return 0;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  /**
   * PDF `/CreationDate` is formatted as `D:YYYYMMDDHHmmSSOHH'mm'`.
   * Returns `undefined` on malformed input rather than throwing.
   */
  private parsePdfDate(raw?: string): Date | undefined {
    if (!raw) return undefined;
    const match = raw.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (!match) return undefined;
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
