import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Resolve the generated Prisma client's `index.js` directly, bypassing
 * `@prisma/client`'s own `default.js` re-export (which does
 * `require('#main-entry-point')`, a package.json `imports`
 * self-reference). On this toolchain (Node 24 + pnpm's virtual store +
 * Vitest 2.1's vite-node loader) that self-reference fails to resolve
 * with `TypeError: Package import specifier "#main-entry-point" is not
 * defined` — reproduces even under plain `node -e "require('@prisma/client')"`,
 * so it's a Node-version/toolchain compatibility gap in Prisma 6.x's
 * generated exports map, not something specific to this repo's code.
 * `index.js` itself (what `#main-entry-point` would have resolved to on
 * Node) loads cleanly via a normal relative require, so aliasing
 * straight to it sidesteps the broken self-reference entirely.
 *
 * Resolved dynamically (via `require.resolve`) rather than hardcoded,
 * so this keeps working across `pnpm install` even though the exact
 * `.pnpm/@prisma+client@...` content-hash directory name changes
 * whenever dependencies change.
 *
 * Test-runner-only: this alias only affects how Vitest's module graph
 * resolves `@prisma/client` inside test files. It does not touch
 * generated code, application source, or how the running NestJS app
 * resolves the package at runtime.
 */
const require = createRequire(import.meta.url);
const prismaClientDir = path.dirname(require.resolve('@prisma/client/package.json'));
// `prismaClientDir` is `.../node_modules/@prisma/client` — go up two
// levels (past the `@prisma` scope folder) to reach that copy's
// `node_modules`, where pnpm places the generated `.prisma/client` as
// a sibling of `@prisma/client` itself.
const prismaGeneratedIndex = path.join(
  path.dirname(path.dirname(prismaClientDir)),
  '.prisma',
  'client',
  'index.js',
);

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
  resolve: {
    alias: {
      '@prisma/client': prismaGeneratedIndex,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/*-tests.ts', '**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    // Vitest's dedicated node-level alias (merged with `resolve.alias`
    // above, but this is the one actually consulted when resolving
    // imports from files outside this package's own directory tree —
    // e.g. `backend/_shared/database/prisma.service.ts`, which
    // `resolve.alias` alone did not cover).
    alias: {
      '@prisma/client': prismaGeneratedIndex,
    },
  },
});
