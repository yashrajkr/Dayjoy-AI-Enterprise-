import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation-service';

/**
 * RAG Evaluation module.
 *
 * Wires the `EvaluationController` + `EvaluationService`. Both Prisma and
 * the shared OpenAI client (`OPENAI_CLIENT`) are provided globally —
 * Prisma by `PrismaModule`, the OpenAI client by `SharedAiModule` — so
 * this module only needs to declare its own providers.
 *
 * Import this module from `app.module.ts` to enable the
 * `/api/rag/evaluation/*` endpoints:
 *
 *   imports: [
 *     ...,
 *     EvaluationModule,
 *   ]
 *
 * Reference: `docs/ai/13_AI_EVALUATION.md`, `docs/ai/16_AI_GOVERNANCE.md`.
 */
@Module({
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
