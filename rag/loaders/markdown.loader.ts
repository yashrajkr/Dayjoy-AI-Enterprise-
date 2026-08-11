import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentLoader,
  DocumentMetadata,
  DocumentSection,
  LoadedDocument,
} from './document-loader.interface';

/**
 * Markdown Document Loader
 * -------------------------
 *
 * Parses Markdown into a {@link LoadedDocument} whose `sections` array
 * preserves the document's `#`-prefixed heading hierarchy. Code fences
 * (` ``` `) are preserved verbatim — they're often semantically dense
 * (API examples, schemas) and should not be split mid-fence by the
 * chunker.
 *
 * The `text` field is the raw markdown (we don't strip the `#` markers
 * because they're useful context for the embedding model — a chunk
 * starting with `## Authentication` self-documents its topic).
 */
@Injectable()
export class MarkdownLoader implements DocumentLoader {
  private readonly logger = new Logger(MarkdownLoader.name);

  async load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument> {
    this.logger.debug(`Loading markdown "${metadata.filename}" (${buffer.length} bytes)`);
    const text = buffer.toString('utf-8');
    const sections = this.extractSections(text);
    const wordCount = this.countWords(text);

    return {
      text,
      metadata: {
        ...metadata,
        wordCount,
        charCount: text.length,
        language: 'en',
        title: this.extractTitle(text, sections),
      },
      sections,
    };
  }

  /**
   * Walk the markdown line-by-line. A heading line (`# ...`, `## ...`)
   * starts a new section; the body up to the next heading is the
   * section's content. Code fences are kept intact (we don't treat
   * `#` inside a code fence as a heading).
   */
  private extractSections(text: string): DocumentSection[] {
    if (!text) return [];

    const lines = text.split('\n');
    const sections: DocumentSection[] = [];
    let current: DocumentSection | null = null;
    let inCodeFence = false;

    const flush = () => {
      if (current) {
        current.content = current.content.trim();
        if (current.content) sections.push(current);
      }
    };

    for (const line of lines) {
      // Toggle code-fence state — ``` or ~~~ delimiters.
      if (/^(```|~~~)/.test(line.trim())) {
        inCodeFence = !inCodeFence;
        if (current) current.content += `\n${line}`;
        continue;
      }

      // Skip heading detection inside code fences.
      if (!inCodeFence) {
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          flush();
          current = {
            heading: headingMatch[2].trim(),
            level: headingMatch[1].length,
            content: line,
          };
          continue;
        }
      }

      if (current) {
        current.content += `\n${line}`;
      } else {
        // Preamble before first heading.
        current = { heading: '', level: 0, content: line };
      }
    }
    flush();

    return sections;
  }

  /**
   * Prefer YAML front-matter `title:`; fall back to the first H1;
   * fall back to the filename.
   */
  private extractTitle(text: string, sections: DocumentSection[]): string | undefined {
    const frontMatter = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontMatter) {
      const titleMatch = frontMatter[1].match(/^title:\s*(.+)$/m);
      if (titleMatch) return titleMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    const h1 = sections.find((s) => s.level === 1);
    if (h1) return h1.heading;
    return undefined;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
