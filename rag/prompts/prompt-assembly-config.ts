/**
 * Prompt Assembly Configuration
 * 
 * Builds final LLM prompts with:
 * - System instructions
 * - Retrieved context
 * - User query
 * - Conversation history
 * - Citations
 */

export interface PromptAssemblyConfig {
  // System prompt
  systemPrompt: string;
  
  // Context formatting
  context: {
    prefix: string;          // Before context
    suffix: string;          // After context
    chunkSeparator: string;  // Between chunks
    includeCitations: boolean; // Add [1], [2] citations
  };
  
  // Conversation history
  history: {
    enabled: boolean;
    maxMessages: number;     // Max history messages
    prefix: string;
  };
  
  // Query
  query: {
    prefix: string;
  };
  
  // Constraints
  constraints: {
    maxContextTokens: number;
    maxHistoryTokens: number;
    maxTotalTokens: number;
  };
  
  // Citations
  citations: {
    enabled: boolean;
    format: 'bracket' | 'footnote' | 'inline';
  };
}

/**
 * Default prompt assembly configuration
 * Optimized for GPT-4/GPT-3.5
 */
export const DEFAULT_PROMPT_CONFIG: PromptAssemblyConfig = {
  // System prompt (Dayjoy AI persona)
  systemPrompt: `You are Dayjoy AI, a helpful assistant for Dayjoy Enterprise.
Provide accurate, concise answers based on the provided context.
If the context doesn't contain the answer, say "I don't have enough information about that."
Always cite your sources using [1], [2], etc.`,

  // Context formatting
  context: {
    prefix: '---\nContext from knowledge base:\n---\n',
    suffix: '\n---\nEnd of context\n---\n',
    chunkSeparator: '\n\n',
    includeCitations: true,
  },

  // Conversation history
  history: {
    enabled: true,
    maxMessages: 10,  // Last 10 messages (5 turns)
    prefix: '---\nConversation history:\n---\n',
  },

  // Query
  query: {
    prefix: '---\nUser question:\n---\n',
  },

  // Token constraints
  constraints: {
    maxContextTokens: 4000,
    maxHistoryTokens: 1000,
    maxTotalTokens: 6000,  // Leave room for response
  },

  // Citations
  citations: {
    enabled: true,
    format: 'bracket',  // [1], [2], etc.
  },
};

/**
 * Assembled prompt
 */
export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
  metadata: {
    contextTokens: number;
    historyTokens: number;
    queryTokens: number;
    totalTokens: number;
    chunksUsed: number;
    citations: Array<{
      number: number;
      source: string;
      documentTitle: string;
      chunkIndex: number;
    }>;
  };
}

/**
 * Prompt template
 */
export interface PromptTemplate {
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  description: string;
}

// =====================================================================
// New API types — used by `buildSystemPrompt` / `buildUserPrompt` /
// `buildMessagesForLLM`. Coexist with the legacy `assemble(...)` API.
// =====================================================================

/**
 * Configuration for {@link PromptAssemblyService.buildSystemPrompt}.
 *
 * Each field maps to a section of the assembled system prompt:
 *  - `role` — who the agent is ("Dayjoy Customer Support AI")
 *  - `instructions` — what the agent should do
 *  - `knowledgeContext` — pointer to the retrieved knowledge
 *  - `rules` — list of constraints ("Cite sources", "If unsure, say so")
 *  - `availableTools` — list of tools the agent can invoke (just for
 *    awareness — tool routing happens elsewhere)
 */
export interface SystemPromptConfig {
  role: string;
  instructions: string;
  knowledgeContext?: string;
  rules?: string[];
  availableTools?: string[];
}

/**
 * A single turn in a conversation history. Mirrors the OpenAI Chat
 * Completions message shape (`role` is lowercase) so the prompt builder
 * can pass them straight through to the LLM.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

/**
 * A long-term memory row — see `rag/context-builder/context-builder.config.ts`
 * for the canonical type. Re-declared here so the prompt builder doesn't
 * have a circular import on the context-builder.
 */
export interface Memory {
  id: string;
  type: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT';
  key: string;
  value: string;
  importance: number;
  expiresAt?: Date | null;
  agentId?: string | null;
}

/**
 * The fully-assembled context payload — see
 * `rag/context-builder/context-builder.config.ts` for the canonical type.
 * Re-declared here so the prompt builder doesn't have a circular import.
 */
export interface BuiltContext {
  question: string;
  retrievedChunks: Array<{
    chunkId: string;
    documentId: string;
    sourceId: string;
    content: string;
    similarity: number;
    finalScore: number;
    source?: 'vector' | 'keyword' | 'hybrid';
    metadata: {
      chunkIndex: number;
      documentTitle: string;
      [key: string]: unknown;
    };
  }>;
  conversationHistory: ConversationTurn[];
  memories: Memory[];
  userProfile: unknown | null;
  systemContext: {
    tenantId: string;
    agentId?: string;
    channel?: string;
    timestamp: string;
  };
  estimatedTokens: number;
}

/**
 * Channel-specific template name. Maps to one of the markdown template
 * files under `rag/prompts/prompt-templates/`.
 */
export type PromptTemplateName =
  | 'system-base'
  | 'voice-agent'
  | 'whatsapp-agent'
  | 'web-chat-agent'
  | 'customer-support'
  | 'sales-agent';

/**
 * Pre-built prompt templates for different use cases
 */
export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  // Customer support
  customer_support: {
    name: 'Customer Support Agent',
    systemPrompt: `You are Dayjoy Customer Support AI.
Help customers with their questions about orders, products, shipping, and returns.
Be polite, professional, and helpful.
Use the provided context to answer accurately.
If you're unsure, offer to connect them with a human agent.
Cite sources using [1], [2], etc.`,
    userPromptTemplate: '{context}{history}{query}',
    description: 'General customer support queries',
  },

  // Sales
  sales: {
    name: 'Sales Assistant',
    systemPrompt: `You are Dayjoy Sales AI.
Help potential customers learn about Dayjoy products and business opportunity.
Be enthusiastic but honest.
Highlight benefits and answer questions about compensation.
Use the provided context for accurate information.
Cite sources using [1], [2], etc.`,
    userPromptTemplate: '{context}{history}{query}',
    description: 'Sales and business opportunity queries',
  },

  // Technical support
  technical_support: {
    name: 'Technical Support Agent',
    systemPrompt: `You are Dayjoy Technical Support AI.
Help users with technical issues, account setup, and app usage.
Provide clear, step-by-step instructions.
If the issue is complex, offer to escalate to a human technician.
Cite sources using [1], [2], etc.`,
    userPromptTemplate: '{context}{history}{query}',
    description: 'Technical support queries',
  },

  // HR/Employee
  hr_employee: {
    name: 'HR Assistant',
    systemPrompt: `You are Dayjoy HR AI.
Help employees with HR-related questions about policies, benefits, and procedures.
Be professional and confidential.
Use the provided context for accurate policy information.
Cite sources using [1], [2], etc.`,
    userPromptTemplate: '{context}{history}{query}',
    description: 'Employee HR queries',
  },

  // General
  general: {
    name: 'General Assistant',
    systemPrompt: `You are Dayjoy AI, a helpful assistant.
Answer questions accurately based on the provided context.
If you don't know, say so.
Cite sources using [1], [2], etc.`,
    userPromptTemplate: '{context}{history}{query}',
    description: 'General purpose queries',
  },
};