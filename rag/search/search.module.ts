import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

/**
 * Search module — public RAG search API.
 *
 * Provides:
 *  - {@link SearchService} — `search()` (one-shot) + `searchStreaming()` (SSE)
 *    + `getHistory()` + `recordFeedback()`.
 *  - {@link SearchController} — REST endpoints under `/api/rag/search`.
 *
 * Dependencies (`RetrievalService`, `ContextBuilderService`,
 * `PromptAssemblyService`, `LLMGatewayService`, `ResponseProcessingService`)
 * are provided at the `RagModule` level — NOT re-declared here to avoid
 * duplicate-provider conflicts.
 */
@Module({
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}
