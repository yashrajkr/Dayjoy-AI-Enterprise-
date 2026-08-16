import { Module } from '@nestjs/common';
import { ContextBuilderService } from './context-builder.service';
import { RetrievalService } from '../retriever/retrieval-service';
import { EmbeddingsService } from '../embeddings/embeddings-service';
import { VectorStoreService } from '../vector-store/vector-store-service';

/**
 * Context Builder module.
 *
 * Provides {@link ContextBuilderService} — assembles retrieved chunks +
 * conversation history + long-term memories + customer profile into a
 * single `BuiltContext` payload for the prompt builder.
 *
 * {@link RetrievalService} (and its own `EmbeddingsService` /
 * `VectorStoreService` dependencies) must be declared as providers here
 * too — registering them at the `RagModule` level does NOT make them
 * injectable inside a separately-imported sub-module like this one.
 * (`PrismaService` and the `OPENAI_CLIENT` token don't need to be
 * re-declared — `PrismaModule` and `SharedAiModule` are both `@Global()`.)
 */
@Module({
  providers: [ContextBuilderService, RetrievalService, EmbeddingsService, VectorStoreService],
  exports: [ContextBuilderService],
})
export class ContextBuilderModule {}
