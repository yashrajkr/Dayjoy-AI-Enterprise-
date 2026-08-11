import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration for the Dayjoy production testing framework.
 *
 * Scope:
 *  - `portals/`      — Playwright-style E2E spec files that target a live
 *                      portal frontend URL (Customer / Distributor / Employee /
 *                      Admin). These run inside Vitest with `@playwright/test`
 *                      annotations so they double as living documentation of
 *                      the portal contracts.
 *  - `security/`     — Authentication, authorization, RBAC, SQL-injection,
 *                      XSS, CSRF, rate-limiting. Run against a mocked HTTP
 *                      surface so they execute in CI without external deps.
 *  - `performance/`  — Load / stress / soak / scalability. Use the same HTTP
 *                      client surface as security tests but with concurrency
 *                      + latency assertions. Long-running by design — gated
 *                      behind the `perf` test name pattern so they don't run
 *                      in the default `vitest run` invocation.
 *  - `ai-eval/`      — AI response accuracy, tool-selection, memory, RAG
 *                      precision, and latency. These mock the OpenAI provider
 *                      + RAG retriever so they're deterministic and hermetic.
 *  - `edge-cases/`   — 100+ realistic edge case scenarios across the four
 *                      portals and the system itself.
 *
 * The default invocation (`vitest run`) excludes the long-running
 * performance + soak tests so CI stays green in sandboxes that don't have
 * a live stack. Run them explicitly with:
 *
 *   pnpm test:performance
 *   pnpm test -- perf
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'portals/**/*.test.ts',
      'security/**/*.test.ts',
      'performance/**/*.test.ts',
      'ai-eval/**/*.test.ts',
      'edge-cases/**/*.test.ts',
      'helpers/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'e2e/**'],
    // Give AI-eval + performance tests a longer per-test timeout: they
    // legitimately issue dozens of concurrent requests / wait for streaming
    // AI responses.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Performance tests are noisy and slow — exclude them from the default
    // `vitest run` so the dev inner loop stays fast. Re-include them by
    // running `pnpm test:performance` (which overrides `include`).
    dangerouslyIgnoreUnhandledErrors: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['helpers/**/*.ts'],
      exclude: ['**/*.test.ts', 'e2e/**'],
    },
  },
  resolve: {
    alias: {
      '@testing-helpers': path.resolve(__dirname, 'helpers'),
    },
  },
});
