import OpenAI from 'openai';
import { Provider } from '@nestjs/common';

/**
 * NestJS DI token for the shared OpenAI SDK client instance.
 *
 * Use `@Inject(OPENAI_CLIENT)` to pull the client into any provider that
 * needs to call the OpenAI Chat Completions or Embeddings APIs.
 */
export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

/**
 * Factory that constructs a singleton OpenAI client from the
 * `OPENAI_API_KEY` environment variable.
 *
 * Throws synchronously at application bootstrap if the key is missing —
 * this is intentional so misconfigured environments fail fast instead of
 * silently producing 500s on the first chat / embedding request.
 *
 * The client is intentionally NOT marked optional — every feature module
 * that injects `OPENAI_CLIENT` (AI conversations, RAG, tools) is a
 * core piece of the platform and cannot function without it.
 */
export const OpenAiProvider: Provider = {
  provide: OPENAI_CLIENT,
  useFactory: () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is required — set it in the environment before starting the backend.',
      );
    }
    return new OpenAI({ apiKey });
  },
};
