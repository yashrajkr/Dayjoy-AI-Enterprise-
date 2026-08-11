import { Inject, Injectable, Logger } from '@nestjs/common';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import {
  DEFAULT_LLM_GATEWAY_CONFIG,
  LLMGatewayConfig,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMStats,
} from './llm-gateway-config';
import { createHash } from 'crypto';
import type OpenAI from 'openai';

/**
 * LLMGatewayService — multi-provider LLM gateway.
 *
 * Originally at `rag/evaluation/llm-gateway-service.ts` — MOVED to
 * `rag/response-pipeline/llm-gateway-service.ts` because the LLM gateway
 * is part of the response pipeline, not the evaluation framework. A
 * backward-compat re-export remains at the original path.
 *
 * Responsibilities:
 *
 *  1. **Provider abstraction.** A single `generate(request)` API routes
 *     to OpenAI / Anthropic / Google / Azure based on the routing
 *     strategy. Callers don't need to know which provider answered.
 *
 *  2. **Intelligent routing.** The default `cost_optimized` strategy
 *     picks the cheapest model that can handle the request complexity
 *     (estimated from prompt length). Override per-request via
 *     `request.provider` / `request.model`.
 *
 *  3. **Automatic fallback.** If the primary provider fails (rate limit,
 *     5xx, network), the gateway retries on the configured fallback
 *     provider. Fallbacks are logged + counted.
 *
 *  4. **Caching.** Identical requests (same prompt + systemPrompt +
 *     model + temperature) return the cached response for
 *     `caching.ttlSeconds` (default 1h). Cache lookups are SHA-256 keyed.
 *
 *  5. **Streaming.** `generateStream(request)` returns an
 *     `AsyncGenerator<LLMStreamChunk>` — used by `SearchService.searchStreaming`
 *     to stream tokens to the client via SSE.
 *
 *  6. **Cost tracking.** Every request's token usage is multiplied by a
 *     per-model price to compute an estimated cost. `getStats()` returns
 *     the running totals.
 *
 * The OpenAI path uses the shared `OPENAI_CLIENT` SDK (a global provider
 * via `SharedAiModule`) — gives us automatic retries, typed responses,
 * streaming. Other providers (Anthropic / Google / Azure) still use raw
 * `fetch()` since we don't have SDK clients for them in the stack.
 */
@Injectable()
export class LLMGatewayService {
  private readonly logger = new Logger(LLMGatewayService.name);
  private config: LLMGatewayConfig;
  private stats: LLMStats;
  private cache: Map<string, { response: LLMResponse; expiresAt: Date }> = new Map();

  constructor(@Inject(OPENAI_CLIENT) private readonly openai: OpenAI) {
    this.config = { ...DEFAULT_LLM_GATEWAY_CONFIG };
    this.stats = this.initializeStats();
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): LLMStats {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      providerUsage: {
        openai: 0,
        anthropic: 0,
        google: 0,
        azure: 0,
      },
      modelUsage: {},
      averageLatencyMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      fallbacks: 0,
    };
  }

  /**
   * Generate an LLM response (non-streaming).
   *
   * Two calling conventions:
   *  1. `request.prompt` (+ optional `request.systemPrompt`) — wrapped
   *     into a 2-message `messages` array internally.
   *  2. `request.messages` — used as-is (full Chat Completions style).
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    this.logger.log(
      `LLM request: ${request.model || 'default'} (${request.provider || 'auto'})`,
    );

    // Check cache.
    const cacheKey = this.getCacheKey(request);
    const cached = this.config.caching.enabled ? this.cache.get(cacheKey) : null;

    if (cached && cached.expiresAt > new Date()) {
      this.stats.cacheHits++;
      this.logger.debug('Cache hit for LLM request');
      return {
        ...cached.response,
        cached: true,
        latencyMs: Date.now() - startTime,
      };
    }

    this.stats.cacheMisses++;

    try {
      const provider = request.provider || this.selectProvider(request);
      const model = request.model || this.selectModel(provider, request);

      this.logger.debug(`Using ${provider}/${model}`);

      let response: LLMResponse;

      switch (provider) {
        case 'openai':
          response = await this.generateWithOpenAI(request, model);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(request, model);
          break;
        case 'google':
          response = await this.generateWithGoogle(request, model);
          break;
        case 'azure':
          response = await this.generateWithAzure(request, model);
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      // Stamp latency (the provider methods return 0 — they don't know
      // when the gateway's timer started).
      response.latencyMs = Date.now() - startTime;

      // Update stats.
      this.stats.totalTokens += response.usage.totalTokens;
      this.stats.totalCost += this.calculateCost(response);
      this.stats.providerUsage[provider]++;
      this.stats.modelUsage[model] = (this.stats.modelUsage[model] || 0) + 1;
      this.stats.averageLatencyMs =
        (this.stats.averageLatencyMs * (this.stats.totalRequests - 1) +
          response.latencyMs) /
        this.stats.totalRequests;

      // Cache response.
      if (this.config.caching.enabled) {
        this.cache.set(cacheKey, {
          response: { ...response, cached: false },
          expiresAt: new Date(Date.now() + this.config.caching.ttlSeconds * 1000),
        });

        // Prune cache if too large.
        if (this.cache.size > this.config.caching.maxSize) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
      }

      this.logger.log(
        `LLM response: ${response.usage.totalTokens} tokens, ${response.latencyMs}ms, $${this.calculateCost(response).toFixed(4)}`,
      );

      return response;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`LLM error: ${(error as Error).message}`);

      // Fallback to another provider.
      if (this.config.fallback.enabled && request.provider !== 'azure') {
        this.stats.fallbacks++;
        return this.handleFallback(request, error as Error);
      }

      throw error;
    }
  }

  /**
   * Generate an LLM response as a stream of token deltas.
   *
   * Currently only the OpenAI provider supports streaming (via the
   * `OPENAI_CLIENT` SDK). For other providers, the gateway falls back
   * to non-streaming generation and emits the full content as a single
   * chunk.
   */
  async *generateStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const provider = request.provider || this.selectProvider(request);
    const model = request.model || this.selectModel(provider, request);

    if (provider === 'openai') {
      yield* this.streamWithOpenAI(request, model);
      return;
    }

    // Fallback: generate non-streaming and emit as a single chunk.
    const response = await this.generate(request);
    yield {
      content: response.content,
      done: true,
      usage: response.usage,
    };
  }

  /**
   * Stream with OpenAI via the SDK.
   */
  private async *streamWithOpenAI(
    request: LLMRequest,
    model: string,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const messages = this.resolveMessages(request);

    const stream = await this.openai.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1000,
      top_p: request.topP ?? 1,
      frequency_penalty: request.frequencyPenalty ?? 0,
      presence_penalty: request.presencePenalty ?? 0,
      stream: true,
      stream_options: { include_usage: true },
    });

    let totalUsage: LLMStreamChunk['usage'] | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      const finishReason = chunk.choices?.[0]?.finish_reason;

      // OpenAI sends a final chunk with usage stats when
      // `stream_options.include_usage = true`.
      if (chunk.usage) {
        totalUsage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }

      if (delta) {
        yield { content: delta, done: false };
      }

      if (finishReason === 'stop') {
        yield { content: '', done: true, usage: totalUsage };
        return;
      }
    }

    // If the stream ended without a `finish_reason: stop`, emit a final
    // done chunk anyway so the caller's loop terminates.
    yield { content: '', done: true, usage: totalUsage };
  }

  /**
   * Resolve the `messages` array from either `request.messages` or
   * `request.prompt` + `request.systemPrompt`.
   */
  private resolveMessages(
    request: LLMRequest,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    if (request.messages && request.messages.length > 0) {
      return request.messages;
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: request.prompt || '',
    });
    return messages;
  }

  /**
   * Select provider based on routing strategy.
   */
  private selectProvider(request: LLMRequest): 'openai' | 'anthropic' | 'google' | 'azure' {
    const complexity = this.estimateComplexity(
      request.prompt || request.messages?.map((m) => m.content).join(' ') || '',
    );

    const rule = this.config.routing.rules.find((r) => r.complexity === complexity);

    if (rule && this.config.providers[rule.provider].enabled) {
      return rule.provider;
    }

    // Default to highest priority enabled provider.
    const providers = Object.entries(this.config.providers)
      .filter(([, config]) => config.enabled)
      .sort((a, b) => a[1].priority - b[1].priority);

    return providers[0][0] as 'openai' | 'anthropic' | 'google' | 'azure';
  }

  /**
   * Select model based on provider.
   */
  private selectModel(
    provider: 'openai' | 'anthropic' | 'google' | 'azure',
    _request: LLMRequest,
  ): string {
    const providerConfig = this.config.providers[provider];
    return providerConfig.models[0];
  }

  /**
   * Estimate query complexity from prompt length.
   */
  private estimateComplexity(prompt: string): 'low' | 'medium' | 'high' {
    const wordCount = prompt.split(/\s+/).filter(Boolean).length;

    if (wordCount < 20) return 'low';
    if (wordCount < 100) return 'medium';
    return 'high';
  }

  /**
   * Generate with OpenAI — uses the shared `OPENAI_CLIENT` SDK.
   */
  private async generateWithOpenAI(
    request: LLMRequest,
    model: string,
  ): Promise<LLMResponse> {
    const messages = this.resolveMessages(request);

    const completion = await this.openai.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1000,
      top_p: request.topP ?? 1,
      frequency_penalty: request.frequencyPenalty ?? 0,
      presence_penalty: request.presencePenalty ?? 0,
    });

    return {
      content: completion.choices[0]?.message?.content ?? '',
      model,
      provider: 'openai',
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
      latencyMs: 0, // Stamped by the caller.
      cached: false,
    };
  }

  /**
   * Generate with Anthropic (raw fetch — no SDK in the stack).
   */
  private async generateWithAnthropic(
    request: LLMRequest,
    model: string,
  ): Promise<LLMResponse> {
    const apiKey = this.config.providers.anthropic.apiKey;
    if (!apiKey) throw new Error('Anthropic API key not configured');

    const messages = this.resolveMessages(request);
    // Anthropic takes `system` as a top-level param, not in `messages`.
    const systemMessage = messages.find((m) => m.role === 'system')?.content;
    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 1000,
        system: systemMessage || 'You are a helpful assistant.',
        messages: userMessages,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.content[0].text,
      model,
      provider: 'anthropic',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      latencyMs: 0,
      cached: false,
    };
  }

  /**
   * Generate with Google Gemini (raw fetch).
   */
  private async generateWithGoogle(
    request: LLMRequest,
    model: string,
  ): Promise<LLMResponse> {
    const apiKey = this.config.providers.google.apiKey;
    if (!apiKey) throw new Error('Google API key not configured');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: request.prompt || '' }],
            },
          ],
          systemInstruction: {
            parts: [{ text: request.systemPrompt || 'You are a helpful assistant.' }],
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.candidates[0].content.parts[0].text,
      model,
      provider: 'google',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      latencyMs: 0,
      cached: false,
    };
  }

  /**
   * Generate with Azure OpenAI (raw fetch).
   */
  private async generateWithAzure(
    request: LLMRequest,
    model: string,
  ): Promise<LLMResponse> {
    const apiKey = this.config.providers.azure.apiKey;
    const apiBase = this.config.providers.azure.apiBase;
    if (!apiKey || !apiBase) throw new Error('Azure OpenAI not configured');

    const apiVersion = this.config.providers.azure.apiVersion || '2023-05-15';
    const messages = this.resolveMessages(request);

    const response = await fetch(
      `${apiBase}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1000,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Azure error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      model,
      provider: 'azure',
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      latencyMs: 0,
      cached: false,
    };
  }

  /**
   * Handle fallback to another provider.
   */
  private async handleFallback(request: LLMRequest, error: Error): Promise<LLMResponse> {
    this.logger.warn(`Falling back due to error: ${error.message}`);

    const currentProvider = request.provider || this.selectProvider(request);
    const providerConfig = this.config.providers[currentProvider];
    const fallbackProvider = providerConfig.fallback;

    if (!fallbackProvider || !this.config.providers[fallbackProvider].enabled) {
      throw error;
    }

    this.logger.log(`Falling back to ${fallbackProvider}`);

    return this.generate({
      ...request,
      provider: fallbackProvider,
    });
  }

  /**
   * Calculate cost based on tokens and model.
   */
  private calculateCost(response: LLMResponse): number {
    const pricing: Record<string, number> = {
      // OpenAI (per 1K tokens)
      'gpt-4o': 0.005,
      'gpt-4-turbo': 0.01,
      'gpt-3.5-turbo': 0.0005,
      // Anthropic (per 1K tokens)
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025,
      // Google (per 1K tokens)
      'gemini-pro': 0.00025,
      'gemini-ultra': 0.002,
    };

    const pricePer1K = pricing[response.model] || 0.001;
    return (response.usage.totalTokens / 1000) * pricePer1K;
  }

  /**
   * Get statistics.
   */
  getStats(): LLMStats {
    return { ...this.stats };
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('LLM cache cleared');
  }

  /**
   * Get cache key — SHA-256 of `{prompt, systemPrompt, messages, model, temperature}`.
   */
  private getCacheKey(request: LLMRequest): string {
    const keyData = JSON.stringify({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      messages: request.messages,
      model: request.model,
      temperature: request.temperature,
    });
    return createHash('sha256').update(keyData).digest('hex');
  }
}
