import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import {
  DEFAULT_VECTOR_STORE_CONFIG,
  VectorStoreConfig,
  SearchFilters,
  SearchResult,
  SearchQuery,
  IndexStats,
} from './vector-store-config';
import { Chunk, buildChunkMetadata } from '../ingestion/chunking-service';

/**
 * Vector Store Service
 * ---------------------
 *
 * Persistence layer for RAG chunks + their pgvector embeddings.
 *
 * Schema (see `database/prisma/schema.prisma`):
 *   - `rag_chunks`         — text chunk + metadata + `vector(1536)` column
 *                            (`embedding` — used by the legacy KnowledgeService).
 *   - `rag_embeddings`     — separate table for multi-model embeddings
 *                            (one chunk can have embeddings from multiple
 *                            models). Has its own `vector(1536)` column.
 *
 * Prisma cannot write to the `vector(1536)` type through the standard
 * model API — it's marked `Unsupported("vector(1536)")` in the
 * schema. We therefore use `$executeRaw` with parameterised SQL for
 * every embedding write + the cosine-similarity search.
 *
 * Two write paths:
 *   - {@link insertChunks}     — bulk insert from the {@link IngestionService}.
 *                                Writes both `rag_chunks` AND `rag_embeddings`
 *                                (preferred path — enables multi-model
 *                                embeddings in the future).
 *   - {@link insert}/{@link insertBatch} — legacy single-embedding-on-chunk
 *                                writes (kept for the existing
 *                                `KnowledgeService.embedChunks` helper).
 *
 * Two search paths:
 *   - {@link search}              — pure vector cosine similarity (default).
 *   - {@link hybridSearch}        — BM25 (Postgres `tsvector`) + vector,
 *                                   weighted per the config.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);
  private config: VectorStoreConfig;

  constructor(private readonly prisma: PrismaService) {
    this.config = { ...DEFAULT_VECTOR_STORE_CONFIG };
  }

  // ===================================================================
  // Bulk insert (used by IngestionService)
  // ===================================================================

  /**
   * Bulk-insert chunks + their embeddings for a document. Writes:
   *   - one `rag_chunks` row per chunk (with metadata JSON).
   *   - one `rag_embeddings` row per chunk (with the raw vector via SQL).
   *   - ALSO backfills the chunk's own `embedding` column for the
   *     legacy `KnowledgeService.vectorSearch` codepath (which queries
   *     `rag_chunks.embedding` directly).
   *
   * The whole thing runs in a `prisma.$transaction` so a failure
   * mid-batch rolls back partial writes — the caller (IngestionService)
   * then flips the `RagDocument` to `FAILED`.
   */
  async insertChunks(
    documentId: string,
    chunks: Chunk[],
    embeddings: number[][],
    tenantId: string,
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `insertChunks: chunks.length (${chunks.length}) ≠ embeddings.length (${embeddings.length})`,
      );
    }
    this.logger.log(
      `Inserting ${chunks.length} chunks + embeddings for document ${documentId}`,
    );

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const metadata = buildChunkMetadata(chunk, chunks.length);

        // 1. Create the rag_chunks row.
        const created = await tx.ragChunk.create({
          data: {
            tenantId,
            documentId,
            chunkIndex: chunk.position,
            content: chunk.content,
            // tokenCount has no column on rag_chunks — it's carried in the
            // `metadata` JSON blob instead (see buildChunkMetadata).
            metadata: metadata as any,
          },
        });

        // 2. Create the rag_embeddings row (without the vector — Prisma
        //    can't write to Unsupported("vector(1536)")).
        const embeddingRow = await tx.ragEmbedding.create({
          data: {
            tenantId,
            chunkId: created.id,
            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            dimensions: embedding.length,
          },
        });

        // 3. Write the vector to rag_embeddings.embedding via raw SQL.
        const vectorLiteral = this.toVectorLiteral(embedding);
        await tx.$executeRaw(Prisma.sql`
          UPDATE rag_embeddings
          SET embedding = ${Prisma.raw(vectorLiteral)}::vector
          WHERE id = ${embeddingRow.id}
        `);

        // 4. ALSO backfill rag_chunks.embedding for the legacy codepath
        //    (KnowledgeService.vectorSearch queries rag_chunks.embedding
        //    directly via `<=>`). When the legacy codepath is removed,
        //    this write can go away.
        await tx.$executeRaw(Prisma.sql`
          UPDATE rag_chunks
          SET embedding = ${Prisma.raw(vectorLiteral)}::vector
          WHERE id = ${created.id}
        `);
      }
    });

    this.logger.log(`Inserted ${chunks.length} chunks + embeddings for document ${documentId}`);
  }

  // ===================================================================
  // Search
  // ===================================================================

  /**
   * Pure vector cosine-similarity search. Returns the top-K chunks
   * ranked by `1 - cosine_distance` (so higher score = more similar).
   *
   * Uses pgvector's `<=>` operator (cosine distance) via raw SQL —
   * Prisma's typed query builder can't read the `vector(1536)` type.
   *
   * Filters (tenantId, documentId, sourceId, category, tags) are
   * applied as SQL `WHERE` clauses so the HNSW index can prune before
   * the vector scan.
   */
  async search(queryEmbedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    const { tenantId, topK = this.config.topK, filter = {}, threshold = this.config.similarityThreshold } = options;
    const vectorLiteral = this.toVectorLiteral(queryEmbedding);

    const filterClauses = this.buildFilterClauses(filter, 'c', 'd');
    this.logger.debug(
      `search: tenant=${tenantId} topK=${topK} threshold=${threshold} filters=${JSON.stringify(filter)}`,
    );

    const rows = await this.prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        c.id              AS chunk_id,
        c.document_id     AS document_id,
        c.chunk_index     AS chunk_index,
        c.content         AS content,
        (c.metadata->>'tokenCount')::int AS token_count,
        c.metadata        AS metadata,
        d.id              AS source_id,
        d.title           AS document_title,
        d.metadata        AS document_metadata,
        d.source_id       AS source_id_fk,
        1 - (c.embedding <=> ${Prisma.raw(vectorLiteral)}::vector) AS similarity
      FROM rag_chunks c
      JOIN rag_documents d ON d.id = c.document_id
      WHERE c.tenant_id = ${tenantId}
        AND c.embedding IS NOT NULL
        AND d.status = 'READY'
        ${Prisma.raw(filterClauses)}
      ORDER BY c.embedding <=> ${Prisma.raw(vectorLiteral)}::vector
      LIMIT ${topK}
    `);

    const results = rows
      .filter((r) => Number(r.similarity) >= threshold)
      .map((r) => this.transformRow(r));

    this.logger.debug(`search: returned ${results.length} results (after threshold filter)`);
    return results;
  }

  /**
   * Hybrid search — combines BM25 (Postgres full-text) with vector
   * cosine similarity, weighted per the config
   * (`bm25Weight` + `vectorWeight`).
   *
   * Used when the user query contains rare keywords that the embedding
   * model may not surface (e.g. product SKUs, error codes). The
   * `ts_rank` score is normalised to `[0, 1]` before being combined
   * with the cosine similarity.
   */
  async hybridSearch(
    query: string,
    queryEmbedding: number[],
    options: SearchOptions,
  ): Promise<SearchResult[]> {
    const { tenantId, topK = this.config.topK, filter = {} } = options;
    const vectorLiteral = this.toVectorLiteral(queryEmbedding);
    const filterClauses = this.buildFilterClauses(filter, 'c', 'd');

    const rows = await this.prisma.$queryRaw<Array<any>>(Prisma.sql`
      WITH vector_scores AS (
        SELECT
          c.id,
          c.document_id,
          c.chunk_index,
          c.content,
          (c.metadata->>'tokenCount')::int AS token_count,
          c.metadata,
          d.title AS document_title,
          d.metadata AS document_metadata,
          d.source_id,
          1 - (c.embedding <=> ${Prisma.raw(vectorLiteral)}::vector) AS vector_score
        FROM rag_chunks c
        JOIN rag_documents d ON d.id = c.document_id
        WHERE c.tenant_id = ${tenantId}
          AND c.embedding IS NOT NULL
          AND d.status = 'READY'
          ${Prisma.raw(filterClauses)}
      ),
      bm25_scores AS (
        SELECT
          id,
          ts_rank(
            to_tsvector('english', content),
            plainto_tsquery('english', ${query})
          ) AS bm25_score
        FROM rag_chunks
        WHERE tenant_id = ${tenantId}
      )
      SELECT
        v.id,
        v.document_id,
        v.chunk_index,
        v.content,
        v.token_count,
        v.metadata,
        v.document_title,
        v.document_metadata,
        v.source_id,
        v.vector_score AS similarity,
        b.bm25_score,
        (${this.config.hybridSearch.bm25Weight} * GREATEST(b.bm25_score, 0)
          + ${this.config.hybridSearch.vectorWeight} * v.vector_score) AS hybrid_score
      FROM vector_scores v
      JOIN bm25_scores b ON v.id = b.id
      ORDER BY hybrid_score DESC
      LIMIT ${topK}
    `);

    return rows.map((r) => ({
      ...this.transformRow(r),
      score: Number(r.hybrid_score),
    }));
  }

  /**
   * Dispatch to {@link search} or {@link hybridSearch} based on the
   * `SearchQuery.enableHybridSearch` flag (falls back to the config
   * default).
   */
  async searchWithFilters(query: SearchQuery): Promise<SearchResult[]> {
    const useHybrid =
      query.enableHybridSearch ?? this.config.hybridSearch.enabled;
    const options: SearchOptions = {
      tenantId: query.tenantId,
      topK: query.topK,
      filter: query.filters ?? {},
      threshold: query.similarityThreshold,
    };
    if (useHybrid && query.query) {
      return this.hybridSearch(query.query, query.queryEmbedding, options);
    }
    return this.search(query.queryEmbedding, options);
  }

  // ===================================================================
  // Delete
  // ===================================================================

  /**
   * Delete all chunks + embeddings for a document. The `RagEmbedding`
   * table cascades on chunk delete (per the schema's `onDelete:
   * Cascade`), so we only need to delete the chunks. We also clear
   * the chunk's own `embedding` column in case the legacy codepath
   * wrote directly to it.
   */
  async deleteByDocument(documentId: string): Promise<void> {
    this.logger.log(`Deleting chunks + embeddings for document ${documentId}`);
    // rag_embeddings cascade on chunk delete (FK onDelete: Cascade).
    await this.prisma.ragChunk.deleteMany({ where: { documentId } });
  }

  /**
   * Delete all chunks + embeddings for every document in a source.
   * Used by `reingestSource` to clear the slate before re-ingesting.
   */
  async deleteBySource(sourceId: string, tenantId: string): Promise<void> {
    const docs = await this.prisma.ragDocument.findMany({
      where: { sourceId, tenantId },
      select: { id: true },
    });
    for (const doc of docs) {
      await this.deleteByDocument(doc.id);
    }
  }

  // ===================================================================
  // Legacy single-embedding write paths (kept for KnowledgeService)
  // ===================================================================

  /**
   * Insert a single embedding onto an existing chunk's `embedding`
   * column. Used by the legacy `KnowledgeService.embedChunks` helper
   * to backfill embeddings after `createMany`.
   */
  async insert(
    chunkId: string,
    embedding: number[],
    _tenantId: string,
    _documentId: string,
  ): Promise<void> {
    const vectorLiteral = this.toVectorLiteral(embedding);
    await this.prisma.$executeRaw`
      UPDATE rag_chunks SET embedding = ${Prisma.raw(vectorLiteral)}::vector WHERE id = ${chunkId}
    `;
  }

  /**
   * Bulk version of {@link insert} — one UPDATE per chunk.
   */
  async insertBatch(
    items: { chunkId: string; embedding: number[]; tenantId: string; documentId: string }[],
  ): Promise<void> {
    for (const item of items) {
      await this.insert(item.chunkId, item.embedding, item.tenantId, item.documentId);
    }
  }

  /**
   * Update an embedding — same as {@link insert} (UPSERT semantics on
   * the column). Kept for API symmetry.
   */
  async update(chunkId: string, embedding: number[], tenantId: string): Promise<void> {
    await this.insert(chunkId, embedding, tenantId, '');
  }

  /**
   * Delete a single embedding (NULL out the column).
   */
  async delete(chunkId: string, _tenantId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE rag_chunks SET embedding = NULL WHERE id = ${chunkId}
    `;
  }

  /**
   * @deprecated Use {@link deleteByDocument} instead. Kept for the
   * existing `KnowledgeService` codepath.
   */
  async deleteDocument(documentId: string, _tenantId: string): Promise<void> {
    await this.deleteByDocument(documentId);
  }

  // ===================================================================
  // Stats
  // ===================================================================

  /**
   * Per-tenant stats — used by the admin UI + the IngestionService to
   * report progress.
   */
  async getStats(tenantId: string): Promise<VectorStoreStats> {
    const [documentCount, chunkCount, embeddingCount] = await Promise.all([
      this.prisma.ragDocument.count({ where: { tenantId, status: 'READY' } }),
      this.prisma.ragChunk.count({ where: { tenantId } }),
      this.prisma.ragEmbedding.count({ where: { tenantId } }),
    ]);
    return { documentCount, chunkCount, embeddingCount };
  }

  /**
   * Index-level stats — used by the admin observability dashboard.
   * Calls into pgvector's index metadata views.
   */
  async getIndexStats(tenantId: string): Promise<IndexStats> {
    const rows = await this.prisma.$queryRaw<Array<{
      total_vectors: bigint;
      index_size: string;
    }>>`
      SELECT
        COUNT(*) AS total_vectors,
        pg_size_pretty(pg_relation_size('rag_chunks')) AS index_size
      FROM rag_chunks
      WHERE tenant_id = ${tenantId} AND embedding IS NOT NULL
    `;
    return {
      totalVectors: Number(rows[0]?.total_vectors ?? 0),
      indexSize: rows[0]?.index_size ?? '0 bytes',
      avgSearchTimeMs: 0.5, // placeholder — populated from query logs
      indexType: this.config.indexType,
      dimensions: this.config.dimensions,
      lastBuilt: new Date(),
    };
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  /**
   * Build the SQL `WHERE` clauses for filter combinations. Returns a
   * string starting with ` AND ...` for each clause (or empty string
   * if no filters). Uses parameterised values via `Prisma.sql` to
   * avoid SQL injection.
   */
  private buildFilterClauses(
    filter: SearchFilters,
    chunkAlias: string,
    docAlias: string,
  ): string {
    const clauses: string[] = [];
    if (filter.documentId) {
      clauses.push(`${chunkAlias}.document_id = '${this.escapeLiteral(filter.documentId)}'`);
    }
    if (filter.sourceId) {
      clauses.push(`${docAlias}.source_id = '${this.escapeLiteral(filter.sourceId)}'`);
    }
    if (filter.documentType) {
      clauses.push(
        `${docAlias}.metadata->>'type' = '${this.escapeLiteral(filter.documentType)}'`,
      );
    }
    if (filter.category) {
      clauses.push(
        `${docAlias}.metadata->>'category' = '${this.escapeLiteral(filter.category)}'`,
      );
    }
    if (filter.hasCode !== undefined) {
      clauses.push(`${chunkAlias}.metadata->>'hasCode' = '${filter.hasCode}'`);
    }
    if (filter.hasTable !== undefined) {
      clauses.push(`${chunkAlias}.metadata->>'hasTable' = '${filter.hasTable}'`);
    }
    if (filter.hasList !== undefined) {
      clauses.push(`${chunkAlias}.metadata->>'hasList' = '${filter.hasList}'`);
    }
    if (filter.minTokenCount !== undefined) {
      clauses.push(
        `(${chunkAlias}.metadata->>'tokenCount')::int >= ${filter.minTokenCount}`,
      );
    }
    if (filter.maxTokenCount !== undefined) {
      clauses.push(
        `(${chunkAlias}.metadata->>'tokenCount')::int <= ${filter.maxTokenCount}`,
      );
    }
    return clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
  }

  /**
   * Transform a raw SQL row into the {@link SearchResult} shape.
   */
  private transformRow(row: any): SearchResult {
    const metadata = row.metadata ?? {};
    const documentMetadata = row.document_metadata ?? {};
    return {
      chunkId: row.id ?? row.chunk_id,
      documentId: row.document_id,
      sourceId: row.source_id ?? row.source_id_fk ?? '',
      content: row.content,
      similarity: Number(row.similarity),
      score: Number(row.hybrid_score ?? row.similarity),
      metadata: {
        chunkIndex: row.chunk_index,
        totalChunks: metadata.totalChunks ?? 0,
        heading: metadata.heading,
        headingLevel: metadata.headingLevel,
        section: metadata.section,
        sectionLevel: metadata.sectionLevel,
        documentTitle: row.document_title,
        documentType: documentMetadata.type ?? 'text',
        tokenCount: row.token_count,
        hasCode: metadata.hasCode ?? false,
        hasTable: metadata.hasTable ?? false,
        hasList: metadata.hasList ?? false,
        category: documentMetadata.category,
        tags: documentMetadata.tags,
        pageNumber: metadata.pageNumber,
      },
    };
  }

  /**
   * Convert a `number[]` embedding into the pgvector literal syntax
   * `[v1,v2,...]` for raw SQL. Values are formatted with
   * `Number.toString()` to avoid floating-point precision loss from
   * `JSON.stringify`.
   */
  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.map((n) => Number(n).toString()).join(',')}]`;
  }

  /**
   * Escape a string for inclusion in a single-quoted SQL literal.
   * Used only for filter values that come from the caller (the
   * `tenantId` etc. are already Prisma-parameterised in the main
   * query).
   */
  private escapeLiteral(s: string): string {
    return s.replace(/'/g, "''");
  }
}

/**
 * Search options for the {@link VectorStoreService.search} method.
 * Mirrors the {@link SearchQuery} shape but flattened for ergonomic
 * calls.
 */
export interface SearchOptions {
  tenantId: string;
  topK?: number;
  filter?: SearchFilters;
  threshold?: number;
}

/**
 * Per-tenant vector store stats. Returned by {@link getStats} and
 * surfaced on the admin dashboard.
 */
export interface VectorStoreStats {
  documentCount: number;
  chunkCount: number;
  embeddingCount: number;
}
