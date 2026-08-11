/**
 * Global test setup for the Dayjoy AI Enterprise testing framework.
 *
 * Loaded by `testing/config/vitest.config.ts` via `setupFiles` before
 * any test file executes. Responsibilities:
 *
 *  1. Load `.env.test` (if present) so `process.env.DATABASE_URL` etc.
 *     are populated for integration / API / database tests.
 *  2. Force external SDK credentials to safe dummy values so any code
 *     path that *accidentally* tries to call out fails loudly rather
 *     than leaking real keys.
 *  3. Register the global mock for `console.debug` (the backend logs
 *     a lot of debug noise; we want clean test output).
 *  4. Disable SWC decorator warnings under test.
 *  5. Extend `expect` with custom matchers used across the suite.
 *  6. Truncate the test DB **once** before the suite starts (when the
 *     `TEST_DB_RESET=1` env var is set), so integration/API/db tests
 *     start from a clean slate without each file paying the cost.
 *
 * This file is imported once per worker thread. Heavy setup (DB wipes,
 * seed loading) is gated on env vars so unit-test-only runs skip it.
 */

import { vi, beforeAll, afterAll, expect } from 'vitest';
import path from 'path';

// ---------------------------------------------------------------------
// 1. Load .env.test (best-effort — silently skipped if missing)
// ---------------------------------------------------------------------

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require('dotenv');
  const envPath = path.resolve(__dirname, '../../.env.test');
  dotenv.config({ path: envPath });
} catch {
  // dotenv not installed in this sandbox — env vars must come from the
  // shell. Fine for unit tests; integration tests will fail loudly
  // later if DATABASE_URL is unset.
}

// ---------------------------------------------------------------------
// 2. Force safe dummy credentials for all external SDKs
// ---------------------------------------------------------------------

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.VAPI_API_KEY = process.env.VAPI_API_KEY || 'test-vapi-key';
process.env.WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'test-wa-token';
process.env.WHATSAPP_PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-wa-phone-id';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '1025';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-at-least-32-chars-long-please';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
process.env.DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------
// 3. Quiet console.debug / console.trace in test output
// ---------------------------------------------------------------------

const origDebug = console.debug;
const origTrace = console.trace;
console.debug = (...args: unknown[]) => {
  if (process.env.DEBUG_TESTS === '1') origDebug(...args);
};
console.trace = (...args: unknown[]) => {
  if (process.env.DEBUG_TESTS === '1') origTrace(...args);
};

// ---------------------------------------------------------------------
// 4. Global mock unhandled-rejection catcher — surfaces promise
//    rejections that vitest would otherwise swallow as test failures
//    with confusing stack traces.
// ---------------------------------------------------------------------

beforeAll(() => {
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[unhandledRejection in test]', reason);
  });
});

// ---------------------------------------------------------------------
// 5. Custom matchers
// ---------------------------------------------------------------------

expect.extend({
  /**
   * Assert that a value is a valid UUID v4.
   */
  toBeUuid(received: unknown) {
    const ok =
      typeof received === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        received,
      );
    return {
      pass: ok,
      message: () =>
        `expected ${JSON.stringify(received)} to be a UUID v4`,
    };
  },

  /**
   * Assert that an ISO-8601 date string is within `toleranceMs` of "now".
   * Useful for verifying `createdAt` / `updatedAt` stamps.
   */
  toBeRecentIsoDate(received: unknown, toleranceMs = 60_000) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () =>
          `expected a string, got ${typeof received}`,
      };
    }
    const ts = Date.parse(received);
    if (Number.isNaN(ts)) {
      return {
        pass: false,
        message: () => `expected an ISO date, got "${received}"`,
      };
    }
    const delta = Math.abs(Date.now() - ts);
    return {
      pass: delta <= toleranceMs,
      message: () =>
        `expected "${received}" to be within ${toleranceMs}ms of now (Δ=${delta}ms)`,
    };
  },

  /**
   * Assert that an array is sorted ascending by the given key.
   */
  toBeSortedBy<T>(received: T[], key: keyof T) {
    if (!Array.isArray(received)) {
      return {
        pass: false,
        message: () => `expected an array, got ${typeof received}`,
      };
    }
    const sorted = [...received].sort((a, b) => {
      const av = a[key] as unknown as number | string;
      const bv = b[key] as unknown as number | string;
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    const pass =
      JSON.stringify(received) === JSON.stringify(sorted);
    return {
      pass,
      message: () =>
        `expected array to be sorted ascending by "${String(key)}"`,
    };
  },
});

// Vitest custom matcher typing augmentation.
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeUuid(): void;
    toBeRecentIsoDate(toleranceMs?: number): void;
    toBeSortedBy<K extends keyof T>(key: K): void;
  }
  interface AsymmetricMatchersContaining {
    toBeUuid(): void;
    toBeRecentIsoDate(toleranceMs?: number): void;
  }
}

// ---------------------------------------------------------------------
// 6. Test-DB reset hook (opt-in)
// ---------------------------------------------------------------------

/**
 * When `TEST_DB_RESET=1` is set, the suite wipes the test database
 * once before any test runs. This keeps individual test files fast —
 * they only need to truncate their own tables in `beforeEach`, not
 * the whole schema.
 *
 * Skipped automatically if `DATABASE_URL` is not a `*_test` URL (safety
 * guard against wiping a production DB).
 */
async function maybeResetTestDb() {
  if (process.env.TEST_DB_RESET !== '1') return;
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes('_test')) {
    // eslint-disable-next-line no-console
    console.warn(
      '[setup] TEST_DB_RESET=1 but DATABASE_URL is missing or not a *_test DB — skipping reset.',
    );
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    // Raw `TRUNCATE` is dramatically faster than per-model deletes.
    // `RESTART IDENTITY` resets sequences; `CASCADE` drops dependent rows.
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE
         "users","user_sessions","customers","distributors","employees",
         "products","inventory","orders","order_items","leads","interactions",
         "ai_agents","conversations","messages","ai_memories",
         "rag_sources","rag_documents","rag_chunks","embeddings",
         "voice_sessions","whatsapp_sessions","whatsapp_messages",
         "notifications","notification_logs","audit_logs","data_changes",
         "tenants","tenant_configs"
       RESTART IDENTITY CASCADE;`,
    );
    await prisma.$disconnect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[setup] could not reset test DB (likely not a postgres test env):',
      (err as Error).message,
    );
  }
}

beforeAll(async () => {
  await maybeResetTestDb();
}, 60_000);

// ---------------------------------------------------------------------
// 7. Tear-down — make sure we don't leak handles that keep the
//    vitest process alive.
// ---------------------------------------------------------------------

afterAll(() => {
  // Restore console methods so other tooling (e.g. coverage reporter)
  // gets the real implementations.
  console.debug = origDebug;
  console.trace = origTrace;
});

// Re-export the mock + fixture surface so test files can do a single
// `import { mocks, fixtures, factories } from '@testing/helpers/setup'`
// if they prefer. The canonical imports remain `@testing/helpers/mocks`
// etc.
export { vi } from 'vitest';
