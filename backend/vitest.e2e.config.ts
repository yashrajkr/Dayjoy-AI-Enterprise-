import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config dedicated to end-to-end tests.
 *
 * E2E tests bootstrap the full NestJS AppModule against a real (or
 * dockerised) Postgres + Redis stack, so they're split out from the
 * default `vitest run` invocation.
 *
 * Run with: `pnpm --filter backend test:e2e`
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e.spec.ts'],
    exclude: ['node_modules', 'dist', '_express-reference'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '_shared'),
    },
  },
});
