import { vi } from 'vitest';

/**
 * Build a mocked ioredis client for unit tests.
 *
 * The default backing store is an in-memory `Map<string, string>` so
 * get/set/setex/del/exists all behave like a real Redis against the same
 * key namespace. Tests that need to assert on call args can still inspect
 * the returned `vi.fn()`s.
 *
 * Pipeline calls (used by the sliding-window rate limiter) return a
 * pre-canned `exec()` result that simulates a single request inside an
 * empty window. Individual tests can override `pipeline().exec` to drive
 * different `zcard` counts.
 */
export function createMockRedis() {
  const store = new Map<string, string>();

  const pipeline = () => ({
    zremrangebyscore: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zrange: vi.fn().mockReturnThis(),
    zrem: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setex: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => [
      [null, 0], // zremrangebyscore
      [null, 1], // zadd
      [null, 1], // zcard
      [null, 1], // pexpire
    ]),
  });

  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    // Mirrors ioredis's variadic SET signature, e.g.
    // `set(key, value, 'EX', ttlSeconds, 'NX')`. Honors `NX` (only set if
    // the key doesn't already exist, returning `null` instead of `'OK'`
    // when it does) since callers rely on this for idempotency checks.
    set: vi.fn(async (key: string, value: string, ...rest: unknown[]) => {
      const nx = rest.some((arg) => typeof arg === 'string' && arg.toUpperCase() === 'NX');
      if (nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    setnx: vi.fn(async (key: string, value: string) => {
      if (store.has(key)) return 0;
      store.set(key, value);
      return 1;
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
      }
      return n;
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    incr: vi.fn(async (key: string) => {
      const next = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async (_key: string, _ttl: number) => 1),
    pexpire: vi.fn(async (_key: string, _ttl: number) => 1),
    ttl: vi.fn(async (_key: string) => -1),
    // `pipeline` is itself a vi.fn so tests can use `mockReturnValueOnce`
    // to override the returned pipeline object per-call.
    pipeline: vi.fn(pipeline),
    // Minimal EVAL support: real Redis executes Lua scripts atomically
    // and single-threaded server-side. This mock has no Lua
    // interpreter, but since JS itself is single-threaded and this
    // implementation contains no `await` between reading and writing
    // `store`, it reproduces the same atomicity guarantee for tests —
    // concurrent `Promise.all`-driven callers can't interleave between
    // the read and the write. Only supports the specific
    // read-JSON/increment-field/write-JSON shape used by
    // `VapiSessionMemory.incrementToolCalls` (matched by script
    // content) since that's the only caller in this codebase; other
    // scripts return `null` untouched rather than throwing, so tests
    // exercising unrelated Redis paths aren't broken by this addition.
    eval: vi.fn(
      async (script: string, _numKeys: number, key: string, ttlSeconds: string, updatedAt: string) => {
        if (!script.includes('toolCallsCount')) return null;
        const raw = store.get(key);
        if (!raw) return -1;
        const data = JSON.parse(raw);
        data.toolCallsCount = (data.toolCallsCount ?? 0) + 1;
        data.updatedAt = updatedAt;
        store.set(key, JSON.stringify(data));
        void ttlSeconds; // TTL isn't modeled in this in-memory store
        return data.toolCallsCount;
      },
    ),
    ping: vi.fn(async () => 'PONG'),
    quit: vi.fn(async () => 'OK'),
    disconnect: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  };
}

export type MockRedis = ReturnType<typeof createMockRedis>;
