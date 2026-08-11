import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../_shared/auth/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';
import { WebsiteChatService } from './website-chat.service';
import { InitSessionDto } from './dto/init-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { FeedbackDto } from './dto/feedback.dto';

/**
 * Website Chat Controller.
 *
 * Public endpoints (no JWT):
 *   - POST /api/website-chat/init
 *   - POST /api/website-chat/:sessionId/message
 *   - POST /api/website-chat/:sessionId/message/stream (SSE)
 *   - GET  /api/website-chat/:sessionId/history
 *   - POST /api/website-chat/:sessionId/feedback
 *
 * Admin endpoints (require JWT + `admin:read` permission):
 *   - GET /api/website-chat/sessions
 *   - GET /api/website-chat/analytics
 *
 * Visitor IP extraction:
 *   The public endpoints read `X-Forwarded-For` (set by the load
 *   balancer / CDN) and fall back to `req.socket.remoteAddress`. The
 *   IP is used for rate limiting and recorded on the `WebSession` row.
 *
 * SSE streaming:
 *   The `/message/stream` endpoint writes SSE-formatted events
 *   directly to the Express `Response` so we can control the
 *   connection lifecycle (flush headers immediately, write chunks as
 *   they arrive, end on completion). The service yields SSE-formatted
 *   strings via an async generator.
 */
@Controller('api/website-chat')
export class WebsiteChatController {
  constructor(private readonly websiteChatService: WebsiteChatService) {}

  /**
   * Initialize a new website chat session.
   *
   * Returns the session id (used as the URL param on subsequent
   * message / history / feedback calls) + a welcome message the
   * client renders immediately.
   */
  @Post('init')
  @Public()
  @HttpCode(HttpStatus.OK)
  async initSession(
    @Body() dto: InitSessionDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip = this.extractIp(forwardedFor);
    return this.websiteChatService.initSession(
      { ...dto, userAgent: dto.userAgent ?? userAgent },
      { ip },
    );
  }

  /**
   * Send a visitor message and get the assistant reply.
   *
   * Non-streaming — returns the full assistant message once the
   * OpenAI call completes. For streaming, use
   * `POST /:sessionId/message/stream`.
   */
  @Post(':sessionId/message')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    const ip = this.extractIp(forwardedFor);
    return this.websiteChatService.sendMessage(sessionId, dto, { ip });
  }

  /**
   * Stream the assistant reply token-by-token via SSE.
   *
   * The visitor's message is in the request body (same shape as the
   * non-streaming endpoint). The response is an SSE stream of events:
   *   - `event: user`     — visitor message persisted.
   *   - `event: delta`    — incremental assistant reply chunk.
   *   - `event: done`     — final assistant message + id.
   *   - `event: error`    — error (stream aborts).
   *
   * Note: We write SSE chunks directly to the Express `Response`
   * rather than using `@Sse()` because the service is an async
   * generator that may need to emit error events mid-stream —
   * `@Sse()` would swallow those. Manual writing gives us full
   * control of the lifecycle.
   */
  @Post(':sessionId/message/stream')
  @Public()
  @HttpCode(HttpStatus.OK)
  async streamMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMessageDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Res() res?: Response,
  ) {
    const ip = this.extractIp(forwardedFor);

    // SSE: set headers manually so we control the lifecycle.
    if (res) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
      res.flushHeaders?.();
    }

    try {
      for await (const chunk of this.websiteChatService.streamMessage(
        sessionId,
        dto,
        { ip },
      )) {
        res?.write(chunk);
      }
    } catch (err) {
      const e = err as Error;
      res?.write(
        `event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`,
      );
    } finally {
      res?.end();
    }
  }

  /**
   * Get the conversation history for a session.
   *
   * Paginated (default 50 messages / page). Newest first by default —
   * the client can reverse for chat-window rendering.
   */
  @Get(':sessionId/history')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getHistory(
    @Param('sessionId') sessionId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.websiteChatService.getHistory(sessionId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Submit visitor feedback on a specific assistant message.
   */
  @Post(':sessionId/feedback')
  @Public()
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @Param('sessionId') sessionId: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.websiteChatService.submitFeedback(sessionId, dto);
  }

  // -----------------------------------------------------------------
  // Admin endpoints
  // -----------------------------------------------------------------

  /**
   * List all website chat sessions (admin only).
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('admin:read')
  @HttpCode(HttpStatus.OK)
  async listSessions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.websiteChatService.listSessions({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  /**
   * Aggregate analytics for the website chat (admin only).
   */
  @Get('analytics')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('admin:read')
  @HttpCode(HttpStatus.OK)
  async getAnalytics(@Query('days') days?: string) {
    return this.websiteChatService.getAnalytics({
      days: days ? Number(days) : undefined,
    });
  }

  // -----------------------------------------------------------------
  // private helpers
  // -----------------------------------------------------------------

  /**
   * Extract the visitor IP from the `X-Forwarded-For` header (set by
   * the load balancer / CDN) and fall back to a sentinel value when
   * unset.
   *
   * The header can be a comma-separated list (when the request passes
   * through multiple proxies) — the leftmost entry is the original
   * client IP.
   */
  private extractIp(forwardedFor?: string): string {
    if (forwardedFor) {
      const first = forwardedFor.split(',')[0]?.trim();
      if (first) return first;
    }
    return '0.0.0.0';
  }
}
