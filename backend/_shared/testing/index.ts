import { vi } from 'vitest';

/**
 * Barrel for test doubles used across the backend unit-test suite.
 *
 * Re-exporting from a single index keeps spec imports tidy:
 *   import { createMockPrismaService, createMockRedis } from '../_shared/testing';
 */
export { createMockPrismaService, type MockPrismaService } from './mock-prisma.service';
export { createMockRedis, type MockRedis } from './mock-redis';

/**
 * Helper — wraps `vi.fn()` for a typed async provider so tests can attach
 * `.mockResolvedValue` / `.mockRejectedValue` ergonomically.
 */
export function asyncFn<T = unknown>(): ReturnType<typeof vi.fn<[], Promise<T>>> {
  return vi.fn();
}
