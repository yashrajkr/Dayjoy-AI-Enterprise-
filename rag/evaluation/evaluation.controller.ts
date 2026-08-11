import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../backend/auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../backend/_shared/security/permissions.guard';
import { CurrentUser } from '../../backend/_shared/common/decorators/current-user.decorator';
import { AuthUser } from '../../backend/ai/auth-user';
import { EvaluationService, EvaluationSuite } from './evaluation-service';

/**
 * RAG Evaluation HTTP controller.
 *
 * Exposes four endpoints under `/api/rag/evaluation` — all require an
 * authenticated user with the `ai:read` permission (so QA engineers,
 * analysts, and admins can run evaluations, but customers / distributors
 * can't peek at evaluation results that might leak retrieved chunks).
 *
 *   POST   /queries/:queryId                — evaluate a single query
 *   POST   /suites/:suiteId/run             — evaluate a batch of queries
 *   GET    /metrics                         — aggregate metrics over time
 *   GET    /dashboard                       — top-line + recent sample
 *
 * The controller is intentionally thin — every bit of business logic lives
 * in `EvaluationService`. It maps HTTP errors onto NestJS exceptions
 * (`NotFoundException` → 404, `BadRequestException` → 400) automatically;
 * the global `AllExceptionsFilter` wraps them in the standard `ApiResponse`
 * envelope.
 *
 * Reference: `docs/ai/13_AI_EVALUATION.md`, `docs/ai/16_AI_GOVERNANCE.md`.
 */
@Controller('api/rag/evaluation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);

  constructor(private readonly evaluationService: EvaluationService) {}

  /**
   * Evaluate a single RAG query.
   *
   * Returns the six core metrics (precision, recall, hallucination,
   * accuracy, latency, citation accuracy) for the query. The query must
   * already have a `responseText` (i.e. the RAG pipeline has finished
   * answering it).
   */
  @Post('queries/:queryId')
  @RequirePermissions('ai:read')
  @HttpCode(200)
  async evaluateQuery(
    @CurrentUser() user: AuthUser,
    @Param('queryId', new ParseUUIDPipe()) queryId: string,
  ) {
    this.logger.log(
      `User ${user.userId} evaluating query ${queryId}`,
    );
    return this.evaluationService.evaluateQuery(queryId, user);
  }

  /**
   * Run an evaluation suite — evaluate every query in `body.queryIds` in
   * parallel and aggregate the results.
   *
   * `suiteId` (URL param) is a caller-supplied label for the run; it's
   * echoed back in the response so callers can correlate runs across
   * invocations. There's no `rag_evaluation_suites` table today — the
   * suite definition lives client-side.
   *
   * Body:
   *   {
   *     "name": "regression-suite-v1",
   *     "queryIds": ["uuid1", "uuid2", ...],
   *     "description": "Optional description"
   *   }
   */
  @Post('suites/:suiteId/run')
  @RequirePermissions('ai:read')
  @HttpCode(200)
  async runSuite(
    @CurrentUser() user: AuthUser,
    @Param('suiteId') suiteId: string,
    @Body() body: RunSuiteBody,
  ) {
    if (!body || !Array.isArray(body.queryIds) || body.queryIds.length === 0) {
      throw new BadRequestException(
        'Body must include a non-empty "queryIds" array',
      );
    }

    const suite: EvaluationSuite = {
      id: suiteId,
      name: body.name ?? suiteId,
      queryIds: body.queryIds,
      description: body.description,
    };

    this.logger.log(
      `User ${user.userId} running suite ${suiteId} (${suite.queryIds.length} queries)`,
    );
    return this.evaluationService.runEvaluationSuite(suite, user);
  }

  /**
   * Aggregate metrics across the tenant within an optional time window.
   *
   * Query params:
   *   - `startDate` — ISO 8601 (inclusive)
   *   - `endDate`   — ISO 8601 (inclusive)
   *
   * Returns counts, latency/confidence averages, feedback distribution,
   * and citation coverage.
   */
  @Get('metrics')
  @RequirePermissions('ai:read')
  async getMetrics(
    @CurrentUser() user: AuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? this.parseIso(startDate, 'startDate') : undefined;
    const end = endDate ? this.parseIso(endDate, 'endDate') : undefined;
    return this.evaluationService.getAggregateMetrics(user, {
      startDate: start,
      endDate: end,
    });
  }

  /**
   * Evaluation dashboard — top-line counts plus a live re-evaluation of
   * the most recent queries.
   *
   * Query params:
   *   - `sampleSize` — number of recent queries to re-evaluate on the fly
   *     (default 10, max 50). Each sample query triggers multiple LLM
   *     calls, so keep this small for interactive use.
   */
  @Get('dashboard')
  @RequirePermissions('ai:read')
  async getDashboard(
    @CurrentUser() user: AuthUser,
    @Query('sampleSize') sampleSize?: string,
  ) {
    const size = sampleSize ? parseInt(sampleSize, 10) : undefined;
    if (sampleSize && (Number.isNaN(size) || size < 1)) {
      throw new BadRequestException('sampleSize must be a positive integer');
    }
    return this.evaluationService.getDashboard(user, { sampleSize: size });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Parse an ISO date string or throw a 400 with the offending field name. */
  private parseIso(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} is not a valid ISO date`);
    }
    return d;
  }
}

/**
 * Body for `POST /api/rag/evaluation/suites/:suiteId/run`.
 */
export class RunSuiteBody {
  /** Human-readable name shown in reports. Defaults to the URL `suiteId`. */
  name?: string;
  /** Optional description. */
  description?: string;
  /** Query IDs to evaluate. Required, non-empty. */
  queryIds!: string[];
}
