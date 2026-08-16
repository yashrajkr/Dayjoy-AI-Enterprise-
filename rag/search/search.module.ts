import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { RetrievalService } from '../retriever/retrieval-service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';
import { LLMGatewayService } from '../response-pipeline/llm-gateway-service';
import { ResponseProcessingService } from '../response-pipeline/response-processing-service';

/**
 * Search module — public RAG search API.
 *
 * Provides:
 *  - {@link SearchService} — `search()` (one-shot) + `searchStreaming()` (SSE)
 *    + `getHistory()` + `recordFeedback()`.
 *  - {@link SearchController} — REST endpoints under `/api/rag/search`.
 *
 * `SearchService` needs `RetrievalService`, `ContextBuilderService`,
 * `PromptAssemblyService`, `LLMGatewayService` and
 * `ResponseProcessingService` — these must be declared here too
 * (registering them at the `RagModule` level only makes them
 * injectable within `RagModule`'s own scope, not inside a
 * separately-imported sub-module like this one). `RetrievalService`
 * and `ContextBuilderService` in turn need `EmbeddingsService` /
 * `VectorStoreService`, so those are declared here as well.
 *
 * `PrismaService` and the `OPENAI_CLIENT` token don't need to be
 * re-declared — `PrismaModule` and `SharedAiModule` are both `@Global()`.
 */
@Module({
  providers: [
    SearchService,
    RetrievalService,
    EmbeddingsService,
    VectorStoreService,
    ContextBuilderService,
    PromptAssemblyService,
    LLMGatewayService,
    ResponseProcessingService,
  ],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}
