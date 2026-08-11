import { defineConfig } from 'vitest/config';
import path from 'path';
import swc from 'unplugin-swc';

/**
 * Vitest configuration for the Dayjoy NestJS backend.
 *
 * Unit tests live next to their source files (e.g. `users/users.service.spec.ts`).
 * End-to-end tests live in `test/*.e2e.spec.ts` and require a real
 * Postgres + Redis + JWT secret environment — they are excluded from the
 * default `vitest run` invocation so the standard `pnpm test` workflow stays
 * green in CI sandboxes that don't have those services available.
 *
 * `unplugin-swc` is used to transpile TypeScript because NestJS services
 * rely on `emitDecoratorMetadata` to expose constructor parameter types
 * to the DI container. Esbuild / Vite's default TS strip does NOT emit
 * this metadata, which breaks `Test.createTestingModule(...).get(Service)`
 * resolution — services end up with `undefined` for their injected
 * dependencies. SWC with `decorators: true` + `emitDecoratorMetadata: true`
 * matches the `tsc` behaviour the production build uses.
 *
 * To run the e2e suite explicitly:
 *   pnpm --filter backend test:e2e
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
    // Include the sibling `../rag/` folder so the RAG core services'
    // spec files (loaders / chunking / ingestion / embeddings /
    // vector-store) are picked up by `bun run test`. The rag/ folder
    // imports from `backend/_shared/*` via relative paths and depends
    // on the same SWC + decorator-metadata setup as the rest of the
    // backend.
    include: [
      '**/*.spec.ts',
      '**/*.test.ts',
      // RAG core services live in the sibling `../rag/` folder. Only
      // include the four core subfolders (loaders / ingestion /
      // embeddings / vector-store) — `rag/tests/`, `rag/retriever/`,
      // `rag/prompts/`, and `rag/evaluation/` are owned by other
      // agents and have their own (pre-existing) test setup that we
      // don't want to disturb.
      '../rag/loaders/**/*.spec.ts',
      '../rag/ingestion/**/*.spec.ts',
      '../rag/embeddings/**/*.spec.ts',
      '../rag/vector-store/**/*.spec.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      '_express-reference',
      'test/**/*.e2e.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '**/*.module.ts',
        '**/main.ts',
        '**/*.dto.ts',
        '_express-reference/',
        '**/*.spec.ts',
        '**/*.test.ts',
        'test/',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '_shared'),
    },
  },
});
