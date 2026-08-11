import { Module } from '@nestjs/common';
import { ResponsePipelineService } from './response-pipeline.service';
import { LLMGatewayService } from './llm-gateway-service';
import { ResponseProcessingService } from './response-processing-service';

/**
 * Response Pipeline module.
 *
 * Provides:
 *  - {@link ResponsePipelineService} — orchestrates retrieve → context →
 *    prompt → LLM → process.
 *  - {@link LLMGatewayService} — multi-provider LLM gateway (moved from
 *    `rag/evaluation/`).
 *  - {@link ResponseProcessingService} — citation extraction,
 *    hallucination detection, confidence scoring (moved from
 *    `rag/evaluation/`).
 *
 * Dependencies (`RetrievalService`, `ContextBuilderService`,
 * `PromptAssemblyService`) are provided at the `RagModule` level — NOT
 * re-declared here to avoid duplicate-provider conflicts when multiple
 * RAG sub-modules are composed together.
 *
 * The `OPENAI_CLIENT` token is `@Global()`-provided by `SharedAiModule`
 * (imported by `RagModule`), so {@link LLMGatewayService} can
 * `@Inject(OPENAI_CLIENT)` without an explicit module import here.
 */
@Module({
  providers: [
    ResponsePipelineService,
    LLMGatewayService,
    ResponseProcessingService,
  ],
  exports: [
    ResponsePipelineService,
    LLMGatewayService,
    ResponseProcessingService,
  ],
})
export class ResponsePipelineModule {}
