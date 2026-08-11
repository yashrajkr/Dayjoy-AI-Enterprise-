import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { EmbeddingsService } from './embeddings-service';
import { ChunkingService } from '../ingestion/chunking-service';

@Injectable()
export class EmbeddingPipelineService {
  private readonly logger = new Logger(EmbeddingPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly chunkingService: ChunkingService,
  ) {}

  /**
   * Complete embedding pipeline for a document
   */
  async processDocument(
    documentId: string,
    tenantId: string,
  ): Promise<EmbeddingPipelineResult> {
    const startTime = Date.now();
    this.logger.log(`Starting embedding pipeline for document ${documentId}`);

    try {
      // Step 1: Load document
      const document = await this.prisma.ragDocument.findUnique({
        where: { id: documentId },
        include: { source: true },
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Step 2: Chunk document
      const chunks = await this.chunkingService.chunkDocument(
        document.id,
        document.content,
        document.metadata?.['type'] || 'text',
        document.title,
        tenantId,
      );

      this.logger.log(`Created ${chunks.length} chunks for document ${documentId}`);

      // Step 3: Save chunks to database
      const savedChunks = await this.saveChunks(chunks, tenantId);
      this.logger.log(`Saved ${savedChunks.length} chunks to database`);

      // Step 4: Generate embeddings
      const embeddingResults = await this.embeddingsService.generateBatchEmbeddings(
        savedChunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          tenantId: chunk.tenant_id,
        })),
      );

      // Step 5: Store embeddings
      await this.embeddingsService.storeEmbeddings(
        embeddingResults.results,
        savedChunks.map((c) => c.id),
        tenantId,
      );

      // Step 6: Update document status
      await this.prisma.ragDocument.update({
        where: { id: documentId },
        data: {
          status: 'embedded',
          metadata: {
            ...document.metadata,
            chunkCount: chunks.length,
            totalTokens: embeddingResults.totalTokens,
            embeddingLatencyMs: embeddingResults.totalLatencyMs,
          },
        },
      });

      const result: EmbeddingPipelineResult = {
        documentId,
        status: 'success',
        chunksCreated: chunks.length,
        embeddingsGenerated: embeddingResults.results.length,
        totalTokens: embeddingResults.totalTokens,
        totalLatencyMs: Date.now() - startTime,
        cached: embeddingResults.cached,
        apiCalls: embeddingResults.apiCalls,
      };

      this.logger.log(
        `Embedding pipeline complete for ${documentId}: ${result.chunksCreated} chunks, ${result.totalTokens} tokens, ${result.totalLatencyMs}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Embedding pipeline failed for ${documentId}: ${error.message}`);

      // Update document status to failed
      await this.prisma.ragDocument.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          metadata: {
            error: error.message,
            failedAt: new Date().toISOString(),
          },
        },
      });

      return {
        documentId,
        status: 'failed',
        error: error.message,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        totalTokens: 0,
        totalLatencyMs: Date.now() - startTime,
        cached: 0,
        apiCalls: 0,
      };
    }
  }

  /**
   * Process multiple documents (batch)
   */
  async processBatchDocuments(
    documentIds: string[],
    tenantId: string,
  ): Promise<BatchEmbeddingPipelineResult> {
    const startTime = Date.now();
    this.logger.log(`Starting batch embedding pipeline for ${documentIds.length} documents`);

    const results: EmbeddingPipelineResult[] = [];

    for (const documentId of documentIds) {
      const result = await this.processDocument(documentId, tenantId);
      results.push(result);
    }

    const successful = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    const batchResult: BatchEmbeddingPipelineResult = {
      documentIds,
      totalDocuments: documentIds.length,
      successful,
      failed,
      results,
      totalLatencyMs: Date.now() - startTime,
    };

    this.logger.log(
      `Batch complete: ${successful}/${documentIds.length} successful, ${failed} failed, ${batchResult.totalLatencyMs}ms`,
    );

    return batchResult;
  }

  /**
   * Process all pending documents
   */
  async processPendingDocuments(tenantId: string): Promise<BatchEmbeddingPipelineResult> {
    const pendingDocuments = await this.prisma.ragDocument.findMany({
      where: {
        tenant_id: tenantId,
        status: 'processed', // Documents that have been chunked but not embedded
      },
      select: { id: true },
    });

    if (pendingDocuments.length === 0) {
      this.logger.log('No pending documents to process');
      return {
        documentIds: [],
        totalDocuments: 0,
        successful: 0,
        failed: 0,
        results: [],
        totalLatencyMs: 0,
      };
    }

    const documentIds = pendingDocuments.map((d) => d.id);
    return this.processBatchDocuments(documentIds, tenantId);
  }

  /**
   * Save chunks to database
   */
  private async saveChunks(
    chunks: { documentId: string; tenantId: string; content: string; metadata: any; chunkIndex: number; totalChunks: number }[],
    tenantId: string,
  ): Promise<any[]> {
    const savedChunks = await this.prisma.ragChunk.createMany({
      data: chunks.map((chunk) => ({
        tenant_id: tenantId,
        document_id: chunk.documentId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        metadata: chunk.metadata,
        token_count: chunk.metadata.tokenCount || 0,
      })),
      skipDuplicates: true,
    });

    // Retrieve saved chunks
    return this.prisma.ragChunk.findMany({
      where: {
        document_id: chunks[0].documentId,
        tenant_id: tenantId,
      },
      orderBy: { chunk_index: 'asc' },
    });
  }

  /**
   * Re-generate embeddings for a document
   */
  async regenerateEmbeddings(documentId: string, tenantId: string): Promise<EmbeddingPipelineResult> {
    this.logger.log(`Regenerating embeddings for document ${documentId}`);

    // Delete existing embeddings
    await this.prisma.ragChunk.updateMany({
      where: {
        document_id: documentId,
        tenant_id: tenantId,
      },
      data: {
        embedding: null,
      },
    });

    // Re-process document
    return this.processDocument(documentId, tenantId);
  }
}

/**
 * Embedding pipeline result
 */
export interface EmbeddingPipelineResult {
  documentId: string;
  status: 'success' | 'failed';
  error?: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  totalTokens: number;
  totalLatencyMs: number;
  cached: number;
  apiCalls: number;
}

/**
 * Batch embedding pipeline result
 */
export interface BatchEmbeddingPipelineResult {
  documentIds: string[];
  totalDocuments: number;
  successful: number;
  failed: number;
  results: EmbeddingPipelineResult[];
  totalLatencyMs: number;
}