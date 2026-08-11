import { Module } from '@nestjs/common';
import { PrismaModule } from '../backend/_shared/database/prisma.module';
import { SharedAiModule } from '../backend/_shared/ai/ai.module';

// Agent F's ingestion-side modules (DO NOT touch — owned by Agent F).
import { LoadersModule } from './loaders/loaders.module';
import { ChunkingService } from './ingestion/chunking-service';
import { IngestionService } from './ingestion/ingestion-service';
import { IngestionController } from './ingestion/ingestion.controller';
import { EmbeddingsService } from './embeddings/embeddings-service';
import { VectorStoreService } from './vector-store/vector-store-service';

// Agent G's query-side modules (owned by Agent G).
import { RetrievalService } from './retriever/retrieval-service';
import { RetrievalPipelineService } from './retriever/retrieval-pipeline';
import { ContextBuilderService } from './context-builder/context-builder.service';
import { ContextBuilderModule } from './context-builder/context-builder.module';
import { PromptAssemblyService } from './prompts/prompt-assembly-service';
import { LLMGatewayService } from './response-pipeline/llm-gateway-service';
import { ResponseProcessingService } from './response-pipeline/response-processing-service';
import { ResponsePipelineService } from './response-pipeline/response-pipeline.service';
import { ResponsePipelineModule } from './response-pipeline/response-pipeline.module';
import { SearchService } from './search/search.service';
import { SearchController } from './search/search.controller';
import { SearchModule } from './search/search.module';
import { ConversationMemoryService } from './memory/conversation-memory.service';
import { MemoryModule } from './memory/memory.module';

// Agent H's evaluation + security modules (owned by Agent H).
import { EvaluationService } from './evaluation/evaluation-service';
import { EvaluationModule } from './evaluation/evaluation.module';
import { DocumentPermissionsService } from './security/document-permissions.service';
import { RagSecurityGuard } from './security/rag-security.guard';
import { TenantIsolationInterceptor } from './security/tenant-isolation.interceptor';
import { RagSecurityModule } from './security/security.module';

/**
 * RAG Module
 * ===========
 *
 * Wires every RAG service — ingestion-side (Agent F), query-side
 * (Agent G), and evaluation + security (Agent H) — into the NestJS
 * DI container.
 *
 * ## Ingestion side (Agent F)
 *
 *   - **Loaders** (PDF, DOCX, Markdown, Text, CSV, HTML) + factory —
 *     registered in {@link LoadersModule}.
 *   - **ChunkingService** — token-aware hierarchical / paragraph /
 *     sentence chunking (gpt-tokenizer).
 *   - **EmbeddingsService** — OpenAI `text-embedding-3-*` wrapper
 *     with batch + cache support.
 *   - **VectorStoreService** — pgvector persistence + similarity /
 *     hybrid search (raw SQL for the `vector(1536)` type).
 *   - **IngestionService** — orchestrates the full ingestion pipeline
 *     (load → chunk → embed → store).
 *   - **IngestionController** — REST endpoints under
 *     `/api/rag/ingest/**`.
 *
 * ## Query side (Agent G)
 *
 *   - **RetrievalService** — hybrid retrieval (vector + keyword via RRF)
 *     + cheap keyword-overlap rerank + caching.
 *   - **RetrievalPipelineService** — orchestrates retrieval with
 *     conversation-aware query enhancement + keyword-only fallback.
 *   - **ContextBuilderService** — assembles retrieved chunks +
 *     conversation history + long-term memories + customer profile.
 *   - **PromptAssemblyService** — system + user prompt assembly
 *     (`buildSystemPrompt` / `buildUserPrompt` / `buildMessagesForLLM`).
 *   - **LLMGatewayService** — multi-provider LLM gateway with routing,
 *     fallback, caching, streaming (moved from `rag/evaluation/`).
 *   - **ResponseProcessingService** — citation extraction, hallucination
 *     detection, confidence scoring (moved from `rag/evaluation/`).
 *   - **ResponsePipelineService** — orchestrates the full
 *     retrieve → context → prompt → LLM → process flow.
 *   - **SearchService** + **SearchController** — public RAG search API
 *     (`POST /api/rag/search`, `POST /api/rag/search/stream`,
 *     `GET /api/rag/search/history`,
 *     `POST /api/rag/search/:queryId/feedback`).
 *   - **ConversationMemoryService** — short-term + long-term memory +
 *     summarisation + memory extraction.
 *
 * ## Evaluation + security (Agent H)
 *
 *   - **EvaluationService** + **EvaluationController** — six-metric
 *     RAG evaluation framework (precision, recall, hallucination,
 *     accuracy, latency, citation accuracy) exposed under
 *     `/api/rag/evaluation/**`.
 *   - **DocumentPermissionsService** — per-document role / user /
 *     tenant access control backed by `RagDocument.metadata.restrictions`.
 *   - **RagSecurityGuard** — NestJS guard that enforces document-level
 *     permissions on RAG endpoints (apply with `@UseGuards(JwtAuthGuard,
 *     PermissionsGuard, RagSecurityGuard)`).
 *   - **TenantIsolationInterceptor** — stamps the authenticated user's
 *     `tenantId` onto the request and rejects cross-tenant writes.
 *
 * ## Sub-module composition
 *
 * The query-side and Agent H services are also bundled into standalone
 * sub-modules (`LoadersModule`, `ContextBuilderModule`,
 * `ResponsePipelineModule`, `SearchModule`, `MemoryModule`,
 * `EvaluationModule`, `RagSecurityModule`) so they can be imported
 * individually by feature modules that only need a slice of the RAG
 * stack. The sub-modules declare ONLY their own providers — the
 * cross-cutting services (`RetrievalService`, `EmbeddingsService`,
 * `VectorStoreService`, etc.) are declared here at the `RagModule`
 * level so sub-modules don't re-declare them (which would cause
 * duplicate-provider conflicts).
 *
 * ## Dependencies
 *
 *   - {@link SharedAiModule} — provides the `OPENAI_CLIENT` token
 *     (singleton OpenAI SDK instance). Marked `@Global()` in its own
 *     module, so technically we don't need to import it here, but
 *     being explicit makes the dependency obvious.
 *   - {@link PrismaModule} — provides `PrismaService`. Also `@Global()`.
 *
 * ## Exports
 *
 *   - All ingestion-side services (for `KnowledgeService` to consume).
 *   - All query-side services (for `ConversationsService`,
 *     `KnowledgeService`, and any future feature module that wants to
 *     call the RAG pipeline directly).
 *   - All evaluation + security services (for admin / analytics
 *     modules + per-controller guard / interceptor wiring).
 *   - All sub-modules (so feature modules can import a slice).
 */
@Module({
  imports: [
    // Shared infrastructure.
    SharedAiModule,
    PrismaModule,

    // Ingestion-side sub-module (Agent F).
    LoadersModule,

    // Query-side sub-modules (Agent G).
    ContextBuilderModule,
    ResponsePipelineModule,
    SearchModule,
    MemoryModule,

    // Evaluation + security sub-modules (Agent H).
    EvaluationModule,
    RagSecurityModule,
  ],
  providers: [
    // ---- Ingestion side (Agent F) --------------------------------
    ChunkingService,
    IngestionService,
    EmbeddingsService,
    VectorStoreService,

    // ---- Query side (Agent G) ------------------------------------
    RetrievalService,
    RetrievalPipelineService,
    // ContextBuilderService, PromptAssemblyService, LLMGatewayService,
    // ResponseProcessingService, ResponsePipelineService, SearchService,
    // ConversationMemoryService are provided by their sub-modules
    // (ContextBuilderModule, ResponsePipelineModule, SearchModule,
    // MemoryModule) — but we also re-declare them here so callers that
    // inject `RagModule` directly (without importing the sub-modules)
    // can resolve them. NestJS dedupes by token, so this is safe.
    ContextBuilderService,
    PromptAssemblyService,
    LLMGatewayService,
    ResponseProcessingService,
    ResponsePipelineService,
    SearchService,
    ConversationMemoryService,

    // ---- Evaluation + security (Agent H) -------------------------
    // Same pattern: EvaluationModule + RagSecurityModule already
    // declare + export these, but we re-declare them at the RagModule
    // level so callers that import only RagModule can resolve them
    // without having to also import the sub-modules.
    EvaluationService,
    DocumentPermissionsService,
    RagSecurityGuard,
    TenantIsolationInterceptor,
  ],
  controllers: [IngestionController, SearchController],
  exports: [
    // Ingestion side.
    IngestionService,
    EmbeddingsService,
    VectorStoreService,
    ChunkingService,

    // Query side.
    RetrievalService,
    RetrievalPipelineService,
    ContextBuilderService,
    PromptAssemblyService,
    LLMGatewayService,
    ResponseProcessingService,
    ResponsePipelineService,
    SearchService,
    ConversationMemoryService,

    // Evaluation + security.
    EvaluationService,
    DocumentPermissionsService,
    RagSecurityGuard,
    TenantIsolationInterceptor,

    // Sub-modules (for feature modules that want a slice).
    LoadersModule,
    ContextBuilderModule,
    ResponsePipelineModule,
    SearchModule,
    MemoryModule,
    EvaluationModule,
    RagSecurityModule,
  ],
})
export class RagModule {}
