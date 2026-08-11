/**
 * Prompt templates barrel.
 *
 * Re-exports the four prompt constants so the `VapiAssistantService` can
 * pull them in one import line:
 *
 *   import { MASTER_SYSTEM_PROMPT, DAYJOY_KNOWLEDGE_PROMPT,
 *            RAG_INTEGRATION_PROMPT, ESCALATION_PROTOCOLS } from '../prompts';
 *
 * The full system prompt is assembled by concatenating them in this
 * order (master → knowledge → rag → escalation) — see
 * `buildDefaultSystemPrompt()` below.
 */

import { MASTER_SYSTEM_PROMPT } from './master-system-prompt';
import { DAYJOY_KNOWLEDGE_PROMPT } from './dayjoy-knowledge-prompt';
import { RAG_INTEGRATION_PROMPT } from './rag-integration-prompt';
import { ESCALATION_PROTOCOLS } from './escalation-protocols';

export { MASTER_SYSTEM_PROMPT } from './master-system-prompt';
export { DAYJOY_KNOWLEDGE_PROMPT } from './dayjoy-knowledge-prompt';
export { RAG_INTEGRATION_PROMPT } from './rag-integration-prompt';
export { ESCALATION_PROTOCOLS } from './escalation-protocols';

/**
 * Concatenate the four prompt sections into a single system message.
 * Sections are separated by a double newline so the LLM treats them as
 * distinct blocks.
 *
 * The order matters:
 *   1. MASTER — identity + core rules + tool catalogue.
 *   2. KNOWLEDGE — company facts (baseline; never replaces RAG).
 *   3. RAG — how to use the search_knowledge tool.
 *   4. ESCALATION — when + how to transfer to a human.
 */
export function buildDefaultSystemPrompt(
  sections: {
    master?: string;
    knowledge?: string;
    rag?: string;
    escalation?: string;
  } = {},
): string {
  const master = sections.master ?? MASTER_SYSTEM_PROMPT;
  const knowledge = sections.knowledge ?? DAYJOY_KNOWLEDGE_PROMPT;
  const rag = sections.rag ?? RAG_INTEGRATION_PROMPT;
  const escalation = sections.escalation ?? ESCALATION_PROTOCOLS;
  return [master, knowledge, rag, escalation].join('\n\n---\n\n');
}
