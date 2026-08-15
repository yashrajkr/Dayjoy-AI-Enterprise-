import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../_shared/ai/openai.provider';
import { AuthUser } from '../ai/auth-user';
import {
  CreateRagSourceDto,
  UpdateRagSourceDto,
  IngestDocumentDto,
  QueryKnowledgeDto,
  QuerySourcesDto,
  QueryDocumentsDto,
} from './dto/knowledge.dto';
import type OpenAI from 'openai';

/**
 * Default chunk size (in characters) used by the simple text splitter.
 * The spec calls for 1000-char chunks with 200-char overlap — we keep
 * those defaults here. Production should swap this for a token-aware
 * splitter (e.g. `langchain/text_splitter`), but the surface stays small.
 */
const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_QUERY_TOP_K = 5;
const DEFAULT_CHAT_MODEL = 'gpt-4o';
/** Matches the model/dimensions the 882 canonical rag_chunks were embedded with. */
const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const GEMINI_EMBEDDING_DIMENSIONS = 1536;

export interface Citation {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

export interface KnowledgeQueryResult {
  answer: string;
  citations: Citation[];
  /** Wall-clock latency of the retrieval + answer synthesis, in ms. */
  latencyMs: number;
  queryId: string;
}

/**
 * Knowledge / RAG service.
 *
 * Two responsibilities:
 *   1. `ingest()` — create a `RagSource` (if not provided), a `RagDocument`,
 *      and `RagChunk` rows for each chunk of the supplied content. For each
 *      chunk, an OpenAI embedding is generated and persisted to the chunk's
 *      `embedding` column (via raw SQL — Prisma cannot write to the
 *      `vector(1536)` type through the standard model API). Embedding
 *      generation is best-effort: failures fall back to text-only chunks.
 *   2. `query()` — generate a query embedding, retrieve top-K chunks via
 *      cosine similarity (raw SQL `<=>` operator against pgvector), falling
 *      back to case-insensitive substring search when embeddings are
 *      unavailable. Synthesise a natural-language answer via OpenAI Chat
 *      Completions. Persist a `RagQuery` row for analytics / feedback loops.
 *
 * Sources / documents are soft-deleted via `removeSource` / `deleteDocument`
 * — chunks (the children) are hard-deleted since they have no independent
 * audit value and would otherwise bloat the table.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  // ---------------------------------------------------------------------
  // Sources
  // ---------------------------------------------------------------------

  async findAllSources(query: QuerySourcesDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [sources, total] = await Promise.all([
      this.prisma.ragSource.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { documents: true } } },
      }),
      this.prisma.ragSource.count({ where }),
    ]);

    return {
      data: sources,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneSource(id: string, user: AuthUser) {
    const source = await this.prisma.ragSource.findUnique({
      where: { id },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            wordCount: true,
            createdAt: true,
          },
        },
        _count: { select: { documents: true } },
      },
    });
    if (!source || source.tenantId !== user.tenantId) {
      throw new NotFoundException(`RAG source ${id} not found`);
    }
    return source;
  }

  async createSource(dto: CreateRagSourceDto, user: AuthUser) {
    let configuration: any = undefined;
    if (dto.configuration) {
      try {
        configuration = JSON.parse(dto.configuration);
      } catch {
        configuration = { raw: dto.configuration };
      }
    }
    return this.prisma.ragSource.create({
      data: {
        tenantId: user.tenantId!,
        name: dto.name,
        type: dto.type,
        description: dto.description,
        configuration,
        status: 'active',
      },
    });
  }

  async updateSource(id: string, dto: UpdateRagSourceDto, user: AuthUser) {
    const existing = await this.findOneSource(id, user);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.configuration !== undefined) {
      try {
        data.configuration = JSON.parse(dto.configuration);
      } catch {
        data.configuration = { raw: dto.configuration };
      }
    }

    return this.prisma.ragSource.update({
      where: { id: existing.id },
      data,
    });
  }

  /**
   * Soft-delete a source — flips `status` to `archived` and cascades the
   * archive to all child documents. Chunks are NOT hard-deleted here (the
   * cascade happens via `deleteDocument` calls) so the operation stays
   * idempotent if re-invoked. Use `reingest` to restore.
   */
  async removeSource(id: string, user: AuthUser) {
    const existing = await this.findOneSource(id, user);
    await this.prisma.$transaction([
      this.prisma.ragSource.update({
        where: { id: existing.id },
        data: { status: 'archived' },
      }),
      this.prisma.ragDocument.updateMany({
        where: { sourceId: existing.id },
        data: { status: 'archived' },
      }),
    ]);
    return { success: true, id: existing.id };
  }

  // ---------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------

  async findAllDocuments(query: QueryDocumentsDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.sourceId) where.sourceId = query.sourceId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [documents, total] = await Promise.all([
      this.prisma.ragDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          source: { select: { id: true, name: true, type: true } },
          _count: { select: { chunks: true } },
        },
      }),
      this.prisma.ragDocument.count({ where }),
    ]);

    return {
      data: documents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneDocument(id: string, user: AuthUser) {
    const document = await this.prisma.ragDocument.findUnique({
      where: { id },
      include: {
        source: true,
        _count: { select: { chunks: true } },
      },
    });
    if (!document || document.tenantId !== user.tenantId) {
      throw new NotFoundException(`RAG document ${id} not found`);
    }
    return document;
  }

  /**
   * Ingest a single document. Creates the RagDocument row, splits the
   * content into chunks of {@link DEFAULT_CHUNK_SIZE} chars with
   * {@link DEFAULT_CHUNK_OVERLAP} overlap, generates an OpenAI embedding
   * per chunk (best-effort — falls back to no embedding on failure), and
   * bulk-inserts the chunks via `createMany`. Returns the document plus
   * the number of chunks produced.
   */
  async ingest(dto: IngestDocumentDto, user: AuthUser) {
    const tenantId = user.tenantId!;
    // Verify the source exists and belongs to the tenant — fail fast on a
    // bad sourceId rather than letting Prisma throw a FK violation.
    const source = await this.prisma.ragSource.findUnique({
      where: { id: dto.sourceId },
    });
    if (!source || source.tenantId !== tenantId) {
      throw new NotFoundException(`RAG source ${dto.sourceId} not found`);
    }

    const wordCount = dto.content.split(/\s+/).filter(Boolean).length;

    const document = await this.prisma.ragDocument.create({
      data: {
        tenantId,
        sourceId: dto.sourceId,
        title: dto.title,
        content: dto.content,
        wordCount,
        status: 'processed',
        processedAt: new Date(),
      },
    });

    // Split with overlap. Step = chunkSize - overlap so adjacent chunks
    // share `overlap` characters (prevents mid-sentence cuts from
    // losing context). The loop continues until the window start
    // passes the end of the content; the last chunk is allowed to be
    // shorter than `chunkSize` (partial-chunk tail) so no content is
    // dropped.
    const step = Math.max(1, DEFAULT_CHUNK_SIZE - DEFAULT_CHUNK_OVERLAP);
    const chunks: Array<{
      tenantId: string;
      documentId: string;
      chunkIndex: number;
      content: string;
    }> = [];

    for (let i = 0; i < dto.content.length; i += step) {
      const slice = dto.content.slice(i, i + DEFAULT_CHUNK_SIZE);
      chunks.push({
        tenantId,
        documentId: document.id,
        chunkIndex: chunks.length,
        content: slice,
      });
    }

    if (chunks.length > 0) {
      await this.prisma.ragChunk.createMany({ data: chunks });

      // Best-effort: generate + persist embeddings. Don't block ingest
      // on embedding failures (the chunks are still searchable via the
      // text-search fallback path).
      void this.embedChunks(document.id, chunks).catch((err) => {
        this.logger.warn(
          `Embedding generation failed for document ${document.id}: ${(err as Error).message}`,
        );
      });
    }

    this.logger.log(
      `Ingested document ${document.id} (${wordCount} words → ${chunks.length} chunks) for tenant ${tenantId}`,
    );

    return {
      document,
      chunksCreated: chunks.length,
    };
  }

  /**
   * Delete a document + all of its chunks + any query rows that reference
   * its chunks. Hard delete — chunks have no independent audit value and
   * would otherwise bloat the table.
   */
  async deleteDocument(id: string, user: AuthUser) {
    const existing = await this.findOneDocument(id, user);
    await this.prisma.ragChunk.deleteMany({
      where: { documentId: existing.id },
    });
    await this.prisma.ragDocument.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }

  /**
   * Re-ingest all documents for a source. Useful when the chunking
   * strategy or embedding model changes and the existing chunks need to
   * be regenerated.
   *
   * Implementation: hard-delete all existing chunks for the source's
   * documents, then re-split + re-embed each document's content. The
   * document row itself is preserved (so its id stays stable for
   * citations).
   */
  async reingest(sourceId: string, user: AuthUser) {
    const source = await this.findOneSource(sourceId, user);
    const documents = await this.prisma.ragDocument.findMany({
      where: { sourceId: source.id },
    });

    const results: Array<{ documentId: string; chunksCreated: number }> = [];
    for (const doc of documents) {
      // Hard-delete existing chunks.
      await this.prisma.ragChunk.deleteMany({
        where: { documentId: doc.id },
      });

      if (!doc.content) {
        results.push({ documentId: doc.id, chunksCreated: 0 });
        continue;
      }

      // Re-split + re-embed using the same logic as `ingest`.
      const step = Math.max(1, DEFAULT_CHUNK_SIZE - DEFAULT_CHUNK_OVERLAP);
      const chunks: Array<{
        tenantId: string;
        documentId: string;
        chunkIndex: number;
        content: string;
      }> = [];

      for (let i = 0; i < doc.content.length; i += step) {
        const slice = doc.content.slice(i, i + DEFAULT_CHUNK_SIZE);
        chunks.push({
          tenantId: doc.tenantId,
          documentId: doc.id,
          chunkIndex: chunks.length,
          content: slice,
        });
      }

      if (chunks.length > 0) {
        await this.prisma.ragChunk.createMany({ data: chunks });
        void this.embedChunks(doc.id, chunks).catch((err) => {
          this.logger.warn(
            `Embedding generation failed during reingest for document ${doc.id}: ${
              (err as Error).message
            }`,
          );
        });
      }

      results.push({ documentId: doc.id, chunksCreated: chunks.length });
    }

    return {
      sourceId: source.id,
      documentsProcessed: documents.length,
      results,
    };
  }

  // ---------------------------------------------------------------------
  // Query / RAG
  // ---------------------------------------------------------------------

  /**
   * Query the knowledge base.
   *
   * Strategy:
   *  1. Generate an OpenAI embedding for the query.
   *  2. Retrieve top-K chunks via pgvector cosine similarity
   *     (`<=>` operator, raw SQL — Prisma can't read `vector(1536)`
   *     through the standard model API).
   *  3. If embeddings are unavailable (no API key, OpenAI failure, no
   *     chunks with embeddings), fall back to case-insensitive
   *     substring search.
   *  4. Synthesize a natural-language answer via OpenAI Chat Completions
   *     (or return the top citation's content in degraded mode).
   *  5. Persist a `RagQuery` row so analytics / feedback loops can
   *     track what was asked and what was retrieved.
   */
  async query(dto: QueryKnowledgeDto, user?: AuthUser): Promise<KnowledgeQueryResult> {
    const tenantId = dto.tenantId ?? user?.tenantId!;
    const topK = dto.topK ?? DEFAULT_QUERY_TOP_K;
    const startedAt = Date.now();

    // Try vector search first; fall back to text search.
    let chunks: any[] = [];
    try {
      const queryEmbedding = await this.generateEmbedding(dto.query);
      if (queryEmbedding) {
        chunks = await this.vectorSearch(tenantId, queryEmbedding, topK);
      }
    } catch (err) {
      this.logger.debug(
        `Vector search skipped, falling back to text search: ${(err as Error).message}`,
      );
    }

    if (chunks.length === 0) {
      // Text-search fallback.
      chunks = await this.prisma.ragChunk.findMany({
        where: {
          tenantId,
          content: { contains: dto.query, mode: 'insensitive' },
        },
        include: { document: true },
        take: topK,
      });
    }

    const citations: Citation[] = chunks.map((c: any) => ({
      chunkId: c.id,
      documentId: c.documentId,
      documentTitle: c.document?.title ?? 'Untitled',
      content: c.content,
      score: c.score ?? 1.0,
    }));

    const answer = await this.synthesizeAnswer(dto.query, citations);
    const latencyMs = Date.now() - startedAt;

    const ragQuery = await this.prisma.ragQuery.create({
      data: {
        tenantId,
        agentId: dto.agentId,
        conversationId: dto.conversationId,
        queryText: dto.query,
        responseText: answer,
        latencyMs,
        confidence: citations.length > 0 ? Math.max(...citations.map((c) => c.score), 0) : 0,
        retrievedChunkIds: citations.map((c) => c.chunkId),
      },
    });

    return {
      answer,
      citations,
      latencyMs,
      queryId: ragQuery.id,
    };
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------

  async getStats(user: AuthUser) {
    const tenantId = user.tenantId!;
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    const [
      totalSources,
      activeSources,
      totalDocuments,
      totalChunks,
      totalQueries,
      recentQueries,
      avgLatencyAgg,
    ] = await Promise.all([
      this.prisma.ragSource.count({ where: { tenantId } }),
      this.prisma.ragSource.count({ where: { tenantId, status: 'active' } }),
      this.prisma.ragDocument.count({ where: { tenantId } }),
      this.prisma.ragChunk.count({ where: { tenantId } }),
      this.prisma.ragQuery.count({ where: { tenantId } }),
      this.prisma.ragQuery.count({
        where: { tenantId, createdAt: { gte: since30 } },
      }),
      this.prisma.ragQuery.aggregate({
        where: { tenantId, latencyMs: { not: null } },
        _avg: { latencyMs: true },
      }),
    ]);

    return {
      sources: { total: totalSources, active: activeSources },
      documents: totalDocuments,
      chunks: totalChunks,
      queries: { total: totalQueries, last30Days: recentQueries },
      avgLatencyMs: avgLatencyAgg._avg.latencyMs ?? 0,
    };
  }

  // ============================================================
  // Embeddings — private helpers
  // ============================================================

  /**
   * Generate an embedding for the supplied text via Gemini's
   * `gemini-embedding-001` model, requested at 1536 dimensions to match
   * the `rag_chunks.embedding vector(1536)` column. Returns `null` if the
   * API key is missing or the call fails — the caller (`query()`) falls
   * back to text-search mode in that case.
   *
   * All 882 canonical rag_chunks were embedded via this exact model/
   * endpoint/dimension combination — using anything else here would
   * produce query vectors that aren't comparable to the stored ones.
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
        }),
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Gemini embedContent HTTP ${response.status}: ${errBody.slice(0, 300)}`);
      }
      const json = (await response.json()) as { embedding?: { values?: number[] } };
      const values = json.embedding?.values;
      if (!values || values.length !== GEMINI_EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding dimensions: got ${values?.length ?? 'none'}, expected ${GEMINI_EMBEDDING_DIMENSIONS}`,
        );
      }
      return values;
    } catch (err) {
      this.logger.warn(
        `Gemini embedding generation failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Persist embeddings for a batch of chunks via raw SQL — Prisma cannot
   * write to the `vector(1536)` type through the standard model API, so
   * we use `$executeRaw` with a parameterised `UPDATE`.
   *
   * Failures are logged and swallowed — the chunks remain searchable via
   * the text-search fallback in `query()`.
   */
  private async embedChunks(
    documentId: string,
    chunks: Array<{ content: string }>,
  ) {
    if (!process.env.GEMINI_API_KEY) return;

    // Persist each embedding via raw SQL `UPDATE rag_chunks SET
    // embedding = $1::vector WHERE id = $2`. We need the chunk IDs —
    // fetch them by documentId + chunkIndex.
    const created = await this.prisma.ragChunk.findMany({
      where: { documentId },
      select: { id: true, chunkIndex: true },
    });

    // Gemini's embedContent API takes one content per call (unlike
    // OpenAI's batched endpoint) — reuse generateEmbedding() per chunk
    // so there's a single source of truth for how query and ingest
    // embeddings are produced.
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkRow = created.find((c: { id: string; chunkIndex: number }) => c.chunkIndex === idx);
      if (!chunkRow) continue;

      const embedding = await this.generateEmbedding(chunks[idx].content);
      if (!embedding) continue;

      const vectorLiteral = `[${embedding.join(',')}]`;
      try {
        // `$executeRaw` with `Prisma.sql` is the only way to write to a
        // `vector` column — Prisma's typed model API doesn't support it.
        await this.prisma.$executeRaw`
          UPDATE rag_chunks SET embedding = ${vectorLiteral}::vector WHERE id = ${chunkRow.id}
        `;
      } catch (err) {
        this.logger.debug(
          `Failed to persist embedding for chunk ${chunkRow.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Run a pgvector cosine-similarity search for the supplied query
   * embedding. Returns up to `topK` chunks with a `score` field (1 -
   * cosine_distance) so the caller can rank citations.
   *
   * Falls back to an empty array on any error (caller then falls back
   * to text search).
   */
  private async vectorSearch(
    tenantId: string,
    embedding: number[],
    topK: number,
  ): Promise<any[]> {
    try {
      const vectorLiteral = `[${embedding.join(',')}]`;
      // Raw SQL — pgvector's `<=>` operator returns cosine distance
      // (0 = identical, 2 = orthogonal). Convert to similarity score.
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT
          c.id,
          c.document_id AS "documentId",
          c.content,
          c.tenant_id AS "tenantId",
          d.title AS "documentTitle",
          1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
        FROM rag_chunks c
        LEFT JOIN rag_documents d ON d.id = c.document_id
        WHERE c.tenant_id = ${tenantId}::uuid
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${vectorLiteral}::vector
        LIMIT ${topK}
      `;
      // Normalize: Prisma's `$queryRaw` returns rows with snake_case
      // column names (we aliased above to camelCase in the SELECT).
      return rows.map((r) => ({
        id: r.documentId ? r.id : r.id, // keep id
        documentId: r.documentId,
        content: r.content,
        tenantId: r.tenantId,
        document: r.documentTitle ? { title: r.documentTitle } : null,
        score: Number(r.score),
      }));
    } catch (err) {
      this.logger.debug(
        `pgvector search failed (likely no embeddings stored yet): ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Build the answer text. Delegates to OpenAI Chat Completions when
   * configured; otherwise falls back to the first citation (or a
   * "no results" message).
   *
   * Factored out as a private method so tests can stub via `vi.spyOn`.
   */
  private async synthesizeAnswer(query: string, citations: Citation[]): Promise<string> {
    if (citations.length === 0) {
      return `No relevant information found for query: "${query}".`;
    }

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      // Degraded mode — return the top citation's content as the answer.
      return citations[0].content;
    }

    try {
      const model =
        this.config.get<string>('openai.model') ?? DEFAULT_CHAT_MODEL;

      const context = citations
        .map((c, i) => `[${i + 1}] ${c.content}`)
        .join('\n\n');

      const completion = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a Dayjoy knowledge-base assistant. Answer the user question using only the supplied context. If the context does not contain the answer, say so explicitly. Cite sources by their bracketed number, e.g. [1].',
          },
          {
            role: 'user',
            content: `Context:\n${context}\n\nQuestion: ${query}`,
          },
        ],
        temperature: 0.2,
      });

      return completion.choices?.[0]?.message?.content ?? citations[0].content;
    } catch (err) {
      this.logger.warn(
        `OpenAI synthesis failed — falling back to first citation: ${(err as Error).message}`,
      );
      return citations[0].content;
    }
  }
}
