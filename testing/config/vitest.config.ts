import { defineConfig } from 'vitest/config';
import path from 'path';
import swc from 'unplugin-swc';

/**
 * Vitest configuration for the Dayjoy AI Enterprise system-wide testing
 * framework.
 *
 * Covers four test layers (all Vitest-based):
 *  - `testing/unit/**/*.test.ts`        — mocked deps, no DB
 *  - `testing/integration/**/*.test.ts` — real test DB, mocked external APIs
 *  - `testing/api/**/*.test.ts`         — supertest + real test DB
 *  - `testing/database/**/*.test.ts`    — direct DB connection
 *
 * The backend's own `backend/vitest.config.ts` (which picks up the
 * per-module `*.spec.ts` files next to source) is the **canonical**
 * contract suite. This config is for the **system-wide** framework
 * that lives under `testing/`. Both run in CI.
 *
 * `unplugin-swc` is used to transpile TypeScript because NestJS services
 * rely on `emitDecoratorMetadata` to expose constructor parameter
 * types to the DI container — the same reason the backend's own
 * vitest config uses SWC.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'testing/unit/**/*.test.ts',
      'testing/integration/**/*.test.ts',
      'testing/api/**/*.test.ts',
      'testing/database/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'testing/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'testing/config/',
        'testing/helpers/',
        '**/*.config.*',
        '**/*.module.ts',
        '**/main.ts',
        '**/*.dto.ts',
        '**/*.spec.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['testing/helpers/setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    // Database / integration tests cannot safely run in parallel — they
    // share a single test DB. Vitest's file-level isolation still gives
    // us a fresh module graph per file, which is what we actually need.
    // (Per-file `beforeEach` truncates the relevant tables.)
    fileParallelism: process.env.VITEST_PARALLEL === 'true',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@backend': path.resolve(__dirname, '../../backend'),
      '@rag': path.resolve(__dirname, '../../rag'),
      '@vapi': path.resolve(__dirname, '../../vapi'),
      '@shared': path.resolve(__dirname, '../../backend/_shared'),
      '@testing': path.resolve(__dirname),
    },
  },
});
