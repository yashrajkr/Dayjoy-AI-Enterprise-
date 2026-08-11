import { Global, Module } from '@nestjs/common';
import { OpenAiProvider, OPENAI_CLIENT } from './openai.provider';

/**
 * Global AI infrastructure module.
 *
 * Exposes the shared {@link OPENAI_CLIENT} (an `openai` SDK instance) to
 * every feature module that needs to call the OpenAI Chat Completions or
 * Embeddings APIs — currently:
 *
 *  - `AiModule`       — `ConversationsService.sendMessage()` (LLM replies)
 *  - `KnowledgeModule` — `KnowledgeService.ingest()` + `query()` (embeddings + RAG)
 *  - (ToolsService resolves knowledge via `KnowledgeService` and does not call OpenAI directly.)
 *
 * Marked `@Global()` so feature modules can `@Inject(OPENAI_CLIENT)` without
 * each having to import this module — keeps the dependency wiring DRY.
 */
@Global()
@Module({
  providers: [OpenAiProvider],
  exports: [OPENAI_CLIENT],
})
export class SharedAiModule {}
