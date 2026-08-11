import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import type OpenAI from 'openai';
import type { AuthUser } from '../../backend/ai/auth-user';
import { DocumentLoaderFactory } from '../loaders/loader.factory';
import {
  DocumentMetadata,
  LoadedDocument,
} from '../loaders/document-loader.interface';
import { ChunkingService, Chunk } from './chunking-service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import {
  BatchIngestionResult,
  IngestDocumentDto,
  IngestionResult,
} from './ingestion.dto';

/**
 * Ingestion Service
 * ------------------
 *
 * Orchestrates the full RAG ingestion pipeline:
 *
 *   1. **Source**: upsert a `RagSource` for the supplied `sourceName`
 *      (or look one up by `sourceId`).
 *   2. **Document**: create a `RagDocument` row in `PROCESSING` status.
 *   3. **Load**: if a `fileBuffer` was supplied, dispatch to the
 *      format-specific loader via {@link DocumentLoaderFactory}.
 *      Otherwise treat the supplied `content` string as the raw text.
 *   4. **Chunk**: run the loaded document through {@link ChunkingService}.
 *   5. **Embed**: batch-generate OpenAI embeddings for every chunk via
 *      {@link EmbeddingsService}.
 *   6. **Store**: persist the chunks + embeddings via
 *      {@link VectorStoreService} (raw SQL for the pgvector column).
 *   7. **Finalize**: flip the document to `READY` (or `FAILED` on
 *      error) and return an {@link IngestionResult}.
 *
 * The pipeline is per-document-transactional — a failure at any step
 * rolls back partial chunk writes (via `prisma.$transaction`) and
 * surfaces a 4xx/5xx to the caller. Batch ingestion runs documents in
 * parallel (max 5) but each document is its own transaction.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  /** Max parallel documents during batch ingest. */
  private static readonly BATCH_CONCURRENCY = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loaderFactory: DocumentLoaderFactory,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorStoreService: VectorStoreService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  /**
   * Ingest a single document. See class docstring for the pipeline.
   */
  async ingestDocument(
    dto: IngestDocumentDto,
    user: AuthUser,
  ): Promise<IngestionResult> {
    const tenantId = user.tenantId!;
    this.logger.log(
      `Ingesting document "${dto.title}" for tenant ${tenantId} ` +
        `(source=${dto.sourceName ?? dto.sourceId ?? 'auto'})`,
    );

    if (!dto.content && !dto.fileBuffer) {
      throw new BadRequestException(
        'Either content or fileBuffer must be provided for ingestion',
      );
    }

    // Step 1: Resolve or create the RagSource.
    const source = await this.resolveSource(dto, tenantId);

    // Step 2: Create the RagDocument row (PROCESSING).
    const document = await this.prisma.ragDocument.create({
      data: {
        tenantId,
        sourceId: source.id,
        title: dto.title,
        content: dto.content ?? '',
        wordCount: dto.content ? this.countWords(dto.content) : 0,
        status: 'PROCESSING',
        processedAt: null,
        metadata: {
          originalFilename: dto.filename,
          mimeType: dto.mimeType,
          category: dto.category,
          tags: dto.tags,
          uploadedBy: user.userId,
        },
      },
    });

    try {
      // Step 3: Load (or use the supplied content directly).
      const loadedDoc = dto.fileBuffer
        ? await this.loadFromFile(dto, tenantId, user)
        : this.loadFromContent(dto, tenantId, user);

      // Step 4: Chunk.
      const chunks = this.chunkingService.chunk(loadedDoc);
      if (chunks.length === 0) {
        throw new BadRequestException(
          `No chunks produced from document "${dto.title}" — content may be empty`,
        );
      }
      // Stamp the document ID + total count on every chunk.
      chunks.forEach((c) => {
        c.metadata.documentId = document.id;
      });

      // Step 5: Embed (batch).
      const embeddings = await this.embeddingsService.embedBatch(
        chunks.map((c) => c.content),
      );

      // Step 6: Store chunks + embeddings.
      await this.vectorStoreService.insertChunks(document.id, chunks, embeddings, tenantId);

      // Step 7: Finalize.
      await this.prisma.ragDocument.update({
        where: { id: document.id },
        data: {
          status: 'READY',
          processedAt: new Date(),
          wordCount: loadedDoc.metadata.wordCount,
          content: loadedDoc.text,
        },
      });

      this.logger.log(
        `Ingested document ${document.id} → ${chunks.length} chunks, ${embeddings.length} embeddings`,
      );

      return {
        documentId: document.id,
        chunkCount: chunks.length,
        status: 'READY',
      };
    } catch (err) {
      // Mark the document as FAILED (chunks were never committed because
      // the transaction in insertChunks rolled back, but we still need
      // to flip the document status).
      const message = (err as Error).message;
      this.logger.error(`Ingestion failed for document ${document.id}: ${message}`);
      await this.prisma.ragDocument.update({
        where: { id: document.id },
        data: {
          status: 'FAILED',
          metadata: { error: message },
        },
      });
      throw err;
    }
  }

  /**
   * Ingest a batch of documents in parallel (max {@link BATCH_CONCURRENCY}
   * at a time). Failures are isolated — one bad document doesn't fail
   * the batch.
   */
  async ingestBatch(
    dtos: IngestDocumentDto[],
    user: AuthUser,
  ): Promise<BatchIngestionResult> {
    this.logger.log(`Batch ingesting ${dtos.length} documents for tenant ${user.tenantId}`);

    const results: IngestionResult[] = [];
    for (let i = 0; i < dtos.length; i += IngestionService.BATCH_CONCURRENCY) {
      const slice = dtos.slice(i, i + IngestionService.BATCH_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        slice.map((dto) => this.ingestDocument(dto, user)),
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          results.push({
            documentId: '',
            chunkCount: 0,
            status: 'FAILED',
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      }
    }

    return {
      results,
      totalDocuments: dtos.length,
      succeeded: results.filter((r) => r.status === 'READY').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      totalChunks: results.reduce((sum, r) => sum + r.chunkCount, 0),
    };
  }

  /**
   * Re-ingest every document belonging to a source. Useful when the
   * chunking strategy or embedding model has changed and the existing
   * chunks need to be regenerated.
   *
   * Implementation: load each document's stored `content`, delete its
   * existing chunks + embeddings, then re-run the pipeline using the
   * stored content as the source. (We can't re-run the loader because
   * the original file bytes aren't persisted.)
   */
  async reingestSource(sourceId: string, user: AuthUser): Promise<BatchIngestionResult> {
    const tenantId = user.tenantId!;
    const source = await this.prisma.ragSource.findUnique({
      where: { id: sourceId },
    });
    if (!source || source.tenantId !== tenantId) {
      throw new NotFoundException(`RAG source ${sourceId} not found`);
    }

    const documents = await this.prisma.ragDocument.findMany({
      where: { sourceId, tenantId },
    });

    this.logger.log(
      `Re-ingesting source ${sourceId} (${documents.length} documents)`,
    );

    const dtos: IngestDocumentDto[] = documents
      .filter((d) => d.content)
      .map((d) => ({
        sourceId,
        title: d.title,
        content: d.content ?? '',
        mimeType: (d.metadata as any)?.mimeType ?? 'text/plain',
        filename: (d.metadata as any)?.originalFilename ?? `${d.title}.txt`,
        category: (d.metadata as any)?.category,
        tags: (d.metadata as any)?.tags,
      }));

    // Delete existing chunks before re-ingesting (so we don't double-count).
    for (const doc of documents) {
      await this.vectorStoreService.deleteByDocument(doc.id);
    }

    return this.ingestBatch(dtos, user);
  }

  /**
   * Delete a document + all of its chunks + embeddings. The document
   * row is soft-deleted (status = `DELETED`) so audit history is
   * preserved; chunks/embeddings are hard-deleted (they have no
   * independent audit value and would otherwise bloat the table).
   */
  async deleteDocument(documentId: string, user: AuthUser): Promise<void> {
    const tenantId = user.tenantId!;
    const document = await this.prisma.ragDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.tenantId !== tenantId) {
      throw new NotFoundException(`RAG document ${documentId} not found`);
    }

    await this.vectorStoreService.deleteByDocument(documentId);
    await this.prisma.ragDocument.update({
      where: { id: documentId },
      data: { status: 'DELETED' },
    });

    this.logger.log(`Deleted document ${documentId} (soft-deleted, chunks hard-deleted)`);
  }

  /**
   * Hard-purge a deleted document row. Called by a periodic cleanup
   * job (not yet implemented) — exposed here so the cleanup worker has
   * a stable API to call.
   */
  async purgeDocument(documentId: string, user: AuthUser): Promise<void> {
    const tenantId = user.tenantId!;
    const document = await this.prisma.ragDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.tenantId !== tenantId) {
      throw new NotFoundException(`RAG document ${documentId} not found`);
    }
    if (document.status !== 'DELETED') {
      throw new BadRequestException(
        `Document ${documentId} must be soft-deleted before purge`,
      );
    }
    await this.prisma.ragDocument.delete({ where: { id: documentId } });
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  /**
   * Resolve a RagSource for the supplied DTO. If `sourceId` is
   * provided, look it up; otherwise upsert by `sourceName` (so repeat
   * uploads under the same source name accumulate into one source).
   */
  private async resolveSource(dto: IngestDocumentDto, tenantId: string) {
    if (dto.sourceId) {
      const existing = await this.prisma.ragSource.findUnique({
        where: { id: dto.sourceId },
      });
      if (!existing || existing.tenantId !== tenantId) {
        throw new NotFoundException(`RAG source ${dto.sourceId} not found`);
      }
      return existing;
    }

    const name = dto.sourceName ?? `Default source for "${dto.title}"`;
    return this.prisma.ragSource.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: {
        tenantId,
        name,
        type: dto.sourceType,
        status: 'active',
      },
      update: {},
    });
  }

  /**
   * Load a document from a file buffer — dispatch to the right loader
   * by MIME type (with extension fallback).
   */
  private async loadFromFile(
    dto: IngestDocumentDto,
    tenantId: string,
    user: AuthUser,
  ): Promise<LoadedDocument> {
    if (!dto.fileBuffer) {
      throw new BadRequestException('fileBuffer is required for file-based ingestion');
    }
    if (!dto.mimeType && !dto.filename) {
      throw new BadRequestException('mimeType or filename is required to select a loader');
    }
    const loader = this.loaderFactory.getLoaderFor(
      dto.filename ?? 'unknown.txt',
      dto.mimeType,
    );
    const metadata: DocumentMetadata = {
      filename: dto.filename ?? 'unknown',
      mimeType: dto.mimeType ?? 'text/plain',
      source: 'upload',
      tenantId,
      uploadedBy: user.userId ?? '',
      category: dto.category,
      tags: dto.tags,
    };
    return loader.load(dto.fileBuffer, metadata);
  }

  /**
   * Construct a {@link LoadedDocument} from the supplied inline text
   * content. Skips the loader phase entirely.
   */
  private loadFromContent(
    dto: IngestDocumentDto,
    tenantId: string,
    user: AuthUser,
  ): LoadedDocument {
    if (!dto.content) {
      throw new BadRequestException('content is required for text-based ingestion');
    }
    return {
      text: dto.content,
      metadata: {
        filename: dto.filename ?? `${dto.title}.txt`,
        mimeType: dto.mimeType ?? 'text/plain',
        source: 'manual',
        tenantId,
        uploadedBy: user.userId ?? '',
        category: dto.category,
        tags: dto.tags,
        wordCount: this.countWords(dto.content),
        charCount: dto.content.length,
        language: 'en',
        title: dto.title,
      },
      sections: [],
    };
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
