import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiSessionMemory } from './vapi-session-memory';
import { VapiCustomerProfile } from './vapi-customer-profile';
import type {
  CustomerProfile,
  MemoryContext,
  MemoryItem,
} from './vapi-memory-types';

/**
 * Vapi Memory Service — orchestrator for the three memory tiers:
 *
 *   1. **Session memory** (Redis, 24h TTL) — the in-flight call
 *      state: who's calling, what flow is active, last user intent.
 *      See {@link VapiSessionMemory}.
 *
 *   2. **Customer profile** (Postgres + Redis cache, 1h TTL) — the
 *      stable customer attributes: contact info, recent orders,
 *      preferences/facts pulled from `AiMemory`.
 *      See {@link VapiCustomerProfile}.
 *
 *   3. **Long-term memory** (Postgres `AiMemory` table) — facts and
 *      preferences the assistant has explicitly remembered across
 *      calls. Surfaced via `getLongTermMemories()` and written via
 *      `VapiCustomerProfile.remember()`.
 *
 * The class deliberately does NOT hold any in-process state — every
 * operation hits Redis or Postgres so the service is safe to run
 * across multiple replicas.
 */
@Injectable()
export class VapiMemoryService {
  private readonly logger = new Logger(VapiMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMemory: VapiSessionMemory,
    private readonly customerProfile: VapiCustomerProfile,
  ) {}

  // -------------------------------------------------------------------
  // Session memory (delegates to VapiSessionMemory)
  // -------------------------------------------------------------------

  /** Initialize a session blob in Redis. */
  async initSession(sessionId: string, data: any): Promise<void> {
    return this.sessionMemory.init(sessionId, data);
  }

  /** Read a single field from the session blob. */
  async getSessionField<T = any>(
    sessionId: string,
    key: string,
  ): Promise<T | undefined> {
    return this.sessionMemory.get<T>(sessionId, key);
  }

  /** Write a single field to the session blob. */
  async setSessionField(
    sessionId: string,
    key: string,
    value: any,
  ): Promise<void> {
    return this.sessionMemory.set(sessionId, key, value);
  }

  /** Read the whole session blob. */
  async getSession(sessionId: string) {
    return this.sessionMemory.getAll(sessionId);
  }

  /** Read the session by Vapi call id (reverse lookup). */
  async getSessionByCallId(callId: string) {
    return this.sessionMemory.getByCallId(callId);
  }

  /** Delete the session blob (called at call-end). */
  async clearSession(sessionId: string): Promise<void> {
    return this.sessionMemory.clear(sessionId);
  }

  // -------------------------------------------------------------------
  // Customer profile (delegates to VapiCustomerProfile)
  // -------------------------------------------------------------------

  /** Load the cached/refreshed customer profile. */
  async getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
    return this.customerProfile.getProfile(customerId);
  }

  /** Identify a caller by phone number. */
  async findCustomerByPhone(
    phone: string,
    tenantId?: string,
  ): Promise<{ id: string; tenantId: string } | null> {
    return this.customerProfile.findByPhone(phone, tenantId);
  }

  /** Persist a long-term memory for a customer. */
  async rememberCustomer(
    customerId: string,
    tenantId: string,
    type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT',
    key: string,
    value: string,
    importance = 5,
    agentId?: string,
  ): Promise<void> {
    return this.customerProfile.remember(
      customerId,
      tenantId,
      type,
      key,
      value,
      importance,
      agentId,
    );
  }

  // -------------------------------------------------------------------
  // Long-term memory (direct Prisma access on AiMemory)
  // -------------------------------------------------------------------

  /**
   * Load long-term memories for a customer, optionally filtered by
   * type. Ordered by importance (desc) so the most relevant facts
   * appear first in the LLM context.
   */
  async getLongTermMemories(
    customerId: string,
    type?: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT',
    limit = 20,
  ): Promise<MemoryItem[]> {
    const rows = await this.prisma.aiMemory.findMany({
      where: { customerId, ...(type ? { type } : {}) },
      orderBy: { importance: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      agentId: r.agentId,
      userId: r.userId,
      customerId: r.customerId,
      type: r.type.toLowerCase() as any,
      key: r.key,
      value: r.value,
      importance: r.importance,
      expiresAt: r.expiresAt,
      metadata: r.metadata as Record<string, any> | null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  // -------------------------------------------------------------------
  // Conversation history (direct Prisma access on Message)
  // -------------------------------------------------------------------

  /**
   * Recent messages from a conversation, formatted for inclusion in
   * the LLM prompt. The Voice channel stores its messages in the
   * same `Message` table as the chat channel — the `voiceTranscripts`
   * table is the per-utterance log, while `Message` is the
   * conversation-level history.
   */
  async getRecentMessages(conversationId: string, limit = 10) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        contentType: true,
        createdAt: true,
      },
    });
  }

  // -------------------------------------------------------------------
  // Aggregated context (used by flow manager + LLM prompt builder)
  // -------------------------------------------------------------------

  /**
   * Build the complete memory context for a session. Pulls:
   *   - The session blob (Redis)
   *   - The customer profile (Redis cache or DB)
   *   - The last 10 messages of the conversation (DB)
   *   - The customer's long-term memories (DB)
   *
   * And folds them into a single object the flow manager can pass
   * to the LLM.
   */
  async buildMemoryContext(sessionId: string): Promise<MemoryContext> {
    const session = await this.sessionMemory.getAll(sessionId);
    if (!session) {
      return {
        session: null,
        customer: null,
        shortTerm: [],
        longTerm: [],
        summary: 'No active session.',
      };
    }

    const customer = session.customerId
      ? await this.customerProfile.getProfile(session.customerId)
      : null;

    const longTerm = session.customerId
      ? await this.getLongTermMemories(session.customerId)
      : [];

    const recentMessages = session.conversationId
      ? await this.getRecentMessages(session.conversationId, 10)
      : [];

    const summary = this.buildSummary(session, customer, recentMessages);

    return {
      session,
      customer,
      shortTerm: [], // Short-term memories are in the session blob itself
      longTerm,
      summary,
    };
  }

  /**
   * One-paragraph summary of "who is this caller and what do we know
   * about them" — used as the system-prompt prefix for the LLM.
   */
  private buildSummary(
    session: any,
    customer: CustomerProfile | null,
    recentMessages: any[],
  ): string {
    const parts: string[] = [];

    if (customer) {
      const name = [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(' ');
      parts.push(
        `Caller is ${name || 'an existing customer'} (type: ${customer.customerType ?? 'unknown'}).`,
      );
      if (customer.recentOrders?.length) {
        const last = customer.recentOrders[0];
        parts.push(
          `Last order: ${last.orderNumber} (status: ${last.status}, $${last.total}).`,
        );
      }
      const topFact = customer.facts[0];
      if (topFact) {
        parts.push(`Known fact: ${topFact.value}.`);
      }
      const langPref = customer.preferences?.['language'];
      if (langPref) {
        parts.push(`Preferred language: ${langPref}.`);
      }
    } else {
      parts.push('Caller is not yet identified (anonymous).');
    }

    if (session.activeFlow) {
      parts.push(`Active flow: ${session.activeFlow} (step: ${session.flowStep ?? 'n/a'}).`);
    }

    if (session.lastUserMessage) {
      parts.push(`Last user message: "${session.lastUserMessage.slice(0, 200)}".`);
    }

    if (recentMessages.length > 0) {
      parts.push(
        `Conversation has ${recentMessages.length} prior message(s) on record.`,
      );
    }

    return parts.join(' ');
  }

  // -------------------------------------------------------------------
  // Operational helpers
  // -------------------------------------------------------------------

  /**
   * Stats endpoint — used by the analytics dashboard to show memory
   * subsystem health. Counts are Postgres queries (not hot paths).
   */
  async getStatistics(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const [totalMemories, byType] = await Promise.all([
      this.prisma.aiMemory.count({ where }),
      this.prisma.aiMemory.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);
    return {
      totalMemories,
      byType: byType.reduce<Record<string, number>>((acc, r) => {
        acc[r.type] = r._count;
        return acc;
      }, {}),
    };
  }
}
