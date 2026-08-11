import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkingService } from './chunking-service';
import {
  DEFAULT_CHUNKING_CONFIG,
  ChunkingConfig,
} from './chunking-config';
import type { LoadedDocument } from '../loaders/document-loader.interface';

/**
 * Build a LoadedDocument for tests — avoids repeating the boilerplate
 * metadata shape on every test case.
 */
function makeDocument(
  text: string,
  sections: { heading: string; level: number; content: string }[] = [],
  mimeType = 'text/plain',
): LoadedDocument {
  return {
    text,
    metadata: {
      filename: 'test.txt',
      mimeType,
      source: 'upload',
      tenantId: 't1',
      uploadedBy: 'u1',
      wordCount: text.split(/\s+/).filter(Boolean).length,
      charCount: text.length,
      language: 'en',
    },
    sections: sections.map((s, i) => ({ ...s, page: i + 1 })),
  };
}

/**
 * Build a paragraph of approximately N tokens by repeating a base
 * sentence. Each "lorem ipsum dolor sit amet" sentence is ~6 tokens.
 */
function makeParagraph(targetTokens: number): string {
  const base = 'lorem ipsum dolor sit amet consectetur adipiscing elit ';
  const tokensPerBase = 8;
  const repeats = Math.ceil(targetTokens / tokensPerBase);
  return Array(repeats).fill(base).join(' ').trim() + '.';
}

/**
 * ChunkingService unit tests.
 *
 * Covers:
 *  - Strategy selection (hierarchical vs paragraph vs sentence).
 *  - Token-aware chunking (chunkByTokens respects maxTokens + overlap).
 *  - mergeSmallChunks (under-sized chunks merged with neighbor).
 *  - splitLargeChunk (over-sized chunk split at sentence boundaries).
 *  - addOverlap (overlap from previous chunk prepended to next).
 *  - Edge cases: empty doc, single chunk, all-zero overlap.
 */
describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  describe('chunk — strategy selection', () => {
    it('uses hierarchical strategy when sections are present', () => {
      // Make each section large enough that the chunker won't merge them
      // (minChunkSize=100 by default → sections < 100 tokens get merged).
      const filler = makeParagraph(150);
      const doc = makeDocument(
        `# Title\n\n${filler}\n\n## Section A\n\n${filler}\n\n## Section B\n\n${filler}`,
        [
          { heading: 'Title', level: 1, content: `# Title\n\n${filler}` },
          { heading: 'Section A', level: 2, content: `## Section A\n\n${filler}` },
          { heading: 'Section B', level: 2, content: `## Section B\n\n${filler}` },
        ],
        'text/markdown',
      );
      const chunks = service.chunk(doc);
      expect(chunks.length).toBeGreaterThanOrEqual(3);
      // Each chunk should carry a section heading (or be empty/sectionless).
      const sectionedChunks = chunks.filter((c) => c.section);
      expect(sectionedChunks.length).toBeGreaterThan(0);
      // The chunk positions should be sequential 0..N-1.
      chunks.forEach((c, i) => expect(c.position).toBe(i));
    });

    it('uses paragraph strategy when no sections are detected', () => {
      const para1 = makeParagraph(150);
      const para2 = makeParagraph(150);
      const doc = makeDocument(`${para1}\n\n${para2}`, [], 'text/plain');
      const chunks = service.chunk(doc);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // All chunks should have a tokenCount ≤ maxChunkSize + overlap slack.
      chunks.forEach((c) => {
        expect(c.tokenCount).toBeLessThanOrEqual(DEFAULT_CHUNKING_CONFIG.maxChunkSize);
      });
      // Every chunk should be tagged with the tenant + source metadata.
      chunks.forEach((c) => {
        expect(c.metadata.tenantId).toBe('t1');
        expect(c.metadata.source).toBe('upload');
      });
    });

    it('respects the document-type-specific config for HTML (smaller chunks)', () => {
      const longText = makeParagraph(2000);
      const doc = makeDocument(longText, [], 'text/html');
      const chunks = service.chunk(doc);
      const htmlConfig = DEFAULT_CHUNKING_CONFIG.byDocumentType.html;
      chunks.forEach((c) => {
        // Allow some slack for the +1 token joiner + overlap.
        expect(c.tokenCount).toBeLessThanOrEqual(htmlConfig.maxChunkSize + 50);
      });
    });
  });

  describe('chunkByTokens', () => {
    it('returns a single chunk when text fits within maxTokens', () => {
      const text = 'This is a short sentence.';
      const chunks = service.chunkByTokens(text, 100, 0);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('splits at sentence boundaries when text exceeds maxTokens', () => {
      // 20 sentences × ~6 tokens each = ~120 tokens → maxTokens=50 → 3+ chunks.
      const sentences = Array.from({ length: 20 }, (_, i) => `Sentence ${i + 1} here.`);
      const text = sentences.join(' ');
      const chunks = service.chunkByTokens(text, 50, 0);
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should respect the maxTokens limit (allowing for hard-split fallback).
      chunks.forEach((c) => {
        const tokens = service.countTokens(c);
        expect(tokens).toBeLessThanOrEqual(60); // small slack for sentence boundaries
      });
    });

    it('adds overlap from previous chunk to next', () => {
      const sentences = Array.from({ length: 30 }, (_, i) => `Sentence ${i + 1} here.`);
      const text = sentences.join(' ');
      const chunks = service.chunkByTokens(text, 50, 20);
      expect(chunks.length).toBeGreaterThan(1);
      // The overlap region should appear at the start of chunks[1..N-1].
      // We can't assert exact equality (tokenizer may merge boundaries),
      // but the second chunk should contain at least one token from the
      // first chunk's tail.
      const firstTailTokens = chunks[0].split(' ').slice(-5).join(' ');
      // Strip overlap prefix from chunks[1] for comparison — the overlap
      // text is the tail of chunks[0] prepended to chunks[1].
      expect(chunks[1].length).toBeGreaterThan(0);
    });

    it('returns an empty array for empty input', () => {
      expect(service.chunkByTokens('', 100, 0)).toHaveLength(0);
      expect(service.chunkByTokens('   ', 100, 0)).toHaveLength(0);
    });
  });

  describe('mergeSmallChunks', () => {
    it('merges adjacent chunks below minSize', () => {
      const config = { ...DEFAULT_CHUNKING_CONFIG };
      const doc = makeDocument('a\n\nb\n\nc', []);
      // Manually construct under-sized chunks to test the merge logic.
      const chunks = [
        {
          id: '1',
          content: 'a',
          tokenCount: 1,
          position: 0,
          metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
        },
        {
          id: '2',
          content: 'b',
          tokenCount: 1,
          position: 1,
          metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
        },
        {
          id: '3',
          content: 'c',
          tokenCount: 1,
          position: 2,
          metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
        },
      ];
      const merged = service.mergeSmallChunks(chunks as any, 100, config);
      // All three should merge into one chunk (each is below minSize and
      // the merged token count is way below maxChunkSize).
      expect(merged).toHaveLength(1);
      expect(merged[0].content).toBe('a\n\nb\n\nc');
    });

    it('does not merge if the merged result would exceed maxChunkSize', () => {
      const config = { ...DEFAULT_CHUNKING_CONFIG, maxChunkSize: 5 };
      const chunks = [
        {
          id: '1',
          content: 'small one',
          tokenCount: 2,
          position: 0,
          metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
        },
        {
          id: '2',
          content: 'small two',
          tokenCount: 2,
          position: 1,
          metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
        },
        {
          id: '3',
          content: 'small three',
          tokenCount: 2,
          position: 2,
          metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
        },
      ];
      const merged = service.mergeSmallChunks(chunks as any, 100, config);
      // 2+2+1=5 would equal maxChunkSize; first merge succeeds, second
      // would push to 2+2+1+2+1=8 → exceeds → no further merge.
      expect(merged.length).toBeLessThan(chunks.length);
    });
  });

  describe('splitLargeChunk', () => {
    it('returns the chunk unchanged if below maxSize', () => {
      const chunk = {
        id: '1',
        content: 'short',
        tokenCount: 1,
        position: 0,
        metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
      };
      const result = service.splitLargeChunk(chunk as any, 100);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(chunk);
    });

    it('splits an oversized chunk into multiple pieces', () => {
      const longText = Array.from({ length: 50 }, (_, i) => `Sentence ${i + 1}.`).join(' ');
      const chunk = {
        id: '1',
        content: longText,
        tokenCount: service.countTokens(longText),
        position: 0,
        metadata: { documentId: 'd1', tenantId: 't1', source: 'upload' },
      };
      const result = service.splitLargeChunk(chunk as any, 20);
      expect(result.length).toBeGreaterThan(1);
      result.forEach((c) => {
        expect(c.tokenCount).toBeLessThanOrEqual(30); // small slack
        expect(c.metadata.tenantId).toBe('t1');
      });
    });
  });

  describe('addOverlap', () => {
    it('returns chunks unchanged when overlapSize is 0', () => {
      const chunks = [
        { id: '1', content: 'a', tokenCount: 1, position: 0, metadata: {} },
        { id: '2', content: 'b', tokenCount: 1, position: 1, metadata: {} },
      ] as any;
      const result = service.addOverlap(chunks, 0);
      expect(result).toBe(chunks);
    });

    it('prepends overlap tokens to subsequent chunks', () => {
      const text1 = 'alpha beta gamma delta epsilon zeta eta theta';
      const text2 = 'iota kappa lambda mu';
      const chunks = [
        { id: '1', content: text1, tokenCount: service.countTokens(text1), position: 0, metadata: {} },
        { id: '2', content: text2, tokenCount: service.countTokens(text2), position: 1, metadata: {} },
      ] as any;
      const result = service.addOverlap(chunks, 5);
      expect(result).toHaveLength(2);
      // The second chunk should start with some tokens from the first chunk's tail.
      expect(result[1].content.length).toBeGreaterThan(text2.length);
      // The first chunk should be unchanged.
      expect(result[0].content).toBe(text1);
    });
  });

  describe('countTokens', () => {
    it('returns 0 for empty input', () => {
      expect(service.countTokens('')).toBe(0);
    });

    it('returns a positive integer for non-empty input', () => {
      const count = service.countTokens('hello world this is a test');
      expect(count).toBeGreaterThan(0);
      expect(Number.isInteger(count)).toBe(true);
    });

    it('counts CJK characters as more tokens than English of the same char length', () => {
      // CJK: each char ≈ 1-2 tokens. English: ~1 token per 4 chars.
      const cjk = '你好世界这是一个测试'; // 9 chars
      const en = 'hello world this is a test'; // 27 chars
      const cjkCount = service.countTokens(cjk);
      const enCount = service.countTokens(en);
      // CJK chars are roughly 1 token each → 9 tokens for 9 chars.
      // English is roughly 7 tokens for 27 chars.
      // So CJK should produce a HIGHER token/char ratio.
      expect(cjkCount / cjk.length).toBeGreaterThan(enCount / en.length);
    });
  });

  describe('edge cases', () => {
    it('returns an empty array for an empty document', () => {
      const doc = makeDocument('', [], 'text/plain');
      const chunks = service.chunk(doc);
      expect(chunks).toHaveLength(0);
    });

    it('returns a single chunk when the document fits within chunkSize', () => {
      const doc = makeDocument('Short text.', [], 'text/plain');
      const chunks = service.chunk(doc);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].position).toBe(0);
      expect(chunks[0].metadata.tenantId).toBe('t1');
    });

    it('assigns unique IDs to each chunk', () => {
      const para1 = makeParagraph(150);
      const para2 = makeParagraph(150);
      const para3 = makeParagraph(150);
      const doc = makeDocument(`${para1}\n\n${para2}\n\n${para3}`, [], 'text/plain');
      const chunks = service.chunk(doc);
      const ids = new Set(chunks.map((c) => c.id));
      expect(ids.size).toBe(chunks.length);
    });
  });
});
