import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Vitest configuration for the `vapi/` Voice AI module.
 *
 * The suites under `vapi/tests/*.ts` were never picked up by any test
 * runner: vitest's default include glob only matches `*.spec.ts` /
 * `*.test.ts`, and neither this package nor `backend/vitest.config.ts`
 * declared a pattern for `vapi/tests/*-tests.ts`. This config fixes that
 * so `pnpm --filter vapi test` (and CI) actually executes them.
 *
 * `unplugin-swc` (mirrors `backend/vitest.config.ts`) is required because
 * these services use parameter decorators (`@InjectRedis()` etc.) —
 * esbuild's default TS transform doesn't support experimental decorators.
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
    include: ['tests/*-tests.ts', '**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
