import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { WebsiteChatService } from './website-chat.service';
import { WebsiteChatController } from './website-chat.controller';

/**
 * Website Chat Backend Module.
 *
 * Wires the website chat service + controller. The service reuses the
 * shared AI core (`ConversationsService` for the message pipeline +
 * `OPENAI_CLIENT` for streaming) by importing {@link AiModule}.
 *
 * The shared `PrismaService`, `RateLimitService`, and `OPENAI_CLIENT`
 * are all `@Global()`-scoped (registered in `app.module.ts` via
 * `PrismaModule` / `SecurityModule` / `SharedAiModule`), so this
 * module doesn't need to re-declare them — only `AiModule` (which
 * owns `ConversationsService`) needs an explicit import.
 *
 * Routes exposed:
 *   Public (no JWT):
 *     POST /api/website-chat/init
 *     POST /api/website-chat/:sessionId/message
 *     POST /api/website-chat/:sessionId/message/stream (SSE)
 *     GET  /api/website-chat/:sessionId/history
 *     POST /api/website-chat/:sessionId/feedback
 *
 *   Admin (JWT + `admin:read` permission):
 *     GET  /api/website-chat/sessions
 *     GET  /api/website-chat/analytics
 */
@Module({
  imports: [AiModule],
  providers: [WebsiteChatService],
  controllers: [WebsiteChatController],
  exports: [WebsiteChatService],
})
export class WebsiteChatModule {}
