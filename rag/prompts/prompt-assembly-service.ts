import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_PROMPT_CONFIG,
  PromptAssemblyConfig,
  AssembledPrompt,
  PromptTemplate,
  PROMPT_TEMPLATES,
  SystemPromptConfig,
  BuiltContext,
  ConversationTurn,
  Memory,
  PromptTemplateName,
} from './prompt-assembly-config';
import { LLMContext } from '../retriever/retrieval-config';

/**
 * PromptAssemblyService — assembles LLM prompts from a system persona +
 * retrieved context + conversation history + long-term memories + the
 * user's question.
 *
 * Two coexisting APIs:
 *
 *  1. **Legacy `assemble(query, context, history, templateName)`** — used
 *     by the existing `evaluation/complete-pipeline-service.ts`. Returns
 *     an `AssembledPrompt` with `systemPrompt` / `userPrompt` / `fullPrompt`
 *     strings. Operates on the legacy `LLMContext` shape (flat `chunks`
 *     string array).
 *
 *  2. **New `buildSystemPrompt(config)` / `buildUserPrompt(context)` /
 *     `buildMessagesForLLM(systemPrompt, context)`** — used by the new
 *     `SearchService` / `ResponsePipelineService` / `ContextBuilderService`
 *     stack. Operates on the new `BuiltContext` shape (rich
 *     `retrievedChunks` with metadata + `conversationHistory` turns +
 *     `memories` + `userProfile`).
 *
 * The new API is preferred for new code — it carries richer metadata
 * (citations, memory types, customer profile) that the legacy API
 * flattens away.
 *
 * Templates: channel-specific system-prompt templates live as markdown
 * files under `rag/prompts/prompt-templates/`. They're loaded lazily on
 * first access via {@link loadTemplate} and cached for the lifetime of
 * the service.
 */
@Injectable()
export class PromptAssemblyService {
  private readonly logger = new Logger(PromptAssemblyService.name);
  private config: PromptAssemblyConfig;
  private readonly templateCache: Map<PromptTemplateName, string> = new Map();

  constructor() {
    this.config = { ...DEFAULT_PROMPT_CONFIG };
  }

  // =====================================================================
  // NEW API — buildSystemPrompt / buildUserPrompt / buildMessagesForLLM
  // =====================================================================

  /**
   * Build a system prompt from a {@link SystemPromptConfig}.
   *
   * Sections (in order):
   *  1. Role ("You are Dayjoy Customer Support AI.")
   *  2. Instructions ("Help customers with...")
   *  3. Knowledge context ("Use the provided context to answer.")
   *  4. Rules (bulleted list of constraints)
   *  5. Available tools (bulleted list of tool names — for awareness only)
   *
   * Empty sections are skipped.
   */
  buildSystemPrompt(config: SystemPromptConfig): string {
    return [
      this.buildRoleSection(config.role),
      this.buildInstructionsSection(config.instructions),
      this.buildKnowledgeSection(config.knowledgeContext),
      this.buildRulesSection(config.rules),
      this.buildToolsSection(config.availableTools),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Build the user-facing prompt from a {@link BuiltContext}.
   *
   * Sections (separated by `---`):
   *  1. Retrieved context chunks (numbered `[1]`, `[2]`, ... with source
   *     attribution)
   *  2. Conversation history (user/assistant turns)
   *  3. Long-term memories (key: value)
   *  4. Current question
   *
   * Each section degrades gracefully — empty sections render as `(none)`.
   */
  buildUserPrompt(context: BuiltContext): string {
    return [
      this.buildContextSection(context),
      this.buildHistorySection(context.conversationHistory),
      this.buildMemorySection(context.memories),
      this.buildQuestionSection(context.question),
    ].join('\n\n---\n\n');
  }

  /**
   * Build the OpenAI Chat Completions `messages` array from a system
   * prompt + a {@link BuiltContext}.
   *
   * Layout:
   *  1. `system` — the assembled system prompt
   *  2. ...conversation history (one message per turn)
   *  3. `user` — the assembled user prompt (context + history + memories
   *     + question)
   *
   * The conversation history is replayed as separate messages so the
   * LLM gets proper turn boundaries — the user prompt's `history`
   * section is therefore omitted (the LLM would otherwise see the same
   * history twice). The history-section builder still exists for callers
   * that want a single concatenated prompt.
   */
  buildMessagesForLLM(
    systemPrompt: string,
    context: BuiltContext,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [{ role: 'system', content: systemPrompt }];

    // Replay conversation history as separate messages.
    for (const turn of context.conversationHistory) {
      messages.push({
        role: turn.role,
        content: turn.content,
      });
    }

    // Build the user prompt WITHOUT the history section (the history is
    // already in the messages array as separate turns).
    const userPrompt = [
      this.buildContextSection(context),
      this.buildMemorySection(context.memories),
      this.buildQuestionSection(context.question),
    ].join('\n\n---\n\n');

    messages.push({ role: 'user', content: userPrompt });

    return messages;
  }

  /**
   * Resolve a channel-specific system-prompt template by name. Templates
   * live as markdown files under `rag/prompts/prompt-templates/`. Loaded
   * lazily and cached for the service lifetime.
   *
   * Returns `null` when the file doesn't exist (caller should fall back
   * to a default).
   */
  loadTemplate(name: PromptTemplateName): string | null {
    const cached = this.templateCache.get(name);
    if (cached !== undefined) return cached;

    try {
      const filePath = join(__dirname, 'prompt-templates', `${name}.md`);
      const content = readFileSync(filePath, 'utf-8');
      this.templateCache.set(name, content);
      return content;
    } catch (err) {
      this.logger.debug(
        `Template "${name}" not found at ${join('prompt-templates', `${name}.md`)}: ${(err as Error).message}`,
      );
      this.templateCache.set(name, '');
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Section builders (NEW API)
  // ---------------------------------------------------------------------

  private buildRoleSection(role: string): string {
    return `## Role\n\nYou are ${role}.`;
  }

  private buildInstructionsSection(instructions: string): string {
    return `## Instructions\n\n${instructions}`;
  }

  private buildKnowledgeSection(knowledgeContext?: string): string {
    if (!knowledgeContext) return '';
    return `## Knowledge Context\n\n${knowledgeContext}`;
  }

  private buildRulesSection(rules?: string[]): string {
    if (!rules || rules.length === 0) return '';
    const lines = rules.map((r) => `- ${r}`).join('\n');
    return `## Rules\n\n${lines}`;
  }

  private buildToolsSection(tools?: string[]): string {
    if (!tools || tools.length === 0) return '';
    const lines = tools.map((t) => `- ${t}`).join('\n');
    return `## Available Tools\n\n${lines}`;
  }

  /**
   * Render retrieved chunks as a numbered, source-attributed context block.
   *
   * Example:
   *   ## Context
   *
   *   [1] (Source: Wellness Pack Guide)
   *   Take 2 tablets daily with water.
   *
   *   [2] (Source: FAQ — Shipping)
   *   We ship within 2-3 business days.
   */
  private buildContextSection(context: BuiltContext): string {
    if (!context.retrievedChunks || context.retrievedChunks.length === 0) {
      return '## Context\n\nNo relevant context found.';
    }
    const chunks = context.retrievedChunks
      .map(
        (c, i) =>
          `[${i + 1}] (Source: ${c.metadata.documentTitle})\n${c.content}`,
      )
      .join('\n\n');
    return `## Context\n\n${chunks}`;
  }

  /**
   * Render conversation history as user/assistant turns.
   */
  private buildHistorySection(history: ConversationTurn[]): string {
    if (!history || history.length === 0) {
      return '## Previous Conversation\n\n(none)';
    }
    const turns = history
      .map((t) => `${t.role}: ${t.content}`)
      .join('\n');
    return `## Previous Conversation\n\n${turns}`;
  }

  /**
   * Render long-term memories as a bulleted `key: value` list.
   *
   * The memory `type` is included in parentheses so the LLM knows
   * whether each item is a fact, a preference, etc.
   */
  private buildMemorySection(memories: Memory[]): string {
    if (!memories || memories.length === 0) {
      return '## User Memories\n\n(none)';
    }
    const mems = memories
      .map((m) => `- ${m.key} (${m.type.toLowerCase()}): ${m.value}`)
      .join('\n');
    return `## User Memories\n\n${mems}`;
  }

  private buildQuestionSection(question: string): string {
    return `## Current Question\n\n${question}`;
  }

  // =====================================================================
  // LEGACY API — assemble(...) (kept for backward compat with
  // evaluation/complete-pipeline-service.ts)
  // =====================================================================

  /**
   * Assemble complete prompt for LLM (legacy API).
   *
   * Returns an {@link AssembledPrompt} with `systemPrompt` / `userPrompt`
   * / `fullPrompt` strings. Operates on the legacy {@link LLMContext}
   * shape (flat `chunks` string array).
   */
  assemble(
    query: string,
    context: LLMContext,
    conversationHistory?: string[],
    templateName: string = 'general',
  ): AssembledPrompt {
    this.logger.log(`Assembling prompt for query: "${query}"`);

    // Get template
    const template = PROMPT_TEMPLATES[templateName] || PROMPT_TEMPLATES.general;

    // Step 1: Format context with citations
    const formattedContext = this.formatContext(context);

    // Step 2: Format conversation history
    const formattedHistory = this.formatHistory(conversationHistory);

    // Step 3: Build user prompt
    const userPrompt = this.buildUserPromptLegacy(
      formattedContext,
      formattedHistory,
      query,
      template,
    );

    // Step 4: Calculate tokens
    const contextTokens = this.estimateTokens(formattedContext);
    const historyTokens = this.estimateTokens(formattedHistory);
    const queryTokens = this.estimateTokens(query);
    const totalTokens =
      this.estimateTokens(this.config.systemPrompt) +
      contextTokens +
      historyTokens +
      queryTokens;

    // Step 5: Build citations metadata
    const citations = this.buildCitations(context);

    // Step 6: Assemble full prompt
    const fullPrompt = `${this.config.systemPrompt}\n\n${userPrompt}`;

    const assembledPrompt: AssembledPrompt = {
      systemPrompt: this.config.systemPrompt,
      userPrompt,
      fullPrompt,
      metadata: {
        contextTokens,
        historyTokens,
        queryTokens,
        totalTokens,
        chunksUsed: context.chunks.length,
        citations,
      },
    };

    this.logger.log(
      `Prompt assembled: ${totalTokens} tokens, ${context.chunks.length} chunks, ${citations.length} citations`,
    );

    return assembledPrompt;
  }

  /**
   * Format context with citations (legacy API).
   */
  private formatContext(context: LLMContext): string {
    if (!context.chunks || context.chunks.length === 0) {
      return '';
    }

    let formatted = this.config.context.prefix;

    context.chunks.forEach((chunk, index) => {
      const citationNumber = index + 1;

      formatted += `\n[${citationNumber}] ${chunk}\n`;

      // Add source metadata if available
      if (context.metadata && context.metadata[index]) {
        const meta = context.metadata[index];
        formatted += `  Source: ${meta.documentTitle}\n`;
      }

      formatted += this.config.context.chunkSeparator;
    });

    formatted += this.config.context.suffix;

    return formatted;
  }

  /**
   * Format conversation history (legacy API).
   */
  private formatHistory(history?: string[]): string {
    if (!history || history.length === 0) {
      return '';
    }

    // Take last N messages
    const recentHistory = history.slice(-this.config.history.maxMessages);

    let formatted = this.config.history.prefix;

    recentHistory.forEach((message) => {
      formatted += `${message}\n`;
    });

    formatted += '\n---\nEnd of history\n---\n';

    return formatted;
  }

  /**
   * Build user prompt (legacy API).
   */
  private buildUserPromptLegacy(
    context: string,
    history: string,
    query: string,
    template: PromptTemplate,
  ): string {
    // Replace template variables
    let userPrompt = template.userPromptTemplate
      .replace('{context}', context)
      .replace('{history}', history)
      .replace('{query}', `${this.config.query.prefix}\n${query}`);

    // Clean up empty sections
    userPrompt = userPrompt
      .replace(/\n\n---\nConversation history:\n---\n\n---\nEnd of history\n---\n/g, '')
      .replace(/\n\n---\nContext from knowledge base:\n---\n\n---\nEnd of context\n---\n/g, '')
      .trim();

    return userPrompt;
  }

  /**
   * Build citations metadata (legacy API).
   */
  private buildCitations(context: LLMContext): Array<{
    number: number;
    source: string;
    documentTitle: string;
    chunkIndex: number;
  }> {
    if (!context.metadata) {
      return [];
    }

    return context.metadata.map((meta, index) => ({
      number: index + 1,
      source: meta.source,
      documentTitle: meta.documentTitle,
      chunkIndex: meta.chunkIndex,
    }));
  }

  // =====================================================================
  // Shared helpers
  // =====================================================================

  /**
   * Check if prompt exceeds token limit.
   */
  exceedsTokenLimit(totalTokens: number): boolean {
    return totalTokens > this.config.constraints.maxTotalTokens;
  }

  /**
   * Truncate context to fit token limit (legacy API).
   */
  truncateContextToFit(
    context: LLMContext,
    maxTokens: number,
  ): LLMContext {
    const maxContextTokens =
      maxTokens -
      this.estimateTokens(this.config.systemPrompt) -
      this.estimateTokens('User question') -
      500; // Buffer

    if (context.totalTokens <= maxContextTokens) {
      return context;
    }

    // Remove chunks until within limit
    const truncatedChunks: string[] = [];
    const truncatedMetadata: Array<any> = [];
    let currentTokens = 0;

    for (let i = 0; i < context.chunks.length; i++) {
      const chunkTokens = this.estimateTokens(context.chunks[i]);

      if (currentTokens + chunkTokens > maxContextTokens) {
        break;
      }

      truncatedChunks.push(context.chunks[i]);
      truncatedMetadata.push(context.metadata[i]);
      currentTokens += chunkTokens;
    }

    this.logger.log(
      `Truncated context from ${context.chunks.length} to ${truncatedChunks.length} chunks`,
    );

    return {
      ...context,
      chunks: truncatedChunks,
      metadata: truncatedMetadata,
      totalTokens: currentTokens,
      formattedContext: this.formatContext({
        ...context,
        chunks: truncatedChunks,
        metadata: truncatedMetadata,
      }),
    };
  }

  /**
   * Update system prompt.
   */
  updateSystemPrompt(newSystemPrompt: string): void {
    this.config.systemPrompt = newSystemPrompt;
    this.logger.log('System prompt updated');
  }

  /**
   * Get current configuration.
   */
  getConfig(): PromptAssemblyConfig {
    return { ...this.config };
  }

  /**
   * Estimate token count.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
