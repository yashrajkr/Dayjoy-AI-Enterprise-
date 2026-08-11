import { Module } from '@nestjs/common';
import { ConversationMemoryService } from './conversation-memory.service';

/**
 * Conversation Memory module.
 *
 * Provides {@link ConversationMemoryService} — short-term + long-term
 * memory management for AI conversations (mirrors the FastAPI reference
 * `app/ai/memory.py`).
 *
 * Depends on:
 *  - `PrismaModule` (global — provides `PrismaService`)
 *  - `SharedAiModule` (global — provides `OPENAI_CLIENT`)
 */
@Module({
  providers: [ConversationMemoryService],
  exports: [ConversationMemoryService],
})
export class MemoryModule {}
