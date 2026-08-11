import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { ArticlesService } from './articles.service';
import { KnowledgeController } from './knowledge.controller';

/**
 * Knowledge / RAG module.
 *
 * Provides:
 *  - {@link KnowledgeService} — RAG sources/documents CRUD + ingest + query
 *    + reingest + stats. Uses the shared `OPENAI_CLIENT` (provided globally
 *    by `SharedAiModule`) for embeddings + chat-completions.
 *  - {@link ArticlesService} — public help-center article CRUD + search.
 *
 * Imported by `AiModule` so `ToolsService` can inject `KnowledgeService`
 * for the `search_knowledge` tool handler.
 */
@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, ArticlesService],
  exports: [KnowledgeService, ArticlesService],
})
export class KnowledgeModule {}
