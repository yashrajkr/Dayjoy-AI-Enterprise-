/**
 * Context Builder Configuration
 * ============================
 *
 * Defines the types used by {@link ContextBuilderService} to assemble the
 * full LLM context payload — retrieved chunks + conversation history +
 * long-term memories + user/customer profile + system metadata.
 *
 * The {@link BuiltContext} shape is the canonical input to
 * {@link PromptAssemblyService.buildMessagesForLLM}. Everything the LLM
 * needs to answer a user query — aside from the system prompt — flows
 * through this interface.
 */

import type { RetrievalResult } from '../retriever/retrieval-config';

/**
 * A single turn in a conversation history. Mirrors the OpenAI Chat
 * Completions message shape (`role` is lowercase) so the prompt builder
 * can pass them straight through to the LLM without transformation.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** When the message was sent. Used for memory expiry checks downstream. */
  timestamp?: Date;
  /** Optional message metadata (tokens used, tool calls, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * A long-term memory row. Mirrors the `AiMemory` Prisma model — the
 * `type` enum (`FACT | PREFERENCE | HISTORY | CONTEXT`) lets the prompt
 * builder render different memory kinds with different formatting.
 */
export interface Memory {
  id: string;
  type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT';
  key: string;
  value: string;
  importance: number;
  expiresAt?: Date | null;
  /** Optional agent that owns the memory (memories can be agent-scoped). */
  agentId?: string | null;
}

/**
 * Input to {@link ContextBuilderService.buildContext}.
 *
 * At minimum a `question` + `tenantId` is required — those drive the
 * retrieval call. Everything else is optional context that, when present,
 * makes the LLM response more useful:
 *  - `conversationId` → fetch short-term conversation history
 *  - `userId` / `customerId` → fetch long-term memories + customer profile
 *  - `agentId` → scope retrieval to the agent's knowledge source
 *  - `channel` → drives prompt template selection (voice/whatsapp/web)
 */
export interface ContextQuery {
  /** The user's current question. */
  question: string;
  /** Tenant the query belongs to (multi-tenant isolation). */
  tenantId: string;
  /** Optional agent ID — scopes retrieval to the agent's knowledge source. */
  agentId?: string;
  /** Optional conversation ID — pulls short-term history when present. */
  conversationId?: string;
  /** Optional user ID — pulls long-term memories when present. */
  userId?: string;
  /** Optional customer ID — pulls long-term memories + customer profile. */
  customerId?: string;
  /** Channel the query came in on (drives prompt template selection). */
  channel?: 'VOICE' | 'WHATSAPP' | 'WEB' | 'API';
  /** Max chunks to retrieve (default 5). */
  maxChunks?: number;
  /** Max history turns to include (default 5 — 10 messages). */
  maxHistoryTurns?: number;
  /** Max long-term memories to include (default 5). */
  maxMemories?: number;
  /** Filter the retrieval by document/source/category. */
  filter?: {
    documentId?: string;
    sourceId?: string;
    category?: string;
    tags?: string[];
  };
}

/**
 * The fully-assembled context payload handed to the prompt builder.
 *
 * `systemContext` carries metadata about the request itself (tenant,
 * agent, channel, timestamp) that the prompt builder can include in
 * the system prompt to give the LLM situational awareness.
 */
export interface BuiltContext {
  /** The user's current question. */
  question: string;
  /** Top-K retrieved chunks ranked by relevance. */
  retrievedChunks: RetrievalResult[];
  /** Conversation history (oldest → newest), max `maxHistoryTurns * 2`. */
  conversationHistory: ConversationTurn[];
  /** Long-term memories for this user/customer. */
  memories: Memory[];
  /** Customer profile (when `customerId` was supplied). */
  userProfile: unknown | null;
  /** Request metadata — included in the system prompt. */
  systemContext: {
    tenantId: string;
    agentId?: string;
    channel?: string;
    timestamp: string;
  };
  /** Total tokens estimated across all context sections. */
  estimatedTokens: number;
}

/**
 * Default budget for context assembly.
 *
 * Kept conservative — leaves room for the system prompt + the LLM's
 * response. The OpenAI `gpt-4o` context window is 128K tokens, but
 * we don't want to send 128K tokens on every query (cost + latency).
 */
export const DEFAULT_CONTEXT_BUDGET = {
  maxChunks: 5,
  maxHistoryTurns: 5,
  maxMemories: 5,
  /** Rough token estimate — 1 token ≈ 4 chars. */
  tokensPerChar: 0.25,
} as const;
