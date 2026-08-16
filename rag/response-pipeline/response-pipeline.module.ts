import { Module } from '@nestjs/common';
import { ResponsePipelineService } from './response-pipeline.service';
import { LLMGatewayService } from './llm-gateway-service';
import { ResponseProcessingService } from './response-processing-service';
import { RetrievalService } from '../retriever/retrieval-service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { PromptAssemblyService } from '../prompts/prompt-assembly-service';

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
 * `ResponsePipelineService` also needs `RetrievalService`,
 * `ContextBuilderService` and `PromptAssemblyService` — these must be
 * declared here too (registering them at the `RagModule` level only
 * makes them injectable within `RagModule`'s own scope, not inside a
 * separately-imported sub-module like this one). `RetrievalService`
 * and `ContextBuilderService` in turn need `EmbeddingsService` /
 * `VectorStoreService`, so those are declared here as well.
 *
 * `PrismaService` and the `OPENAI_CLIENT` token don't need to be
 * re-declared — `PrismaModule` and `SharedAiModule` are both `@Global()`.
 */
@Module({
  providers: [
    ResponsePipelineService,
    LLMGatewayService,
    ResponseProcessingService,
    RetrievalService,
    EmbeddingsService,
    VectorStoreService,
    ContextBuilderService,
    PromptAssemblyService,
  ],
  exports: [
    ResponsePipelineService,
    LLMGatewayService,
    ResponseProcessingService,
  ],
})
export class ResponsePipelineModule {}
