/**
 * Dayjoy AI Enterprise — Mock External Services
 * ==============================================
 *
 * Deterministic mocks for the three external services the platform calls:
 *   1. OpenAI (chat completions + embeddings)
 *   2. Vapi (voice AI session lifecycle)
 *   3. WhatsApp Cloud API (template messages + inbound webhooks)
 *
 * The mocks are functions, not servers — they're injected into the
 * `http()` helper via the `fetch` interceptor so tests can override
 * responses without spinning up extra ports.
 *
 * For tests that need the *real* network behaviour (timeouts, retries,
 * partial responses), the `delay()`, `fail()`, and `partial()` helpers
 * return canned responses designed to stress the calling code.
 */

import { vi } from 'vitest';

export interface OpenAiMockOptions {
  /** Override the canned response for a specific prompt substring. */
  responses?: { match: string; reply: string }[];
  /** Force every call to throw this error. */
  error?: Error;
  /** Force every call to sleep this long (simulates latency). */
  delayMs?: number;
}

/**
 * Build a mock OpenAI chat-completions client. The signature matches
 * `openai.chat.completions.create` from the `openai` npm package.
 */
export function createOpenAiMock(opts: OpenAiMockOptions = {}) {
  const callLog: { prompt: string; at: number }[] = [];

  const create = vi.fn(async (params: any) => {
    if (opts.error) throw opts.error;
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));

    const prompt = params.messages?.map((m: any) => m.content ?? '').join('\n') ?? '';
    callLog.push({ prompt, at: Date.now() });

    let reply = 'I can help with that. Could you provide more details?';
    if (opts.responses) {
      for (const r of opts.responses) {
        if (prompt.toLowerCase().includes(r.match.toLowerCase())) {
          reply = r.reply;
          break;
        }
      }
    }

    return {
      id: `chatcmpl-mock-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: params.model ?? 'gpt-4o-mock',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: reply },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 42, completion_tokens: 18, total_tokens: 60 },
    };
  });

  return {
    chat: { completions: { create } },
    embeddings: {
      create: vi.fn(async (params: any) => ({
        object: 'list',
        model: params.model ?? 'text-embedding-3-small-mock',
        data: params.input.map((_: string, i: number) => ({
          object: 'embedding',
          index: i,
          embedding: Array.from({ length: 1536 }, () => Math.random()),
        })),
        usage: { prompt_tokens: 12, total_tokens: 12 },
      })),
    },
    callLog,
    // Test-only: reset the call log between cases.
    reset: () => callLog.length = 0,
  };
}

export interface VapiMockOptions {
  /** What the assistant says on the call. */
  transcript?: string[];
  /** Simulate a call failure with this status code. */
  failWith?: number;
}

/** Mock Vapi voice AI session. */
export function createVapiMock(opts: VapiMockOptions = {}) {
  const sessions: Map<string, { id: string; status: string; transcript: string[] }> = new Map();

  const createCall = vi.fn(async (params: any) => {
    if (opts.failWith) throw new Error(`Vapi call failed: HTTP ${opts.failWith}`);
    const id = `vapi_${Date.now()}`;
    sessions.set(id, { id, status: 'active', transcript: opts.transcript ?? ['Hello, how can I help?'] });
    return { id, status: 'active', assistantId: params.assistantId };
  });

  const endCall = vi.fn(async (id: string) => {
    const s = sessions.get(id);
    if (s) s.status = 'ended';
    return { id, status: 'ended' };
  });

  const getCall = vi.fn(async (id: string) => sessions.get(id) ?? null);

  return { calls: { create: createCall, end: endCall, get: getCall }, sessions };
}

export interface WhatsappMockOptions {
  /** Force inbound webhook signature to be invalid. */
  invalidSignature?: boolean;
  /** Delay outbound message delivery (ms). */
  sendDelayMs?: number;
}

/** Mock WhatsApp Cloud API. */
export function createWhatsappMock(opts: WhatsappMockOptions = {}) {
  const sent: { to: string; template: string; params: any; at: number }[] = [];

  const send = vi.fn(async (params: { to: string; template: string; params?: any }) => {
    if (opts.sendDelayMs) await new Promise((r) => setTimeout(r, opts.sendDelayMs));
    sent.push({ ...params, at: Date.now() });
    return { messageId: `wamid_${Date.now()}`, status: 'sent' };
  });

  const verifyWebhook = vi.fn((signature: string) => {
    if (opts.invalidSignature) return false;
    return signature === 'sha256=valid-mock-signature';
  });

  return { send, verifyWebhook, sent, reset: () => sent.length = 0 };
}

/** Convenience: build a mock RAG retriever that returns the K most relevant
 *  chunks for a query (deterministic — keyword-overlap scoring). */
export function createRagRetrieverMock(chunks: { id: string; text: string; source: string }[]) {
  const queryLog: { query: string; topK: number; at: number }[] = [];

  return {
    retrieve: vi.fn(async (query: string, topK = 5) => {
      queryLog.push({ query, topK, at: Date.now() });
      const q = query.toLowerCase();
      const scored = chunks.map((c) => {
        const words = q.split(/\s+/);
        const hits = words.filter((w) => w.length > 2 && c.text.toLowerCase().includes(w)).length;
        return { ...c, score: hits / Math.max(1, words.length) };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    }),
    queryLog,
    reset: () => queryLog.length = 0,
  };
}

export const ragChunks = [
  {
    id: 'chunk_return_policy_1',
    source: 'return-policy.md',
    text: 'You can return any unopened product within 30 days of delivery for a full refund. Opened products may be returned within 7 days if defective.',
  },
  {
    id: 'chunk_return_policy_2',
    source: 'return-policy.md',
    text: 'Refunds are processed within 5-7 business days to the original payment method. Refunds for cash-on-delivery orders are issued to the customer wallet.',
  },
  {
    id: 'chunk_distributor_onboarding_1',
    source: 'distributor-onboarding.md',
    text: 'To become a Dayjoy distributor, register at /register, choose the distributor track, and enter your sponsor code. If you do not have a sponsor, select "Find me a sponsor".',
  },
  {
    id: 'chunk_distributor_tiers_1',
    source: 'distributor-tiers.md',
    text: 'Distributor tiers are BRONZE (3%), SILVER (5%), GOLD (7%), PLATINUM (10%), DIAMOND (15%). Tier upgrades trigger automatically when monthly sales goals are met for 3 consecutive months.',
  },
  {
    id: 'chunk_shipping_1',
    source: 'shipping.md',
    text: 'Standard delivery is 3-5 business days across India. Express delivery (1-2 days) is available in major metros. Free shipping on orders above Rs. 999.',
  },
  {
    id: 'chunk_payment_methods_1',
    source: 'payment-methods.md',
    text: 'We accept UPI, credit/debit cards, net banking, and cash on delivery. EMI is available on orders above Rs. 5,000.',
  },
  {
    id: 'chunk_product_care_1',
    source: 'product-care.md',
    text: 'Store wellness products in a cool, dry place. Skincare products should be used within 12 months of opening. Keep protein powder sealed after each use.',
  },
  {
    id: 'chunk_commission_calc_1',
    source: 'commission-rules.md',
    text: 'Commissions are calculated as order total × tier rate. Team commissions apply to direct downline sales at half the personal rate. Payouts are processed on the 1st of each month.',
  },
];
