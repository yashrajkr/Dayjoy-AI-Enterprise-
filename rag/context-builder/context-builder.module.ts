import { Module } from '@nestjs/common';
import { ContextBuilderService } from './context-builder.service';

/**
 * Context Builder module.
 *
 * Provides {@link ContextBuilderService} — assembles retrieved chunks +
 * conversation history + long-term memories + customer profile into a
 * single `BuiltContext` payload for the prompt builder.
 *
 * Depends on {@link RetrievalService} (provided at the `RagModule` level,
 * NOT imported here — `RagModule` provides it for all RAG sub-modules).
 */
@Module({
  providers: [ContextBuilderService],
  exports: [ContextBuilderService],
})
export class ContextBuilderModule {}
