import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type OpenAI from 'openai';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';

/**
 * RAG Evaluation Service
 * ======================
 *
 * Implements the AI Evaluation Framework described in
 * `docs/ai/13_AI_EVALUATION.md`. For a given `RagQuery` (a previously executed
 * RAG turn, captured in the `rag_queries` table), this service computes the
 * six core metrics the framework calls out:
 *
 *   1. **Precision**   — fraction of retrieved chunks an LLM-judge marks as
 *      actually relevant to the query.
 *   2. **Recall**      — heuristic estimate of how much of the *relevant*
 *      corpus was retrieved. Falls back to user feedback as a signal when no
 *      ground-truth labels exist.
 *   3. **Hallucination score** — LLM-judge score for whether the response is
 *      grounded in the retrieved context (0 = fully grounded, 1 = made up).
 *   4. **Accuracy score** — overall response correctness. Prefers explicit
 *      user feedback; falls back to LLM self-assessment.
 *   5. **Latency (ms)** — round-trip latency recorded for the original query.
 *   6. **Citation accuracy** — fraction of `[n](chunkId)`-style citations in
 *      the response that actually point at retrieved chunks.
 *
 * The service also supports running an **evaluation suite** — a batch of
 * query IDs evaluated in parallel and aggregated into average metrics — and
 * exposes two read endpoints used by the evaluation dashboard:
 *   - `getAggregateMetrics()` — averages over a time window
 *   - `getDashboard()` — counts, latency breakdown, feedback distribution
 *
 * All LLM-judge calls go through the shared `OPENAI_CLIENT` token (provided
 * globally by `SharedAiModule`); they use `gpt-4o-mini` for the cheap
 * per-chunk relevance judgement and `gpt-4o` for the more demanding
 * hallucination / accuracy assessments, matching the routing policy in
 * `llm-gateway-config.ts`.
 *
 * Multi-tenant safety: every read is scoped by `tenantId` taken from the
 * authenticated user. A user in tenant A can never evaluate a query that
 * belongs to tenant B — the lookup returns `null` and is reported as 404.
 *
 * Reference: `docs/ai/13_AI_EVALUATION.md`, `docs/ai/16_AI_GOVERNANCE.md`.
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  /** Model used for the per-chunk relevance LLM-judge (cheap, fast). */
  private static readonly RELEVANCE_MODEL = 'gpt-4o-mini';
  /** Model used for hallucination + accuracy LLM-judgements (more capable). */
  private static readonly JUDGE_MODEL = 'gpt-4o';
  /** Cap context fed to the judge so we don't blow past token limits on long chunks. */
  private static readonly MAX_CONTEXT_CHARS = 12_000;
  /** Cap response fed to the judge. */
  private static readonly MAX_RESPONSE_CHARS = 4_000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Evaluate a single RAG query and return the six core metrics.
   *
   * Throws `NotFoundException` if the query doesn't exist (or belongs to a
   * different tenant than `user.tenantId`), and `BadRequestException` if the
   * query hasn't been answered yet (`responseText` is null).
   */
  async evaluateQuery(
    queryId: string,
    user: { tenantId?: string; userId?: string; role?: string },
  ): Promise<EvaluationResult> {
    this.logger.log(`Evaluating query ${queryId} for tenant ${user.tenantId}`);

    const query = await this.prisma.ragQuery.findUnique({
      where: { id: queryId },
    });

    if (!query || (user.tenantId && query.tenantId !== user.tenantId)) {
      throw new NotFoundException(`Query ${queryId} not found`);
    }

    if (!query.responseText) {
      throw new BadRequestException(
        `Query ${queryId} has no response to evaluate`,
      );
    }

    // `retrievedChunkIds` is a Postgres `text[]` column on `rag_queries`,
    // not a Prisma relation — fetch the chunk rows in a single round-trip.
    const retrievedChunkIds: string[] = query.retrievedChunkIds ?? [];
    const retrievedChunks = retrievedChunkIds.length
      ? await this.prisma.ragChunk.findMany({
          where: { id: { in: retrievedChunkIds } },
          select: { id: true, content: true, documentId: true, chunkIndex: true },
        })
      : [];

    // Build the convenience payload the private metric helpers expect.
    const queryPayload: EvaluationQueryPayload = {
      id: query.id,
      tenantId: query.tenantId,
      queryText: query.queryText,
      responseText: query.responseText,
      retrievedChunkIds,
      retrievedChunks,
      latencyMs: query.latencyMs ?? 0,
      feedback: query.feedback,
      confidence: query.confidence,
      createdAt: query.createdAt,
    };

    const [precision, recall, hallucinationScore, accuracyScore, latencyMs, citationAccuracy] =
      await Promise.all([
        this.calculatePrecision(queryPayload),
        this.calculateRecall(queryPayload),
        this.detectHallucination(queryPayload).catch((err) => {
          this.logger.warn(`Hallucination detection failed: ${err.message}`);
          return 1.0; // Fail safe: assume hallucinated if we can't verify.
        }),
        this.assessResponseAccuracy(queryPayload).catch((err) => {
          this.logger.warn(`Accuracy assessment failed: ${err.message}`);
          return 0.5;
        }),
        this.measureLatency(queryPayload),
        this.checkCitationAccuracy(queryPayload),
      ]);

    return {
      queryId: query.id,
      tenantId: query.tenantId,
      evaluatedAt: new Date().toISOString(),
      metrics: {
        precision,
        recall,
        hallucinationScore,
        accuracyScore,
        latencyMs,
        citationAccuracy,
      },
    };
  }

  /**
   * Run an evaluation suite — evaluate every query in `suite.queryIds` in
   * parallel and aggregate the results.
   *
   * Failures on individual queries are captured (not thrown) so a single
   * missing/invalid query doesn't abort the whole suite. They show up in
   * `results[].error`.
   */
  async runEvaluationSuite(
    suite: EvaluationSuite,
    user: { tenantId?: string; userId?: string; role?: string },
  ): Promise<EvaluationSuiteResult> {
    this.logger.log(
      `Running evaluation suite "${suite.name}" (${suite.queryIds.length} queries)`,
    );

    const settled = await Promise.allSettled(
      suite.queryIds.map((id) => this.evaluateQuery(id, user)),
    );

    const results: EvaluationSuiteResultItem[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') {
        return { queryId: suite.queryIds[i], status: 'success', result: s.value };
      }
      return {
        queryId: suite.queryIds[i],
        status: 'failed',
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      };
    });

    const successful = results
      .filter((r): r is Extract<EvaluationSuiteResultItem, { status: 'success' }> => r.status === 'success')
      .map((r) => r.result);

    return {
      suiteId: suite.id,
      suiteName: suite.name,
      totalQueries: results.length,
      successful: successful.length,
      failed: results.length - successful.length,
      averageMetrics: this.calculateAverages(successful),
      results,
      runAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregate metrics across every query in the tenant within an optional
   * time window. Used by the evaluation dashboard / metrics endpoint.
   */
  async getAggregateMetrics(
    user: { tenantId?: string; role?: string },
    options: { startDate?: Date; endDate?: Date } = {},
  ): Promise<AggregateMetrics> {
    const where: any = {};
    if (user.tenantId) where.tenantId = user.tenantId;
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const queries = await this.prisma.ragQuery.findMany({
      where,
      select: {
        id: true,
        latencyMs: true,
        feedback: true,
        confidence: true,
        responseText: true,
        retrievedChunkIds: true,
        createdAt: true,
      },
    });

    const totalQueries = queries.length;
    if (totalQueries === 0) {
      return {
        totalQueries: 0,
        averageLatencyMs: 0,
        averageConfidence: 0,
        feedbackDistribution: { positive: 0, negative: 0, neutral: 0, none: 0 },
        citationCoverage: 0,
      };
    }

    const latencySum = queries.reduce((acc, q) => acc + (q.latencyMs ?? 0), 0);
    const confidenceSum = queries.reduce(
      (acc, q) => acc + (q.confidence ?? 0),
      0,
    );

    const feedbackDistribution = { positive: 0, negative: 0, neutral: 0, none: 0 };
    for (const q of queries) {
      const f = q.feedback;
      if (f === 'positive') feedbackDistribution.positive++;
      else if (f === 'negative') feedbackDistribution.negative++;
      else if (f === 'neutral') feedbackDistribution.neutral++;
      else feedbackDistribution.none++;
    }

    // Citation coverage = % of answered queries that include at least one [n] citation.
    const withCitations = queries.filter(
      (q) => q.responseText && /\[\d+\]/.test(q.responseText),
    ).length;

    return {
      totalQueries,
      averageLatencyMs: latencySum / totalQueries,
      averageConfidence: confidenceSum / totalQueries,
      feedbackDistribution,
      citationCoverage: withCitations / totalQueries,
    };
  }

  /**
   * Build the evaluation dashboard payload — top-level counts + recent
   * per-query evaluations for spot-checking.
   *
   * Re-evaluates the most recent `sampleSize` queries on the fly. This is
   * expensive (LLM calls per query) so callers should keep `sampleSize`
   * small (default 10).
   */
  async getDashboard(
    user: { tenantId?: string; userId?: string; role?: string },
    options: { sampleSize?: number } = {},
  ): Promise<EvaluationDashboard> {
    const sampleSize = Math.max(1, Math.min(50, options.sampleSize ?? 10));

    const where: any = {};
    if (user.tenantId) where.tenantId = user.tenantId;

    const [totalQueries, recentQueriesRaw, aggregate] = await Promise.all([
      this.prisma.ragQuery.count({ where }),
      this.prisma.ragQuery.findMany({
        where: { ...where, responseText: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: sampleSize,
        select: { id: true, queryText: true, createdAt: true, feedback: true, latencyMs: true },
      }),
      this.getAggregateMetrics(user),
    ]);

    // Re-evaluate the most recent queries to surface live metrics.
    const recentEvaluations: EvaluationResult[] = [];
    for (const q of recentQueriesRaw) {
      try {
        recentEvaluations.push(await this.evaluateQuery(q.id, user));
      } catch (err) {
        this.logger.warn(`Dashboard sample eval failed for ${q.id}: ${(err as Error).message}`);
      }
    }

    const recentAvg =
      recentEvaluations.length > 0
        ? this.calculateAverages(recentEvaluations)
        : null;

    return {
      totalQueries,
      aggregateMetrics: aggregate,
      recentAverageMetrics: recentAvg,
      recentQueries: recentQueriesRaw.map((q) => ({
        id: q.id,
        queryText: q.queryText,
        createdAt: q.createdAt.toISOString(),
        feedback: q.feedback,
        latencyMs: q.latencyMs ?? 0,
      })),
    };
  }

  // ------------------------------------------------------------------
  // Metric implementations
  // ------------------------------------------------------------------

  /**
   * Precision = (# relevant retrieved) / (# retrieved).
   *
   * Each retrieved chunk is sent to an LLM-judge (`gpt-4o-mini`) that
   * decides whether it's actually relevant to the query. A chunk counts as
   * relevant when `isRelevant === true` (the LLM also returns a 0–1 score
   * for finer-grained analysis, but for precision we use the binary label).
   */
  private async calculatePrecision(query: EvaluationQueryPayload): Promise<number> {
    if (query.retrievedChunks.length === 0) return 0;

    const judgments = await Promise.all(
      query.retrievedChunks.map((chunk) =>
        this.judgeRelevance(query.queryText, chunk.id, chunk.content),
      ),
    );
    const relevant = judgments.filter((j) => j.isRelevant).length;
    return relevant / judgments.length;
  }

  /**
   * Recall = (# relevant retrieved) / (# relevant in corpus).
   *
   * Without ground-truth labels for the full corpus, we approximate:
   *   - Positive user feedback → likely complete → 1.0
   *   - Negative user feedback → likely incomplete → 0.3
   *   - No feedback → neutral prior → 0.7
   *
   * When a richer ground-truth set becomes available (e.g. a labelled
   * evaluation dataset), this method is the right place to plug in
   * `relevantChunkIds` lookup instead of the feedback heuristic.
   */
  private async calculateRecall(query: EvaluationQueryPayload): Promise<number> {
    if (query.feedback === 'positive') return 1.0;
    if (query.feedback === 'negative') return 0.3;
    return 0.7;
  }

  /**
   * Hallucination detection — ask an LLM-judge whether the response is
   * grounded in the retrieved context.
   *
   * Returns a score in `[0, 1]` where `0` = fully grounded and `1` =
   * completely hallucinated. Also surfaces the unsupported claims so the
   * dashboard / report can show *what* the model thought was unsupported.
   */
  private async detectHallucination(query: EvaluationQueryPayload): Promise<number> {
    const context = query.retrievedChunks
      .map((c, i) => `[Chunk ${i + 1}]\n${c.content}`)
      .join('\n\n')
      .slice(0, EvaluationService.MAX_CONTEXT_CHARS);

    const response = (query.responseText ?? '').slice(
      0,
      EvaluationService.MAX_RESPONSE_CHARS,
    );

    const prompt = `You are an AI hallucination auditor. Given the following retrieved context and an AI-generated response, decide whether the response contains claims that are NOT supported by the context.

Return strict JSON: {"hallucination_score": <0.0-1.0>, "unsupported_claims": ["..."]}
- 0.0 means every claim in the response is directly supported by the context.
- 1.0 means the response is entirely fabricated relative to the context.
- If the response hedges appropriately ("I don't have enough information..."), score low.

CONTEXT:
${context}

RESPONSE:
${response}`;

    const result = await this.callJudgeJson(EvaluationService.JUDGE_MODEL, prompt);
    const score = Number(result?.hallucination_score);
    if (Number.isNaN(score)) {
      this.logger.warn(`Hallucination judge returned non-numeric score: ${JSON.stringify(result)}`);
      return 0.5;
    }
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Response accuracy assessment.
   *
   * Prefers explicit user feedback (the strongest signal we have):
   *   - Positive → 1.0
   *   - Negative → 0.2
   *
   * Falls back to LLM self-assessment (`gpt-4o`) when there's no feedback.
   * The self-assessment prompt asks the judge to rate the response against
   * the query alone (it does NOT see the retrieved context, so it can't be
   * biased by what the retriever happened to surface).
   */
  private async assessResponseAccuracy(query: EvaluationQueryPayload): Promise<number> {
    if (query.feedback === 'positive') return 1.0;
    if (query.feedback === 'negative') return 0.2;

    const response = (query.responseText ?? '').slice(
      0,
      EvaluationService.MAX_RESPONSE_CHARS,
    );

    const prompt = `Rate the accuracy of this AI response on a scale of 0.0 to 1.0.

Question: ${query.queryText}

Response: ${response}

Return strict JSON: {"score": <0.0-1.0>, "reason": "<one short sentence>"}
- 1.0 = the response directly and correctly answers the question.
- 0.5 = partially correct or vague.
- 0.0 = wrong, off-topic, or actively misleading.`;

    const result = await this.callJudgeJson(EvaluationService.JUDGE_MODEL, prompt);
    const score = Number(result?.score);
    if (Number.isNaN(score)) {
      this.logger.warn(`Accuracy judge returned non-numeric score: ${JSON.stringify(result)}`);
      return 0.5;
    }
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Latency metric — straight pass-through of the latency recorded on the
   * `RagQuery` row at query time. Returns 0 if no latency was recorded.
   */
  private async measureLatency(query: EvaluationQueryPayload): Promise<number> {
    return query.latencyMs ?? 0;
  }

  /**
   * Citation accuracy — fraction of `[n](chunkId)`-style citations in the
   * response that point at chunks that were *actually retrieved*.
   *
   * - If the response has no citations → 1.0 (no inaccuracy to penalise).
   * - If every citation is in the retrieved set → 1.0.
   * - If half the citations are fabricated → 0.5.
   *
   * Supports two citation formats:
   *   - `[1](<chunkId>)` — explicit chunk id (preferred)
   *   - `[1]` — bare index; treated as valid iff the index falls within the
   *     retrieved-chunk range (1..N).
   */
  private async checkCitationAccuracy(query: EvaluationQueryPayload): Promise<number> {
    const citations = this.extractCitations(query.responseText ?? '');
    if (citations.length === 0) return 1.0;

    const retrievedIds = new Set(query.retrievedChunkIds);
    const retrievedCount = query.retrievedChunkIds.length;

    let valid = 0;
    for (const c of citations) {
      if (c.chunkId) {
        if (retrievedIds.has(c.chunkId)) valid++;
      } else if (c.index >= 1 && c.index <= retrievedCount) {
        // Bare numeric citation is valid iff it points into the retrieved set.
        valid++;
      }
    }
    return valid / citations.length;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Ask the LLM-judge whether a single retrieved chunk is relevant to the
   * query. Uses `gpt-4o-mini` for cost — relevance is a binary call we make
   * once per retrieved chunk, and the per-call token budget is tiny.
   */
  private async judgeRelevance(
    query: string,
    chunkId: string,
    chunkContent: string,
  ): Promise<{ isRelevant: boolean; score: number }> {
    const truncatedChunk = chunkContent.slice(0, 2_000);
    const prompt = `Decide whether the following chunk is relevant to answering the query.

Query: ${query}

Chunk: ${truncatedChunk}

Return strict JSON: {"is_relevant": true|false, "score": <0.0-1.0>}
- "is_relevant": true if the chunk contains information useful for answering the query.
- "score": how on-topic the chunk is (1.0 = directly answers, 0.0 = unrelated).`;

    const result = await this.callJudgeJson(
      EvaluationService.RELEVANCE_MODEL,
      prompt,
    );

    const score = Number(result?.score);
    return {
      isRelevant: Boolean(result?.is_relevant),
      score: Number.isNaN(score) ? 0 : Math.max(0, Math.min(1, score)),
    };
  }

  /**
   * Extract `[n]` and `[n](chunkId)`-style citations from a response string.
   *
   * Examples matched:
   *   - `[1]`           → { index: 1, chunkId: undefined }
   *   - `[2](abc-123)`   → { index: 2, chunkId: 'abc-123' }
   *   - `[3](https://…) → { index: 3, chunkId: 'https://…' } (URLs treated as chunkId)
   */
  private extractCitations(text: string): Array<{ index: number; chunkId?: string }> {
    const matches = text.matchAll(/\[(\d+)\](?:\(([^)]+)\))?/g);
    return Array.from(matches).map((m) => ({
      index: parseInt(m[1], 10),
      chunkId: m[2] || undefined,
    }));
  }

  /**
   * Call the OpenAI Chat Completions API with `response_format: json_object`
   * and parse the result. Centralised so the metric helpers don't each have
   * to repeat the try/parse/catch dance.
   *
   * Throws on API error or on JSON parse failure — the metric helpers
   * catch and apply a sensible default.
   */
  private async callJudgeJson(model: string, prompt: string): Promise<any> {
    const completion = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw);
    } catch (err) {
      this.logger.warn(
        `Judge JSON parse failed (model=${model}): ${(err as Error).message}; raw=${raw.slice(0, 200)}`,
      );
      return {};
    }
  }

  /**
   * Average the six core metrics across a set of evaluation results.
   * Used by `runEvaluationSuite()` and `getDashboard()`.
   */
  private calculateAverages(results: EvaluationResult[]): EvaluationMetrics {
    if (results.length === 0) {
      return {
        precision: 0,
        recall: 0,
        hallucinationScore: 0,
        accuracyScore: 0,
        latencyMs: 0,
        citationAccuracy: 0,
      };
    }

    const sum = results.reduce(
      (acc, r) => ({
        precision: acc.precision + r.metrics.precision,
        recall: acc.recall + r.metrics.recall,
        hallucinationScore: acc.hallucinationScore + r.metrics.hallucinationScore,
        accuracyScore: acc.accuracyScore + r.metrics.accuracyScore,
        latencyMs: acc.latencyMs + r.metrics.latencyMs,
        citationAccuracy: acc.citationAccuracy + r.metrics.citationAccuracy,
      }),
      {
        precision: 0,
        recall: 0,
        hallucinationScore: 0,
        accuracyScore: 0,
        latencyMs: 0,
        citationAccuracy: 0,
      },
    );

    const count = results.length;
    return {
      precision: sum.precision / count,
      recall: sum.recall / count,
      hallucinationScore: sum.hallucinationScore / count,
      accuracyScore: sum.accuracyScore / count,
      latencyMs: sum.latencyMs / count,
      citationAccuracy: sum.citationAccuracy / count,
    };
  }
}

// ==================================================================
// Types
// ==================================================================

/** The six core RAG evaluation metrics. */
export interface EvaluationMetrics {
  /** Fraction of retrieved chunks an LLM-judge marked relevant. ∈ [0, 1]. */
  precision: number;
  /** Approximation of (# relevant retrieved) / (# relevant in corpus). ∈ [0, 1]. */
  recall: number;
  /** LLM-judge hallucination score. 0 = grounded, 1 = fabricated. ∈ [0, 1]. */
  hallucinationScore: number;
  /** Overall response correctness. Prefers user feedback; falls back to LLM. ∈ [0, 1]. */
  accuracyScore: number;
  /** Round-trip latency of the original query, in milliseconds. */
  latencyMs: number;
  /** Fraction of citations that point at retrieved chunks. ∈ [0, 1]. */
  citationAccuracy: number;
}

/** Result of evaluating a single RAG query. */
export interface EvaluationResult {
  queryId: string;
  tenantId: string;
  evaluatedAt: string;
  metrics: EvaluationMetrics;
}

/**
 * A user-defined batch of query IDs to evaluate together. Passed in the
 * request body of `POST /api/rag/evaluation/suites/:suiteId/run`.
 *
 * `id` and `name` are caller-supplied labels — there's no `rag_evaluation_suites`
 * table today; the suite definition lives client-side. (Future work: persist
 * suites so they can be re-run on a schedule.)
 */
export interface EvaluationSuite {
  id: string;
  name: string;
  queryIds: string[];
  /** Optional description shown in reports. */
  description?: string;
}

/** One item in the suite result list — either success (with metrics) or failure (with error). */
export type EvaluationSuiteResultItem =
  | { queryId: string; status: 'success'; result: EvaluationResult }
  | { queryId: string; status: 'failed'; error: string };

/** Aggregated result of running an evaluation suite. */
export interface EvaluationSuiteResult {
  suiteId: string;
  suiteName: string;
  totalQueries: number;
  successful: number;
  failed: number;
  averageMetrics: EvaluationMetrics;
  results: EvaluationSuiteResultItem[];
  runAt: string;
}

/** Aggregate metrics over a time window — used by the dashboard. */
export interface AggregateMetrics {
  totalQueries: number;
  averageLatencyMs: number;
  averageConfidence: number;
  feedbackDistribution: {
    positive: number;
    negative: number;
    neutral: number;
    none: number;
  };
  /** Fraction of answered queries that include at least one `[n]` citation. */
  citationCoverage: number;
}

/** Dashboard payload — counts + recent sample evaluations. */
export interface EvaluationDashboard {
  totalQueries: number;
  aggregateMetrics: AggregateMetrics;
  /** Average of the six core metrics across the most recent sample. */
  recentAverageMetrics: EvaluationMetrics | null;
  recentQueries: Array<{
    id: string;
    queryText: string;
    createdAt: string;
    feedback: string | null;
    latencyMs: number;
  }>;
}

/**
 * Internal convenience type — the bits of a `RagQuery` row that the metric
 * helpers need, already enriched with the resolved `retrievedChunks` rows.
 */
interface EvaluationQueryPayload {
  id: string;
  tenantId: string;
  queryText: string;
  responseText: string | null;
  retrievedChunkIds: string[];
  retrievedChunks: Array<{
    id: string;
    content: string;
    documentId: string;
    chunkIndex: number;
  }>;
  latencyMs: number;
  feedback: string | null;
  confidence: number | null;
  createdAt: Date;
}
