import { Test, TestingModule } from '@nestjs/testing';
import { ChunkingService } from './chunking-service';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

describe('ChunkingService (e2e)', () => {
  let service: ChunkingService;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Initialize real Prisma connection for e2e tests
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkingService, PrismaService],
    }).compile();

    service = module.get<ChunkingService>(ChunkingService);
    prisma = module.get<PrismaService>(PrismaService);

    // Connect to test database
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    // Clean up test database
    await prisma.$disconnect();
  });

  it('should chunk a real document end-to-end', async () => {
    // Create a test document
    const document = await prisma.ragDocument.create({
      data: {
        tenant_id: 'test-tenant',
        source_id: 'test-source',
        title: 'Test Document for Chunking',
        content: 'This is test content. '.repeat(1000),
        status: 'processed',
      },
    });

    // Chunk the document
    const chunks = await service.chunkDocument(
      document.id,
      document.content,
      'text',
      document.title,
      'test-tenant',
    );

    // Verify chunks
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].documentId).toBe(document.id);
    expect(chunks[0].tenantId).toBe('test-tenant');
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].totalChunks).toBe(chunks.length);

    // Clean up
    await prisma.ragChunk.deleteMany({
      where: { document_id: document.id },
    });
    await prisma.ragDocument.delete({
      where: { id: document.id },
    });
  });
});