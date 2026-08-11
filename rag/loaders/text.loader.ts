import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentLoader,
  DocumentMetadata,
  DocumentSection,
  LoadedDocument,
} from './document-loader.interface';

/**
 * Plain Text Document Loader
 * ---------------------------
 *
 * Reads a UTF-8 buffer as plain text. Plain text has no inherent
 * structure, so we fall back to paragraph-based "sections" — each
 * blank-line-separated block becomes one section (level 0). This gives
 * the chunker useful semantic boundaries (paragraph boundaries) for
 * merging / splitting without inventing fake heading hierarchy.
 *
 * Used as the catch-all loader for `text/plain` and any future
 * text-like MIME types that don't have a dedicated loader.
 */
@Injectable()
export class TextLoader implements DocumentLoader {
  private readonly logger = new Logger(TextLoader.name);

  async load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument> {
    this.logger.debug(`Loading plain text "${metadata.filename}" (${buffer.length} bytes)`);

    const text = buffer.toString('utf-8').trim();
    const sections = this.extractSections(text);
    const wordCount = this.countWords(text);

    return {
      text,
      metadata: {
        ...metadata,
        wordCount,
        charCount: text.length,
        language: 'en',
      },
      sections,
    };
  }

  /**
   * Split by blank lines (≥2 consecutive newlines). Each non-empty
   * block becomes a level-0 section so the chunker has paragraph
   * boundaries to work with.
   */
  private extractSections(text: string): DocumentSection[] {
    if (!text) return [];
    const blocks = text.split(/\n\s*\n+/);
    const sections: DocumentSection[] = [];
    blocks.forEach((block, i) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      sections.push({
        heading: '',
        level: 0,
        content: trimmed,
        page: i + 1,
      });
    });
    return sections;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
