import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentLoader,
  DocumentMetadata,
  DocumentSection,
  LoadedDocument,
} from './document-loader.interface';

/**
 * DOCX Document Loader
 * ---------------------
 *
 * Uses `mammoth` to extract plain text from Microsoft Word `.docx` files.
 *
 * `mammoth` does most of the heavy lifting — it converts the OOXML
 * document.xml into HTML and then into plain text, preserving paragraph
 * boundaries and stripping formatting that doesn't contribute semantic
 * meaning (font weight, colour, ...).
 *
 * Heading detection: `mammoth` emits headings as Markdown-style `#`,
 * `##`, `###` prefixes when `styleMap` is left at default and the
 * document uses Word's built-in Heading 1/2/3 styles. We re-parse those
 * prefixes to derive `DocumentSection.level`. Documents without Word
 * heading styles get a single section (level 0) so the chunker falls
 * back to paragraph-based chunking.
 */
@Injectable()
export class DocxLoader implements DocumentLoader {
  private readonly logger = new Logger(DocxLoader.name);

  async load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument> {
    this.logger.debug(`Loading DOCX "${metadata.filename}" (${buffer.length} bytes)`);

    // Lazy-import — mammoth pulls in a sizeable XML parser.
    const mammoth = await import('mammoth');
    const { value: text, messages } = await mammoth.extractRawText({ buffer });

    if (messages?.length) {
      this.logger.debug(
        `mammoth warnings for "${metadata.filename}": ${messages
          .slice(0, 3)
          .map((m) => m.message)
          .join(' | ')}`,
      );
    }

    const trimmed = (text ?? '').trim();
    const sections = this.extractSections(trimmed);
    const wordCount = this.countWords(trimmed);

    return {
      text: trimmed,
      metadata: {
        ...metadata,
        wordCount,
        charCount: trimmed.length,
        // mammoth doesn't expose page count; Word doesn't paginate until render.
        pageCount: undefined,
        language: 'en',
        title: metadata.filename.replace(/\.docx$/i, ''),
      },
      sections,
    };
  }

  /**
   * Group the text by heading-prefixed lines (mammoth's Markdown
   * convention) — every heading starts a new section, and the content
   * up to the next heading (or EOF) becomes that section's body.
   */
  private extractSections(text: string): DocumentSection[] {
    if (!text) return [];

    const lines = text.split('\n');
    const sections: DocumentSection[] = [];
    let current: DocumentSection | null = null;

    const flush = () => {
      if (current) {
        current.content = current.content.trim();
        if (current.content) sections.push(current);
      }
    };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flush();
        current = {
          heading: headingMatch[2].trim(),
          level: headingMatch[1].length,
          content: line,
        };
      } else if (current) {
        current.content += `\n${line}`;
      } else {
        // Preamble before first heading — treat as level-0 section.
        current = {
          heading: '',
          level: 0,
          content: line,
        };
      }
    }
    flush();

    return sections;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
