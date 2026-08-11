import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse';
import {
  DocumentLoader,
  DocumentMetadata,
  DocumentSection,
  LoadedDocument,
} from './document-loader.interface';

/**
 * CSV Document Loader
 * --------------------
 *
 * Parses CSV rows into a single {@link LoadedDocument} where each row
 * becomes one "section". The row text is a flat `key: value` pair list
 * (one per line) — this format embeds well with OpenAI's
 * `text-embedding-3-small` and yields row-granular retrieval: a query
 * for "iPhone 15 price" matches the row whose `Product` column = iPhone
 * 15, not every row in the file.
 *
 * The header row supplies the column names used as keys. If the CSV has
 * no header row, the loader falls back to `column_0`, `column_1`, ...
 *
 * Each section's `heading` is set to `"Row N"` so the chunker can
 * distinguish rows when emitting chunk metadata.
 */
@Injectable()
export class CsvLoader implements DocumentLoader {
  private readonly logger = new Logger(CsvLoader.name);

  async load(buffer: Buffer, metadata: DocumentMetadata): Promise<LoadedDocument> {
    this.logger.debug(`Loading CSV "${metadata.filename}" (${buffer.length} bytes)`);

    const text = buffer.toString('utf-8');
    const rows: string[][] = await this.parseCsv(text);

    if (rows.length === 0) {
      return {
        text: '',
        metadata: { ...metadata, wordCount: 0, charCount: 0, language: 'en' },
        sections: [],
      };
    }

    // First row is the header — used as field names in the row text.
    const header = rows[0].map((h, i) => (h && h.trim() ? h.trim() : `column_${i}`));
    const dataRows = rows.slice(1);

    const sections: DocumentSection[] = dataRows.map((row, i) => {
      const fields: string[] = [];
      header.forEach((key, j) => {
        const value = row[j] ?? '';
        if (value !== '') fields.push(`${key}: ${value}`);
      });
      return {
        heading: `Row ${i + 1}`,
        level: 1,
        content: fields.join('\n'),
      };
    });

    // For the embedding-friendly `text` we join all rows with blank-line
    // separators (so the chunker can naturally split row-by-row).
    const fullText = sections.map((s) => s.content).join('\n\n');
    const wordCount = this.countWords(fullText);

    return {
      text: fullText,
      metadata: {
        ...metadata,
        wordCount,
        charCount: fullText.length,
        language: 'en',
        title: metadata.filename.replace(/\.csv$/i, ''),
      },
      sections,
    };
  }

  /**
   * Promise wrapper around the `csv-parse` callback API. Tolerates
   * quoted fields, embedded newlines, and trailing whitespace.
   */
  private parseCsv(text: string): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      const rows: string[][] = [];
      const parser = parse({
        columns: false,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
      });
      parser.on('data', (row: string[]) => rows.push(row));
      parser.on('end', () => resolve(rows));
      parser.on('error', (err: Error) => reject(err));
      parser.write(text);
      parser.end();
    });
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
