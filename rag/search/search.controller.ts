import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../backend/_shared/security/permissions.guard';
import { CurrentUser } from '../../backend/_shared/common/decorators/current-user.decorator';
import { AuthUser } from '../../backend/ai/auth-user';
import {
  SearchService,
  SearchStreamEvent,
} from './search.service';
import {
  SearchQueryDto,
  SearchFeedbackDto,
  QuerySearchHistoryDto,
} from './search.dto';

/**
 * RAG Search controller — public search API under `/api/rag/search`.
 *
 * Auth model:
 *  - `POST /api/rag/search` — `JwtAuthGuard` + `RequirePermissions('ai:chat')`.
 *  - `POST /api/rag/search/stream` — same. Returns SSE (`text/event-stream`).
 *  - `GET /api/rag/search/history` — `JwtAuthGuard` + `RequirePermissions('ai:read')`.
 *  - `POST /api/rag/search/:queryId/feedback` — `JwtAuthGuard` (any authenticated
 *    user can leave feedback on their tenant's queries).
 *
 * The SSE endpoint streams `SearchStreamEvent`s as `data: <json>\n\n` lines.
 * Clients should consume the stream with `EventSource` (browser) or a
 * streaming HTTP client (server-side).
 */
@Controller('api/rag/search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  /**
   * One-shot search — returns the answer + citations as a single JSON
   * payload. Use this when the client doesn't need streaming.
   */
  @Post()
  @RequirePermissions('ai:chat')
  async search(@CurrentUser() user: AuthUser, @Body() dto: SearchQueryDto) {
    return this.searchService.search(dto, user);
  }

  /**
   * Streaming search — returns an SSE stream of token deltas.
   *
   * SSE event types:
   *  - `retrieval_complete` — emitted once after retrieval finishes.
   *    Contains `chunksUsed`, `topScore`, `sources` so the client can
   *    render the citation list before the first token arrives.
   *  - `response_chunk` — emitted per token delta. `content` is the
   *    delta text.
   *  - `complete` — emitted once at the end. Contains the full answer,
   *    `queryId`, `citations`, `latencyMs`, `tokens`, `confidence`.
   *  - `error` — emitted on failure. `error` is the message.
   *
   * The connection is closed after `complete` or `error`.
   */
  @Post('stream')
  @RequirePermissions('ai:chat')
  async searchStream(
    @CurrentUser() user: AuthUser,
    @Body() dto: SearchQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering.
    res.flushHeaders?.();

    const stream = this.searchService.searchStreaming(dto, user);

    try {
      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      this.logger.error(`SSE stream error: ${(err as Error).message}`);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: (err as Error).message,
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * Paginated search history for the current tenant (newest first).
   */
  @Get('history')
  @RequirePermissions('ai:read')
  async getHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: QuerySearchHistoryDto,
  ) {
    return this.searchService.getHistory(query, user);
  }

  /**
   * Record thumbs-up / thumbs-down feedback on a previous search.
   */
  @Post(':queryId/feedback')
  async recordFeedback(
    @CurrentUser() user: AuthUser,
    @Param('queryId') queryId: string,
    @Body() dto: SearchFeedbackDto,
  ) {
    return this.searchService.recordFeedback(queryId, dto, user);
  }
}

// Re-export for external consumers that want the streaming event type.
export type { SearchStreamEvent };
