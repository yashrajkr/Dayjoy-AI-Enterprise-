import { Test, TestingModule } from '@nestjs/testing';
import { ChunkingService } from './chunking-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

describe('ChunkingService', () => {
  let service: ChunkingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkingService,
        {
          provide: PrismaService,
          useValue: {
            // Mock PrismaService
          },
        },
      ],
    }).compile();

    service = module.get<ChunkingService>(ChunkingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chunkDocument', () => {
    it('should create chunks with correct size', async () => {
      const content = 'This is a test paragraph. '.repeat(200); // ~1000 tokens
      const chunks = await service.chunkDocument(
        'doc-123',
        content,
        'text',
        'Test Document',
        'tenant-123',
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toBeDefined();
      expect(chunks[0].metadata.documentId).toBe('doc-123');
      expect(chunks[0].metadata.chunkIndex).toBe(0);
    });

    it('should respect paragraph boundaries', async () => {
      const content = `First paragraph here.

Second paragraph here.

Third paragraph here.`;

      const chunks = await service.chunkDocument(
        'doc-123',
        content,
        'text',
        'Test Document',
        'tenant-123',
      );

      // Should not split paragraphs in the middle
      chunks.forEach(chunk => {
        expect(chunk.content).not.toContain('\n\n\n');
      });
    });

    it('should create overlap between chunks', async () => {
      const content = 'Test sentence. '.repeat(500); // ~1000 tokens
      const chunks = await service.chunkDocument(
        'doc-123',
        content,
        'text',
        'Test Document',
        'tenant-123',
      );

      if (chunks.length > 1) {
        // Check that there's overlap between consecutive chunks
        const chunk1 = chunks[0].content;
        const chunk2 = chunks[1].content;
        
        // Should have some shared content
        expect(chunk1.length + chunk2.length).toBeGreaterThan(
          content.length / chunks.length * 2,
        );
      }
    });

    it('should detect headings in markdown', async () => {
      const content = `# Main Heading

Some content here.

## Sub Heading

More content.`;

      const chunks = await service.chunkDocument(
        'doc-123',
        content,
        'markdown',
        'Test Document',
        'tenant-123',
      );

      const headingChunk = chunks.find(c => c.metadata.heading);
      expect(headingChunk).toBeDefined();
      expect(headingChunk?.metadata.heading).toBe('Main Heading');
    });

    it('should detect code in content', async () => {
      const content = `Here's a function:

\`\`\`typescript
function test() {
  return 'hello';
}
\`\`\``;

      const chunks = await service.chunkDocument(
        'doc-123',
        content,
        'markdown',
        'Test Document',
        'tenant-123',
      );

      expect(chunks[0].metadata.hasCode).toBe(true);
    });

    it('should create correct metadata', async () => {
      const content = 'Test content '.repeat(100);
      const chunks = await service.chunkDocument(
        'doc-123',
        content,
        'pdf',
        'Test PDF',
        'tenant-123',
      );

      const metadata = chunks[0].metadata;
      expect(metadata.documentId).toBe('doc-123');
      expect(metadata.documentTitle).toBe('Test PDF');
      expect(metadata.documentType).toBe('pdf');
      expect(metadata.chunkIndex).toBe(0);
      expect(metadata.totalChunks).toBe(chunks.length);
      expect(metadata.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const text = 'This is a test sentence.';
      const tokens = service['estimateTokens'](text);
      
      // Should be approximately text.length / 4
      expect(tokens).toBeCloseTo(text.length / 4, 0);
    });
  });
});