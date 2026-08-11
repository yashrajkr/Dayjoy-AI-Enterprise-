import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  DocumentLoader,
  DocumentMetadata,
  DocumentSection,
  LoadedDocument,
} from './document-loader.interface';

/**
 * HTML Document Loader
 * ---------------------
 *
 * Uses `cheerio` to extract clean text from HTML while:
 *   - Stripping `<script>`, `<style>`, `<noscript>`, `<svg>` (no semantic value).
 *   - Preserving heading structure (`<h1>`..`<h6>`) as sections so the
 *     chunker can produce heading-breadcrumb-aware chunks.
 *   - Converting `<li>` items to Markdown-style `- ` bullets so list
 *     items stay readable in the extracted text.
 *
 * The `<title>` tag (or first `<h1>`) becomes the document title in
 * metadata — surfaces as `RagDocument.title` for nicer citations.
 */
@Injectable()
export class HtmlLoader implements DocumentLoader {
  private readonly logger = new Logger(HtmlLoader.name);

  async load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument> {
    this.logger.debug(`Loading HTML "${metadata.filename}" (${buffer.length} bytes)`);

    const html = buffer.toString('utf-8');
    const $ = cheerio.load(html);

    // Strip non-content elements.
    $('script, style, noscript, svg, iframe, link, meta').remove();

    const sections = this.extractSections($);
    const text = sections.map((s) => s.content).join('\n\n');
    const wordCount = this.countWords(text);
    const title = this.extractTitle($, sections);

    return {
      text,
      metadata: {
        ...metadata,
        wordCount,
        charCount: text.length,
        language: 'en',
        title,
      },
      sections,
    };
  }

  /**
   * Walk the body's heading elements in document order. Each heading
   * starts a new section; non-heading content (paragraphs, lists, etc.)
   * between two headings is appended to the current section's content.
   */
  private extractSections($: cheerio.CheerioAPI): DocumentSection[] {
    const sections: DocumentSection[] = [];
    let current: DocumentSection | null = null;

    const flush = () => {
      if (current) {
        current.content = current.content.trim();
        if (current.content) sections.push(current);
      }
    };

    $('body')
      .find('h1, h2, h3, h4, h5, h6, p, ul, ol, table, pre, blockquote')
      .each((_, el) => {
        const $el = $(el);
        const tag = el.tagName?.toLowerCase();
        const headingMatch = tag?.match(/^h([1-6])$/);

        if (headingMatch) {
          flush();
          current = {
            heading: $el.text().trim(),
            level: parseInt(headingMatch[1], 10),
            content: $el.text().trim(),
          };
        } else if (current) {
          const text = this.extractElementText($, $el);
          if (text) current.content += `\n\n${text}`;
        } else {
          // Preamble before first heading.
          const text = this.extractElementText($, $el);
          if (text) {
            current = { heading: '', level: 0, content: text };
          }
        }
      });

    flush();
    return sections;
  }

  /**
   * Extract a block of text from a generic content element, preserving
   * list items as `- ` bullets and table rows as ` | `-delimited rows.
   */
  private extractElementText($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
    const tag = $el.get(0)?.tagName?.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const items: string[] = [];
      $el.find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text) items.push(`- ${text}`);
      });
      return items.join('\n');
    }
    if (tag === 'table') {
      const rows: string[] = [];
      $el.find('tr').each((_, tr) => {
        const cells: string[] = [];
        $(tr)
          .find('th, td')
          .each((__, cell) => {
            cells.push($(cell).text().trim());
          });
        if (cells.length) rows.push(cells.join(' | '));
      });
      return rows.join('\n');
    }
    if (tag === 'pre') {
      return `\`\`\`\n${$el.text()}\n\`\`\``;
    }
    return $el.text().trim().replace(/\n{3,}/g, '\n\n');
  }

  private extractTitle($: cheerio.CheerioAPI, sections: DocumentSection[]): string | undefined {
    const titleTag = $('title').first().text().trim();
    if (titleTag) return titleTag;
    const h1 = sections.find((s) => s.level === 1);
    return h1?.heading;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
