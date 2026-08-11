import { defineConfig } from 'vitest/config';
import path from 'node:path';
import swc from 'unplugin-swc';

/**
 * Vitest configuration — Channel production tests (T2 agent).
 *
 * Scope (this config ONLY picks up the four AI-channel test folders
 * owned by the testing-agent-t2-rag-voice-whatsapp-web task):
 *
 *   - testing/rag/      — RAG retrieval, citations, hallucination,
 *                         ingestion, evaluation
 *   - testing/voice/    — Voice AI (Vapi): greetings, products, leads,
 *                         appointments, escalation, memory, tool-calling
 *   - testing/whatsapp/ — WhatsApp AI: webhook, messaging, AI
 *                         conversation, rich features, opt-in
 *   - testing/website/  — Website AI: widget, streaming, voice input,
 *                         guest vs logged-in, admin controls, embed
 *
 * Sister configs (do NOT touch — owned by T1):
 *   - testing/vitest.config.ts            — portals/security/perf/ai-eval/edge-cases
 *   - testing/config/vitest.config.ts     — unit/integration/api/database
 *
 * `unplugin-swc` is required because the channel tests instantiate real
 * NestJS services from `vapi/` and `rag/` — those services rely on
 * `emitDecoratorMetadata` for DI resolution. SWC matches the
 * `backend/vitest.config.ts` setup.
 *
 * Run with:
 *   npx vitest run --config testing/config/vitest.channels.config.ts
 *   npx vitest run --config testing/config/vitest.channels.config.ts rag
 *   npx vitest run --config testing/config/vitest.channels.config.ts voice
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
  css: {
    // Disable PostCSS lookup — the parent monorepo's postcss.config.mjs
    // uses plugins that aren't installed in `testing/`'s node_modules
    // and would crash Vite's CSS pipeline. Channel tests don't import
    // any CSS so this is safe.
    postcss: { plugins: [] },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'rag/**/*.test.ts',
      'voice/**/*.test.ts',
      'whatsapp/**/*.test.ts',
      'website/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'e2e/**', 'config/**'],
    // Channel tests run hermetically — every external service (OpenAI,
    // Vapi, Meta WhatsApp, Postgres, Redis) is mocked. The per-test
    // timeout is generous because the RAG + voice tests do dozens of
    // assertions per case.
    testTimeout: 30_000,
    hookTimeout: 15_000,
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'rag/**/*.ts',
        'voice/**/*.ts',
        'whatsapp/**/*.ts',
        'website/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.config.*', 'helpers/**'],
    },
  },
  resolve: {
    alias: {
      '@backend': path.resolve(__dirname, '../../backend'),
      '@rag': path.resolve(__dirname, '../../rag'),
      '@vapi': path.resolve(__dirname, '../../vapi'),
      '@whatsapp': path.resolve(__dirname, '../../whatsapp-ai'),
      '@shared': path.resolve(__dirname, '../../backend/_shared'),
      '@testing': path.resolve(__dirname, '..'),
      '@channel-helpers': path.resolve(__dirname, '../helpers'),
    },
  },
});
