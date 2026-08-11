import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { CreateMemoryDto, UpdateMemoryDto, QueryMemoryDto } from './dto/memory.dto';
import { AuthUser } from './auth-user';

/**
 * AI memory service — CRUD over the `AiMemory` table.
 *
 * Memories are tenant-scoped: every query filters by `tenantId` from the
 * authenticated user. Memories optionally attach to an agent, user, and/or
 * customer — `getContextForConversation()` uses the union of these scopes
 * to retrieve relevant context for the LLM prompt.
 *
 * Memory types:
 *  - `FACT`        — verifiable statements ("user has 2 children").
 *  - `PREFERENCE`  — subjective preferences ("prefers email over SMS").
 *  - `HISTORY`     — past interactions ("called support on 2024-03-12").
 *  - `CONTEXT`     — ephemeral context ("currently in checkout flow").
 */

/** Maximum number of memories returned by `getContextForConversation`. */
const CONTEXT_MEMORY_LIMIT = 5;

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryMemoryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.agentId) where.agentId = query.agentId;
    if (query.userId) where.userId = query.userId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.type) where.type = query.type as any;

    const [memories, total] = await Promise.all([
      this.prisma.aiMemory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiMemory.count({ where }),
    ]);

    return {
      data: memories,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const memory = await this.prisma.aiMemory.findUnique({ where: { id } });
    if (!memory || memory.tenantId !== user.tenantId) {
      throw new NotFoundException(`Memory ${id} not found`);
    }
    return memory;
  }

  async create(dto: CreateMemoryDto, user: AuthUser) {
    let expiresAt: Date | undefined;
    if (dto.expiresAt) {
      const parsed = new Date(dto.expiresAt);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('`expiresAt` must be a valid ISO-8601 date');
      }
      expiresAt = parsed;
    }

    return this.prisma.aiMemory.create({
      data: {
        tenantId: user.tenantId!,
        agentId: dto.agentId,
        userId: dto.userId,
        customerId: dto.customerId,
        type: dto.type as any,
        key: dto.key,
        value: dto.value,
        importance: dto.importance ?? 5,
        expiresAt,
      },
    });
  }

  async update(id: string, dto: UpdateMemoryDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    const data: any = {};
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.importance !== undefined) data.importance = dto.importance;
    if (dto.expiresAt !== undefined) {
      const parsed = new Date(dto.expiresAt);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('`expiresAt` must be a valid ISO-8601 date');
      }
      data.expiresAt = parsed;
    }

    return this.prisma.aiMemory.update({
      where: { id: existing.id },
      data,
    });
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    await this.prisma.aiMemory.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }

  // ---------------------------------------------------------------------
  // Scope shortcuts
  // ---------------------------------------------------------------------

  /** All memories for a given user (across all agents). */
  async getByUser(userId: string, user: AuthUser) {
    return this.prisma.aiMemory.findMany({
      where: { tenantId: user.tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** All memories for a given customer (across all agents). */
  async getByCustomer(customerId: string, user: AuthUser) {
    return this.prisma.aiMemory.findMany({
      where: { tenantId: user.tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------
  // LLM-context retrieval
  // ---------------------------------------------------------------------

  /**
   * Retrieve relevant memories for a conversation.
   *
   * Pulls non-expired memories attached to the conversation's user and/or
   * customer (and to the conversation's agent when present), ranks by
   * `importance` (desc) then recency, and returns the top
   * {@link CONTEXT_MEMORY_LIMIT}.
   *
   * Used by {@link ConversationsService.sendMessage} to seed the system
   * prompt. Best-effort: caller swallows errors so the chat turn still
   * completes when memory retrieval fails.
   */
  async getContextForConversation(conversationId: string, user: AuthUser) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { tenantId: true, agentId: true, userId: true, customerId: true },
    });
    if (!conversation || conversation.tenantId !== user.tenantId) {
      throw new NotFoundException('Conversation not found');
    }

    // Build an OR of (userId, customerId, agentId) scopes — at least one
    // must be non-null. If all are null (rare), return [].
    const orClauses: any[] = [];
    if (conversation.userId) orClauses.push({ userId: conversation.userId });
    if (conversation.customerId)
      orClauses.push({ customerId: conversation.customerId });
    if (conversation.agentId) orClauses.push({ agentId: conversation.agentId });

    if (orClauses.length === 0) return [];

    return this.prisma.aiMemory.findMany({
      where: {
        tenantId: user.tenantId,
        AND: [
          { OR: orClauses },
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: CONTEXT_MEMORY_LIMIT,
    });
  }
}
