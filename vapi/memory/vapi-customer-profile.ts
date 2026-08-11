import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { InjectRedis } from '../../backend/_shared/security/redis.decorators';
import type Redis from 'ioredis';
import type { CustomerProfile } from './vapi-memory-types';

/**
 * Cache TTL for the customer-profile blob. 1h is short enough that
 * changes made via the admin UI propagate reasonably fast, but long
 * enough to absorb a multi-call burst from the same customer
 * (e.g. caller hangs up and re-dials within seconds).
 */
const PROFILE_CACHE_TTL_SECONDS = 60 * 60;

/**
 * Vapi Customer Profile Service.
 *
 * Loads a customer's full context (profile + recent orders +
 * preferences/facts from `AiMemory`) and caches it in Redis so that
 * subsequent calls in the same hour don't re-hit Postgres.
 *
 * Used by:
 *   - `VapiCallStartedHandler` — to attach the customer to the
 *     voice session and seed the session memory.
 *   - `VapiMemoryService.buildMemoryContext` — to inject customer
 *     context into the LLM prompt.
 *   - The flows (via the memory service) to look up customer-specific
 *     facts ("customer is a VIP", "prefers English", etc).
 */
@Injectable()
export class VapiCustomerProfile {
  private readonly logger = new Logger(VapiCustomerProfile.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Load a customer profile by id. Cache-first.
   *
   * Returns null if the customer doesn't exist (e.g. anonymous
   * caller); the caller is expected to handle that gracefully.
   */
  async getProfile(customerId: string): Promise<CustomerProfile | null> {
    const cacheKey = this.cacheKey(customerId);
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as CustomerProfile;
      }
    } catch (err) {
      this.logger.warn(
        `Redis read failed for customer profile ${customerId}: ${(err as Error).message}`,
      );
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            placedAt: true,
          },
        },
        aiMemories: {
          where: {
            OR: [{ type: 'PREFERENCE' }, { type: 'FACT' }],
          },
          orderBy: { importance: 'desc' },
          take: 20,
          select: {
            id: true,
            type: true,
            key: true,
            value: true,
            importance: true,
          },
        },
      },
    });

    if (!customer) return null;

    const profile: CustomerProfile = {
      id: customer.id,
      tenantId: customer.tenantId,
      customerType: customer.customerType,
      companyName: customer.companyName,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      status: customer.status,
      recentOrders: customer.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        placedAt: o.placedAt,
      })),
      preferences: customer.aiMemories
        .filter((m) => m.type === 'PREFERENCE')
        .reduce<Record<string, string>>((acc, m) => {
          acc[m.key] = m.value;
          return acc;
        }, {}),
      facts: customer.aiMemories
        .filter((m) => m.type === 'FACT')
        .map((m) => ({
          key: m.key,
          value: m.value,
          importance: m.importance,
        })),
      cachedAt: new Date().toISOString(),
    };

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(profile),
        'EX',
        PROFILE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Redis write failed for customer profile ${customerId}: ${(err as Error).message}`,
      );
    }

    return profile;
  }

  /**
   * Look up a customer by phone number across the given tenant.
   * Used at call-start to identify the caller.
   */
  async findByPhone(
    phone: string,
    tenantId?: string,
  ): Promise<{ id: string; tenantId: string } | null> {
    const where: any = { phone };
    if (tenantId) where.tenantId = tenantId;
    const customer = await this.prisma.customer.findFirst({
      where,
      select: { id: true, tenantId: true },
    });
    return customer ?? null;
  }

  /**
   * Recent orders (with items) for a customer — used by the
   * customer-support flow to give order-status updates.
   */
  async getRecentOrders(customerId: string, take = 5) {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        items: {
          select: {
            id: true,
            productSku: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    });
  }

  /**
   * Customer preferences, loaded from `AiMemory` (type=PREFERENCE).
   * Returns a flat key-value map for easy injection into prompts.
   */
  async getPreferences(customerId: string): Promise<Record<string, string>> {
    const memories = await this.prisma.aiMemory.findMany({
      where: { customerId, type: 'PREFERENCE' },
      orderBy: { importance: 'desc' },
      select: { key: true, value: true },
    });
    return memories.reduce<Record<string, string>>((acc, m) => {
      acc[m.key] = m.value;
      return acc;
    }, {});
  }

  /**
   * Important facts about a customer (type=FACT). Used to personalize
   * the conversation ("I see you've been with us since 2023...").
   */
  async getFacts(
    customerId: string,
    minImportance = 5,
  ): Promise<Array<{ key: string; value: string; importance: number }>> {
    return this.prisma.aiMemory.findMany({
      where: { customerId, type: 'FACT', importance: { gte: minImportance } },
      orderBy: { importance: 'desc' },
      select: { key: true, value: true, importance: true },
    });
  }

  /**
   * Persist a new long-term memory entry (fact or preference) for a
   * customer. Invalidates the profile cache so the next read picks
   * up the new memory.
   */
  async remember(
    customerId: string,
    tenantId: string,
    type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT',
    key: string,
    value: string,
    importance = 5,
    agentId?: string,
  ): Promise<void> {
    await this.prisma.aiMemory.create({
      data: {
        tenantId,
        customerId,
        agentId: agentId ?? null,
        type,
        key,
        value,
        importance,
      },
    });
    await this.invalidate(customerId).catch((e) =>
      this.logger.warn(`Cache invalidation failed: ${e.message}`),
    );
  }

  /**
   * Drop the cached profile (called when the underlying customer
   * row is updated externally, or after `remember()`).
   */
  async invalidate(customerId: string): Promise<void> {
    await this.redis.del(this.cacheKey(customerId));
  }

  private cacheKey(customerId: string): string {
    return `vapi:customer:${customerId}:profile`;
  }
}
