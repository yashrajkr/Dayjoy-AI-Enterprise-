/**
 * Vapi Memory Tests
 *
 * Real unit tests for the memory subsystem. The memory stack has three
 * tiers — session memory (Redis), customer profile (DB + Redis cache),
 * and long-term `AiMemory` rows — each with its own service. Tests
 * exercise each tier with mocked Redis + Prisma so we run the real
 * code paths without external dependencies.
 *
 * Coverage:
 *   - `VapiSessionMemory` — init → get/set/merge → incrementToolCalls
 *     → reverse-lookup by callId → clear.
 *   - `VapiCustomerProfile` — getProfile (cache hit, cache miss,
 *     DB hit), findByPhone, remember (writes AiMemory row).
 *   - `VapiMemoryService` — getCustomerProfile delegates to profile
 *     service, getLongTermMemories queries Prisma, buildMemoryContext
 *     composes the full picture.
 *
 * Run with: `vitest run vapi/tests/vapi-memory-tests.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';
import { createMockPrismaService } from '../../backend/_shared/testing/mock-prisma.service';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import { VapiCustomerProfile } from '../memory/vapi-customer-profile';
import { VapiMemoryService } from '../memory/vapi-memory-service';

// ---------------------------------------------------------------------------
// Helpers — augment the shared mocks with the voice-specific Prisma models
// ---------------------------------------------------------------------------

function makePrismaMock() {
  const prisma = createMockPrismaService() as any;
  prisma.voiceSession = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  };
  prisma.voiceAnalytics = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  };
  prisma.voiceTranscript = { create: vi.fn(), findMany: vi.fn() };
  prisma.webhookEvent = { create: vi.fn(), update: vi.fn() };
  prisma.analyticsEvent = { findMany: vi.fn(), count: vi.fn(), create: vi.fn() };
  prisma.message = { findMany: vi.fn().mockResolvedValue([]) };
  return prisma;
}

// ===========================================================================
// VapiSessionMemory — Redis-backed in-flight call state
// ===========================================================================
describe('VapiMemory', () => {
  describe('VapiSessionMemory', () => {
    let redis: ReturnType<typeof createMockRedis>;
    let sessionMemory: VapiSessionMemory;

    beforeEach(() => {
      redis = createMockRedis();
      sessionMemory = new VapiSessionMemory(redis as any);
    });

    it('initialises a new session keyed by sessionId', async () => {
      await sessionMemory.init('sess-1', {
        callId: 'call-1',
        phoneNumber: '+15551234567',
        tenantId: 't1',
      });

      const stored = redis.store.get('vapi:session:sess-1');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.callId).toBe('call-1');
      expect(parsed.phoneNumber).toBe('+15551234567');
      expect(parsed.tenantId).toBe('t1');
      expect(parsed.startedAt).toBeTruthy();
    });

    it('also writes the callId reverse-lookup key when callId is supplied', async () => {
      await sessionMemory.init('sess-2', {
        callId: 'call-2',
        phoneNumber: '+15550000002',
        tenantId: 't1',
      });

      expect(redis.store.get('vapi:call:call-2:sessionId')).toBe('sess-2');
    });

    it('reads a field back from the session blob', async () => {
      await sessionMemory.init('sess-3', {
        callId: 'call-3',
        phoneNumber: '+15550000003',
        tenantId: 't1',
      });

      const callId = await sessionMemory.get('sess-3', 'callId');
      expect(callId).toBe('call-3');
    });

    it('returns undefined for an unknown session', async () => {
      const result = await sessionMemory.get('does-not-exist', 'callId');
      expect(result).toBeUndefined();
    });

    it('writes a single field via set()', async () => {
      await sessionMemory.init('sess-4', {
        callId: 'call-4',
        tenantId: 't1',
      });

      await sessionMemory.set('sess-4', 'intentDetected', 'customer_support');

      const stored = JSON.parse(redis.store.get('vapi:session:sess-4')!);
      expect(stored.intentDetected).toBe('customer_support');
      expect(stored.updatedAt).toBeTruthy();
    });

    it('merges multiple fields at once via merge()', async () => {
      await sessionMemory.init('sess-5', {
        callId: 'call-5',
        tenantId: 't1',
      });

      await sessionMemory.merge('sess-5', {
        activeFlow: 'customer_support',
        flowStep: 'gather_issue',
      });

      const stored = JSON.parse(redis.store.get('vapi:session:sess-5')!);
      expect(stored.activeFlow).toBe('customer_support');
      expect(stored.flowStep).toBe('gather_issue');
      expect(stored.callId).toBe('call-5'); // preserved
    });

    it('increments the tool-call counter', async () => {
      await sessionMemory.init('sess-6', {
        callId: 'call-6',
        tenantId: 't1',
      });

      const first = await sessionMemory.incrementToolCalls('sess-6');
      const second = await sessionMemory.incrementToolCalls('sess-6');

      expect(first).toBe(1);
      expect(second).toBe(2);

      const stored = JSON.parse(redis.store.get('vapi:session:sess-6')!);
      expect(stored.toolCallsCount).toBe(2);
    });

    it('returns 0 when incrementing on an unknown session', async () => {
      const result = await sessionMemory.incrementToolCalls('nope');
      expect(result).toBe(0);
    });

    it('resolves a sessionId from a callId via reverse lookup', async () => {
      await sessionMemory.init('sess-7', {
        callId: 'call-7',
        tenantId: 't1',
      });

      const sessionId = await sessionMemory.getSessionIdByCallId('call-7');
      expect(sessionId).toBe('sess-7');
    });

    it('returns null for an unknown callId reverse lookup', async () => {
      const sessionId = await sessionMemory.getSessionIdByCallId('unknown');
      expect(sessionId).toBeNull();
    });

    it('clears both the session blob and the reverse-lookup key', async () => {
      await sessionMemory.init('sess-8', {
        callId: 'call-8',
        tenantId: 't1',
      });

      await sessionMemory.clear('sess-8');

      expect(redis.store.get('vapi:session:sess-8')).toBeUndefined();
      expect(redis.store.get('vapi:call:call-8:sessionId')).toBeUndefined();
    });
  });

  // =========================================================================
  // VapiCustomerProfile — DB + Redis cache for customer context
  // =========================================================================
  describe('VapiCustomerProfile', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let redis: ReturnType<typeof createMockRedis>;
    let profile: VapiCustomerProfile;

    beforeEach(() => {
      prisma = makePrismaMock();
      redis = createMockRedis();
      profile = new VapiCustomerProfile(prisma, redis as any);
    });

    it('returns the customer profile from the DB on a cache miss', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        tenantId: 't1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+15551234567',
        customerType: 'individual',
        status: 'active',
        orders: [],
        aiMemories: [],
      });

      const result = await profile.getProfile('cust-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('cust-1');
      expect(result!.firstName).toBe('John');
      expect(prisma.customer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cust-1' } }),
      );
    });

    it('caches the profile in Redis after a DB read', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-2',
        tenantId: 't1',
        firstName: 'Jane',
        lastName: 'Smith',
        orders: [],
        aiMemories: [],
      });

      await profile.getProfile('cust-2');

      const cached = redis.store.get('vapi:customer-profile:cust-2');
      expect(cached).toBeDefined();
      const parsed = JSON.parse(cached!);
      expect(parsed.firstName).toBe('Jane');
    });

    it('returns the cached profile on a cache hit without hitting the DB', async () => {
      // Seed the cache directly.
      redis.store.set(
        'vapi:customer-profile:cust-3',
        JSON.stringify({
          id: 'cust-3',
          tenantId: 't1',
          firstName: 'Cached',
          preferences: {},
          facts: [],
          cachedAt: new Date().toISOString(),
        }),
      );

      const result = await profile.getProfile('cust-3');

      expect(result).not.toBeNull();
      expect(result!.firstName).toBe('Cached');
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      const result = await profile.getProfile('nonexistent');
      expect(result).toBeNull();
    });

    it('finds a customer by phone across the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-4',
        tenantId: 't1',
        phone: '+15551234567',
      });

      const result = await profile.findByPhone('+15551234567', 't1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('cust-4');
      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: '+15551234567',
            tenantId: 't1',
          }),
        }),
      );
    });

    it('returns null when no customer matches the phone', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      const result = await profile.findByPhone('+19999999999', 't1');
      expect(result).toBeNull();
    });

    it('persists a long-term memory via remember()', async () => {
      prisma.aiMemory.create.mockResolvedValue({ id: 'mem-1' });

      await profile.remember(
        'cust-5',
        't1',
        'PREFERENCE',
        'language',
        'Spanish',
        8,
        'agent-1',
      );

      expect(prisma.aiMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-5',
            tenantId: 't1',
            type: 'PREFERENCE',
            key: 'language',
            value: 'Spanish',
            importance: 8,
            agentId: 'agent-1',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // VapiMemoryService — orchestrator
  // =========================================================================
  describe('VapiMemoryService', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let sessionMemory: VapiSessionMemory;
    let customerProfile: VapiCustomerProfile;
    let redis: ReturnType<typeof createMockRedis>;
    let service: VapiMemoryService;

    beforeEach(() => {
      prisma = makePrismaMock();
      redis = createMockRedis();
      sessionMemory = new VapiSessionMemory(redis as any);
      customerProfile = new VapiCustomerProfile(prisma, redis as any);
      service = new VapiMemoryService(prisma, sessionMemory, customerProfile);
    });

    it('initialises a session via initSession (delegates to VapiSessionMemory)', async () => {
      await service.initSession('sess-1', {
        callId: 'call-1',
        tenantId: 't1',
      });

      const stored = redis.store.get('vapi:session:sess-1');
      expect(stored).toBeDefined();
    });

    it('reads + writes a single session field via the service', async () => {
      await service.initSession('sess-2', { callId: 'call-2', tenantId: 't1' });
      await service.setSessionField('sess-2', 'intentDetected', 'product_inquiry');

      const intent = await service.getSessionField('sess-2', 'intentDetected');
      expect(intent).toBe('product_inquiry');
    });

    it('returns the full session via getSession', async () => {
      await service.initSession('sess-3', { callId: 'call-3', tenantId: 't1' });

      const session = await service.getSession('sess-3');
      expect(session).not.toBeNull();
      expect((session as any).callId).toBe('call-3');
    });

    it('resolves a session by Vapi call id', async () => {
      await service.initSession('sess-4', { callId: 'call-4', tenantId: 't1' });

      const session = await service.getSessionByCallId('call-4');
      expect(session).not.toBeNull();
      expect((session as any).callId).toBe('call-4');
    });

    it('clears the session via clearSession', async () => {
      await service.initSession('sess-5', { callId: 'call-5', tenantId: 't1' });

      await service.clearSession('sess-5');

      expect(redis.store.get('vapi:session:sess-5')).toBeUndefined();
      expect(redis.store.get('vapi:call:call-5:sessionId')).toBeUndefined();
    });

    it('delegates getCustomerProfile to VapiCustomerProfile', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        tenantId: 't1',
        firstName: 'John',
        lastName: 'Doe',
        orders: [],
        aiMemories: [],
      });

      const result = await service.getCustomerProfile('cust-1');

      expect(result).not.toBeNull();
      expect(result!.firstName).toBe('John');
    });

    it('returns long-term memories ordered by importance', async () => {
      prisma.aiMemory.findMany.mockResolvedValue([
        {
          id: 'mem-1',
          tenantId: 't1',
          agentId: null,
          userId: null,
          customerId: 'cust-1',
          type: 'FACT',
          key: 'vip',
          value: 'true',
          importance: 10,
          expiresAt: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const memories = await service.getLongTermMemories('cust-1');

      expect(memories).toHaveLength(1);
      expect(memories[0].key).toBe('vip');
      expect(memories[0].type).toBe('fact');
      expect(prisma.aiMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'cust-1' },
          orderBy: { importance: 'desc' },
        }),
      );
    });

    it('buildMemoryContext returns an empty context when the session does not exist', async () => {
      const context = await service.buildMemoryContext('nonexistent');
      expect(context.session).toBeNull();
      expect(context.customer).toBeNull();
      expect(context.shortTerm).toEqual([]);
      expect(context.longTerm).toEqual([]);
    });

    it('buildMemoryContext composes session + customer + long-term memory', async () => {
      await service.initSession('sess-6', {
        callId: 'call-6',
        tenantId: 't1',
        customerId: 'cust-1',
      });

      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        tenantId: 't1',
        firstName: 'John',
        lastName: 'Doe',
        orders: [],
        aiMemories: [],
      });
      prisma.aiMemory.findMany.mockResolvedValue([]);
      prisma.message.findMany.mockResolvedValue([]);

      const context = await service.buildMemoryContext('sess-6');

      expect(context.session).not.toBeNull();
      expect(context.customer).not.toBeNull();
      expect(context.customer!.firstName).toBe('John');
    });

    it('rememberCustomer writes a memory row via VapiCustomerProfile', async () => {
      prisma.aiMemory.create.mockResolvedValue({ id: 'mem-2' });

      await service.rememberCustomer(
        'cust-1',
        't1',
        'FACT',
        'favorite_product',
        'Multivitamin',
        7,
      );

      expect(prisma.aiMemory.create).toHaveBeenCalled();
    });
  });
});
