import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { PdfLoader } from './pdf.loader';
import { DocxLoader } from './docx.loader';
import { MarkdownLoader } from './markdown.loader';
import { TextLoader } from './text.loader';
import { CsvLoader } from './csv.loader';
import { HtmlLoader } from './html.loader';
import { DocumentLoaderFactory } from './loader.factory';
import type { DocumentMetadata } from './document-loader.interface';

/**
 * Document loader unit tests.
 *
 * Each loader is exercised with a small in-memory sample of its
 * format — no real files on disk, no external dependencies. The
 * factory tests cover MIME-type / extension resolution + error
 * cases.
 */
const baseMetadata: DocumentMetadata = {
  filename: 'sample.txt',
  mimeType: 'text/plain',
  source: 'upload',
  tenantId: 't1',
  uploadedBy: 'u1',
  category: 'test',
  tags: ['unit-test'],
};

describe('Loaders', () => {
  describe('TextLoader', () => {
    let loader: TextLoader;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [TextLoader],
      }).compile();
      loader = moduleRef.get(TextLoader);
    });

    it('extracts text and produces one section per paragraph', async () => {
      const buffer = Buffer.from(
        'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.',
      );
      const doc = await loader.load(buffer, { ...baseMetadata, filename: 'sample.txt' });

      expect(doc.text).toContain('First paragraph');
      expect(doc.metadata.wordCount).toBeGreaterThan(0);
      expect(doc.metadata.charCount).toBe(buffer.toString('utf-8').trim().length);
      expect(doc.sections).toHaveLength(3);
      expect(doc.sections[0].level).toBe(0); // plain text → level 0
      expect(doc.sections[0].page).toBe(1);
    });

    it('returns an empty document for an empty buffer', async () => {
      const doc = await loader.load(Buffer.from(''), baseMetadata);
      expect(doc.text).toBe('');
      expect(doc.sections).toHaveLength(0);
      expect(doc.metadata.wordCount).toBe(0);
    });
  });

  describe('MarkdownLoader', () => {
    let loader: MarkdownLoader;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [MarkdownLoader],
      }).compile();
      loader = moduleRef.get(MarkdownLoader);
    });

    it('extracts sections by `#` headings and preserves code fences', async () => {
      const md = [
        '# Title',
        '',
        'Intro paragraph.',
        '',
        '## Section A',
        '',
        'Text under section A.',
        '',
        '```ts',
        'const x = 1; // code fence should be preserved verbatim',
        '```',
        '',
        '## Section B',
        '',
        'Text under section B.',
      ].join('\n');

      const doc = await loader.load(Buffer.from(md), {
        ...baseMetadata,
        filename: 'sample.md',
        mimeType: 'text/markdown',
      });

      expect(doc.metadata.title).toBe('Title');
      expect(doc.sections.length).toBeGreaterThanOrEqual(3);
      const sectionA = doc.sections.find((s) => s.heading === 'Section A');
      expect(sectionA).toBeDefined();
      expect(sectionA?.level).toBe(2);
      expect(sectionA?.content).toContain('Text under section A.');
      // Code fence inside section A — `#` inside the fence is NOT a heading.
      expect(sectionA?.content).toContain('const x = 1;');
      const codeFenceSection = doc.sections.find((s) => s.content.includes('const x = 1;'));
      expect(codeFenceSection).toBeDefined();
    });

    it('falls back to filename-based title when no H1 is present', async () => {
      const doc = await loader.load(Buffer.from('Just plain text.'), {
        ...baseMetadata,
        filename: 'sample.md',
        mimeType: 'text/markdown',
      });
      expect(doc.metadata.title).toBeUndefined();
      expect(doc.sections[0].level).toBe(0);
    });
  });

  describe('CsvLoader', () => {
    let loader: CsvLoader;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [CsvLoader],
      }).compile();
      loader = moduleRef.get(CsvLoader);
    });

    it('converts each CSV row into a key:value text section', async () => {
      const csv = [
        'Product,Price,Stock',
        'iPhone 15,999,42',
        'Pixel 8,699,17',
      ].join('\n');

      const doc = await loader.load(Buffer.from(csv), {
        ...baseMetadata,
        filename: 'sample.csv',
        mimeType: 'text/csv',
      });

      expect(doc.sections).toHaveLength(2);
      expect(doc.sections[0].heading).toBe('Row 1');
      expect(doc.sections[0].content).toContain('Product: iPhone 15');
      expect(doc.sections[0].content).toContain('Price: 999');
      expect(doc.sections[1].content).toContain('Product: Pixel 8');
      // The full text is the join of all row sections.
      expect(doc.text).toContain('Product: iPhone 15');
      expect(doc.text).toContain('Product: Pixel 8');
    });

    it('handles empty input gracefully', async () => {
      const doc = await loader.load(Buffer.from(''), {
        ...baseMetadata,
        filename: 'empty.csv',
        mimeType: 'text/csv',
      });
      expect(doc.text).toBe('');
      expect(doc.sections).toHaveLength(0);
    });
  });

  describe('HtmlLoader', () => {
    let loader: HtmlLoader;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [HtmlLoader],
      }).compile();
      loader = moduleRef.get(HtmlLoader);
    });

    it('strips scripts/styles and preserves heading hierarchy', async () => {
      const html = `
        <!DOCTYPE html>
        <html><head>
          <title>Sample Page</title>
          <script>console.log('spying');</script>
          <style>body { color: red; }</style>
        </head>
        <body>
          <h1>Welcome</h1>
          <p>Intro paragraph.</p>
          <h2>Details</h2>
          <ul>
            <li>First item</li>
            <li>Second item</li>
          </ul>
          <h3>Code Sample</h3>
          <pre>const x = 1;</pre>
        </body></html>
      `;

      const doc = await loader.load(Buffer.from(html), {
        ...baseMetadata,
        filename: 'sample.html',
        mimeType: 'text/html',
      });

      expect(doc.metadata.title).toBe('Sample Page');
      expect(doc.text).not.toContain('spying');
      expect(doc.text).not.toContain('color: red');
      expect(doc.sections.length).toBeGreaterThanOrEqual(3);
      const welcome = doc.sections.find((s) => s.heading === 'Welcome');
      expect(welcome?.level).toBe(1);
      const details = doc.sections.find((s) => s.heading === 'Details');
      expect(details?.level).toBe(2);
      expect(details?.content).toContain('- First item');
      expect(details?.content).toContain('- Second item');
      const code = doc.sections.find((s) => s.heading === 'Code Sample');
      expect(code?.content).toContain('const x = 1;');
    });
  });

  describe('DocxLoader', () => {
    let loader: DocxLoader;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [DocxLoader],
      }).compile();
      loader = moduleRef.get(DocxLoader);
    });

    it('rejects an invalid buffer with a thrown error', async () => {
      // mammoth delegates to JSZip for parsing — invalid bytes throw
      // "Can't find end of central directory" rather than returning empty text.
      await expect(
        loader.load(Buffer.from('not a real docx'), {
          ...baseMetadata,
          filename: 'sample.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ).rejects.toThrow();
    });
  });

  describe('PdfLoader', () => {
    let loader: PdfLoader;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [PdfLoader],
      }).compile();
      loader = moduleRef.get(PdfLoader);
    });

    it('rejects an invalid PDF buffer with a thrown error', async () => {
      // pdf-parse throws on non-PDF input — we surface the error to the caller.
      await expect(
        loader.load(Buffer.from('not a real pdf'), {
          ...baseMetadata,
          filename: 'sample.pdf',
          mimeType: 'application/pdf',
        }),
      ).rejects.toThrow();
    });
  });

  describe('DocumentLoaderFactory', () => {
    let factory: DocumentLoaderFactory;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          DocumentLoaderFactory,
          PdfLoader,
          DocxLoader,
          MarkdownLoader,
          TextLoader,
          CsvLoader,
          HtmlLoader,
        ],
      }).compile();
      factory = moduleRef.get(DocumentLoaderFactory);
    });

    it('resolves the right loader by MIME type', () => {
      expect(factory.getLoader('application/pdf')).toBeInstanceOf(PdfLoader);
      expect(factory.getLoader('text/markdown')).toBeInstanceOf(MarkdownLoader);
      expect(factory.getLoader('text/csv')).toBeInstanceOf(CsvLoader);
      expect(factory.getLoader('text/html')).toBeInstanceOf(HtmlLoader);
      expect(factory.getLoader('text/plain')).toBeInstanceOf(TextLoader);
      expect(
        factory.getLoader(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBeInstanceOf(DocxLoader);
    });

    it('strips `; charset=utf-8` suffix from MIME type', () => {
      expect(factory.getLoader('text/plain; charset=utf-8')).toBeInstanceOf(TextLoader);
    });

    it('resolves loaders by file extension', () => {
      expect(factory.getLoaderByExtension('pdf')).toBeInstanceOf(PdfLoader);
      expect(factory.getLoaderByExtension('md')).toBeInstanceOf(MarkdownLoader);
      expect(factory.getLoaderByExtension('htm')).toBeInstanceOf(HtmlLoader);
      expect(factory.getLoaderByExtension('.txt')).toBeInstanceOf(TextLoader);
    });

    it('throws BadRequestException for unsupported MIME type', () => {
      expect(() => factory.getLoader('application/zip')).toThrow(BadRequestException);
      expect(() => factory.getLoader('')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for unsupported extension', () => {
      expect(() => factory.getLoaderByExtension('zip')).toThrow(BadRequestException);
      expect(() => factory.getLoaderByExtension('')).toThrow(BadRequestException);
    });

    it('getLoaderFor prefers MIME type and falls back to extension', () => {
      expect(factory.getLoaderFor('doc.pdf', 'application/pdf')).toBeInstanceOf(PdfLoader);
      expect(factory.getLoaderFor('doc.unknown', 'text/markdown')).toBeInstanceOf(
        MarkdownLoader,
      );
      // MIME type sniffed as wrong but extension known → use extension.
      expect(factory.getLoaderFor('doc.csv', 'application/octet-stream')).toBeInstanceOf(
        CsvLoader,
      );
    });
  });
});
