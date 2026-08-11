/**
 * LLM Gateway Configuration
 * =========================
 *
 * Multi-LLM provider integration with:
 *  - Provider abstraction (OpenAI / Anthropic / Google / Azure)
 *  - Intelligent routing (cost / performance / balanced)
 *  - Automatic fallback (primary → secondary → tertiary)
 *  - Cost optimization (caching, model selection by complexity)
 *  - Rate limit handling (retry with backoff)
 *
 * Originally at `rag/evaluation/llm-gateway-config.ts` — MOVED to
 * `rag/response-pipeline/llm-gateway-config.ts` because the LLM gateway
 * is part of the response pipeline, not the evaluation framework. A
 * backward-compat re-export remains at the original path.
 */

export interface LLMGatewayConfig {
  // Default provider
  defaultProvider: 'openai' | 'anthropic' | 'google' | 'azure';

  // Provider configurations
  providers: {
    openai: ProviderConfig;
    anthropic: ProviderConfig;
    google: ProviderConfig;
    azure: ProviderConfig;
  };

  // Routing strategy
  routing: {
    strategy: 'cost_optimized' | 'performance' | 'balanced';
    rules: RoutingRule[];
  };

  // Fallback
  fallback: {
    enabled: boolean;
    maxRetries: number;
    retryDelayMs: number;
  };

  // Caching
  caching: {
    enabled: boolean;
    ttlSeconds: number;
    maxSize: number;
  };
}

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  apiBase?: string;
  apiVersion?: string;
  models: string[];
  priority: number;  // Lower = higher priority
  fallback?: 'openai' | 'anthropic' | 'google' | 'azure';
}

export interface RoutingRule {
  complexity: 'low' | 'medium' | 'high';
  model: string;
  provider: 'openai' | 'anthropic' | 'google' | 'azure';
}

/**
 * Default LLM gateway configuration
 */
export const DEFAULT_LLM_GATEWAY_CONFIG: LLMGatewayConfig = {
  defaultProvider: 'openai',

  providers: {
    openai: {
      enabled: true,
      apiKey: process.env.OPENAI_API_KEY,
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      priority: 1,
      fallback: 'anthropic',
    },
    anthropic: {
      enabled: true,
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      priority: 2,
      fallback: 'google',
    },
    google: {
      enabled: true,
      apiKey: process.env.GOOGLE_API_KEY,
      models: ['gemini-pro', 'gemini-ultra'],
      priority: 3,
      fallback: 'openai',
    },
    azure: {
      enabled: false,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiBase: process.env.AZURE_OPENAI_API_BASE,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      models: ['gpt-4o', 'gpt-4-turbo'],
      priority: 4,
    },
  },

  routing: {
    strategy: 'cost_optimized',
    rules: [
      {
        complexity: 'high',
        model: 'gpt-4o',
        provider: 'openai',
      },
      {
        complexity: 'medium',
        model: 'claude-3-sonnet',
        provider: 'anthropic',
      },
      {
        complexity: 'low',
        model: 'gpt-3.5-turbo',
        provider: 'openai',
      },
    ],
  },

  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
  },

  caching: {
    enabled: true,
    ttlSeconds: 3600,
    maxSize: 10000,
  },
};

/**
 * LLM request.
 *
 * Two calling conventions are supported:
 *  1. **Single-prompt** (`prompt` + optional `systemPrompt`) — legacy /
 *     simple callers. The gateway wraps them in a `messages` array.
 *  2. **Multi-message** (`messages`) — full Chat Completions style. Used
 *     by the RAG pipeline which already has the system + history + user
 *     messages assembled.
 */
export interface LLMRequest {
  prompt?: string;
  systemPrompt?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  provider?: 'openai' | 'anthropic' | 'google' | 'azure';
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  metadata?: {
    query?: string;
    tenantId?: string;
    agentId?: string;
    conversationId?: string;
  };
}

/**
 * LLM response
 */
export interface LLMResponse {
  content: string;
  model: string;
  provider: 'openai' | 'anthropic' | 'google' | 'azure';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  cached: boolean;
  citations?: Array<{
    number: number;
    source: string;
    documentTitle: string;
  }>;
}

/**
 * Streaming LLM chunk — yielded by {@link LLMGatewayService.generateStream}.
 */
export interface LLMStreamChunk {
  /** The text delta. */
  content: string;
  /** True once the LLM has finished generating. */
  done: boolean;
  /** Final usage stats (only present on the final chunk). */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * LLM statistics
 */
export interface LLMStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  providerUsage: {
    openai: number;
    anthropic: number;
    google: number;
    azure: number;
  };
  modelUsage: Record<string, number>;
  averageLatencyMs: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  fallbacks: number;
}
