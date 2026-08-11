/**
 * Voice AI Simulator
 * ==================
 *
 * A lightweight in-process simulator that exercises the contract of
 * the Dayjoy Voice AI stack — `VapiCallStartedHandler` + the seven
 * `VapiFlow` implementations + the eight `VapiTool`s + Redis session
 * memory + customer profile.
 *
 * The simulator does NOT make real Vapi REST calls and does NOT use a
 * real OpenAI key. Every external dependency is mocked:
 *
 *   - OpenAI → `createMockOpenAI()` (chat + embeddings).
 *   - Vapi REST → `createMockVapiClient()`.
 *   - Postgres → `createMockPrismaService()`.
 *   - Redis → `createMockRedis()`.
 *
 * The simulator's `simulateInboundCall(phone, opts)` returns a transcript
 * + session + welcome message that the voice tests can assert on.
 *
 * ## Why a simulator instead of importing the real handler?
 *
 * The real `VapiCallStartedHandler` has 7+ NestJS-injected dependencies
 * (Prisma, SessionMemory, CustomerProfile, etc.) and a 336-line
 * `handle()` method. Importing it would force every voice test to
 * build a NestJS TestingModule with all the providers wired up — too
 * heavy for unit-style assertions on greetings / product flows /
 * escalation rules. The simulator faithfully reproduces the
 * **behavioural contract** documented in
 * `vapi/webhooks/vapi-call-started-handler.ts#buildWelcomeMessage` and
 * `vapi/flows/vapi-conversation-flow-manager.ts#processFlow` so the
 * tests can drive it deterministically.
 *
 * Reference: `vapi/webhooks/vapi-call-started-handler.ts`,
 *            `vapi/flows/vapi-conversation-flow-manager.ts`,
 *            `vapi/tools/vapi-tool-registry.service.ts`.
 */

import { vi } from 'vitest';
import { createMockPrisma } from './mocks';
import { createMockRedis } from './mocks';
import { createMockOpenAI } from './mocks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptTurn {
  role: 'ASSISTANT' | 'USER' | 'SYSTEM' | 'TOOL';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  timestamp: number;
}

export interface SimulatedCallOptions {
  /** Mock the wall-clock time the call started (HH:MM, 24-hour). */
  mockTime?: string;
  /** The caller's customer profile (if they're a known customer). */
  customer?: {
    id: string;
    firstName?: string;
    lastName?: string;
    customerType?: 'CUSTOMER' | 'DISTRIBUTOR' | 'LEAD';
    recentOrders?: Array<{ id: string; totalAmount: number; status: string }>;
  };
  /** Pre-seed the session memory (e.g. for "customer calls again" tests). */
  seedMemory?: Record<string, unknown>;
  /** Pre-seed long-term memory facts (e.g. preferences). */
  seedMemories?: Array<{ key: string; value: string; category?: string }>;
  /** Tenant ID (default: 't1'). */
  tenantId?: string;
}

export interface SimulatedCall {
  callId: string;
  sessionId: string;
  phoneNumber: string;
  direction: 'INBOUND' | 'OUTBOUND';
  startedAt: Date;
  transcript: TranscriptTurn[];
  welcomeMessage: string;
  customerId?: string;
  conversationId?: string;
  toolsCalled: string[];
  escalated: boolean;
  escalateReason?: string;
  /** Add a user utterance and get the assistant's response. */
  sendUtterance: (text: string) => Promise<TranscriptTurn>;
  /** End the call. */
  end: () => Promise<void>;
  /** Inspect session memory. */
  getMemory: <T = unknown>(key: string) => T | undefined;
  /** Inspect the full session memory blob. */
  getAllMemory: () => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Welcome message builder — mirrors the real handler's logic
// ---------------------------------------------------------------------------

const BUSINESS_HOURS_START = 9; // 9 AM
const BUSINESS_HOURS_END = 18; // 6 PM

function isBusinessHours(timeStr: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!m) return true;
  const hour = parseInt(m[1]!, 10);
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

function buildWelcomeMessage(opts: {
  customer?: SimulatedCallOptions['customer'];
  mockTime?: string;
}): string {
  const { customer, mockTime } = opts;
  const inBusinessHours = mockTime ? isBusinessHours(mockTime) : true;

  // No customer → generic greeting.
  if (!customer) {
    if (!inBusinessHours) {
      return 'Thank you for calling Dayjoy. We are currently outside our business hours, but I can still help with general information. How can I assist you?';
    }
    return 'Hi! Thank you for calling Dayjoy. This is Sarah, your virtual assistant. How can I help you today?';
  }

  const name = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(' ');
  const isDistributor = (customer.customerType ?? '').toUpperCase() === 'DISTRIBUTOR';

  if (!inBusinessHours) {
    return `Thank you for calling Dayjoy, ${name || 'there'}. We are currently outside our business hours, but I can still help with general information. How can I assist you?`;
  }

  if (isDistributor) {
    return `Hello ${name || 'there'}! Thank you for calling Dayjoy. This is Sarah. How can I help you with your business today?`;
  }

  if (customer.recentOrders?.length) {
    return `Welcome back, ${name || 'friend'}! Thanks for calling Dayjoy again. I see you have a recent order — would you like an update, or is there something else I can help with?`;
  }

  return `Welcome back, ${name || 'friend'}! Thank you for calling Dayjoy. How can I help you today?`;
}

// ---------------------------------------------------------------------------
// Intent detection — mirrors the heuristic in VapiConversationFlowManager
// ---------------------------------------------------------------------------

export type VoiceIntent =
  | 'product_inquiry'
  | 'customer_support'
  | 'distributor_support'
  | 'business_plan'
  | 'appointment_booking'
  | 'lead_collection'
  | 'human_escalation'
  | 'greeting'
  | 'unknown';

const INTENT_KEYWORDS: Array<{ intent: VoiceIntent; regex: RegExp }> = [
  { intent: 'human_escalation', regex: /\b(human|agent|manager|supervisor|talk to a person)\b/i },
  // Use `products?` to match both "product" and "products". Same for
  // `tonics?`, `creams?`, `supplements?`.
  { intent: 'product_inquiry', regex: /\b(products?|price|cost|recommend|how much|tonics?|creams?|supplements?)\b/i },
  { intent: 'customer_support', regex: /\b(order|complaint|issue|refund|return|delayed|broken|damaged)\b/i },
  { intent: 'distributor_support', regex: /\b(commission|downline|rank|pv|group volume|sponsor payout)\b/i },
  // Allow "join" or "joining" (use word boundary + optional -ing suffix).
  { intent: 'business_plan', regex: /\b(become a distributor|join(?:ing)?|business opportunity|compensation plan|sign up)\b/i },
  { intent: 'appointment_booking', regex: /\b(schedule|appointment|meeting|meet|book a call|set up a (call|time|meeting))\b/i },
  { intent: 'lead_collection', regex: /\b(interested|leave my number|call me back|contact me)\b/i },
  { intent: 'greeting', regex: /\b(hi|hello|hey|good (morning|afternoon|evening))\b/i },
];

function detectIntent(userMessage: string): VoiceIntent {
  for (const { intent, regex } of INTENT_KEYWORDS) {
    if (regex.test(userMessage)) return intent;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Tool dispatch — mirrors VapiToolRegistry.execute
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  success: boolean;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  speak?: string;
}

export interface VoiceSimulatorDeps {
  /** Mocked tools registry (name → handler). */
  tools?: Record<string, (args: any, ctx: any) => Promise<ToolCallResult>>;
  /** Mocked flow responses keyed by intent. */
  flowResponses?: Partial<Record<VoiceIntent, (utterance: string, ctx: any) => Promise<string>>>;
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

export function createVoiceSimulator(deps: VoiceSimulatorDeps = {}) {
  const prisma = createMockPrisma();
  const redis = createMockRedis();
  const openai = createMockOpenAI();
  const calls = new Map<string, SimulatedCall>();

  // Default tool handlers — tests can override.
  const tools = deps.tools ?? {};
  const flowResponses = deps.flowResponses ?? {};

  async function simulateInboundCall(
    phoneNumber: string,
    options: SimulatedCallOptions = {},
  ): Promise<SimulatedCall> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `sess_${callId}`;
    const tenantId = options.tenantId ?? 't1';
    const startedAt = options.mockTime
      ? new Date(`2025-01-15T${options.mockTime}:00Z`)
      : new Date();

    // Seed Redis session memory.
    const seed: Record<string, unknown> = {
      callId,
      phoneNumber,
      fromNumber: phoneNumber,
      tenantId,
      startedAt: startedAt.toISOString(),
      ...(options.customer ? { customer: options.customer } : {}),
      ...(options.seedMemory ?? {}),
    };
    await redis.set(sessionId, JSON.stringify(seed));

    // Seed long-term memories (Prisma aiMemory).
    const prismaAny = prisma as any;
    if (options.seedMemories?.length) {
      prismaAny.aiMemory.findMany.mockResolvedValue(
        options.seedMemories.map((m, i) => ({
          id: `mem-${i}`,
          tenantId,
          customerId: options.customer?.id ?? null,
          key: m.key,
          value: m.value,
          category: m.category ?? 'PREFERENCE',
          createdAt: new Date(),
        })),
      );
    }

    // Resolve customer.
    let customerId: string | undefined;
    if (options.customer) {
      customerId = options.customer.id;
      prisma.customer.findFirst.mockResolvedValue({
        id: options.customer.id,
        tenantId,
        firstName: options.customer.firstName ?? null,
        lastName: options.customer.lastName ?? null,
        phone: phoneNumber,
        customerType: options.customer.customerType ?? 'CUSTOMER',
      });
    }

    // Create VoiceSession row.
    prismaAny.voiceSession = prismaAny.voiceSession ?? {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    prismaAny.voiceSession.findUnique.mockResolvedValue(null);
    const sessionRow = {
      id: sessionId,
      tenantId,
      callId,
      phoneNumber,
      status: 'IN_PROGRESS',
      startedAt,
      conversationId: `conv_${callId}`,
      metadata: { direction: 'INBOUND', from: phoneNumber },
    };
    prismaAny.voiceSession.create.mockResolvedValue(sessionRow);

    // Build welcome message.
    const welcomeMessage = buildWelcomeMessage({
      customer: options.customer,
      mockTime: options.mockTime,
    });

    const transcript: TranscriptTurn[] = [
      {
        role: 'ASSISTANT',
        content: welcomeMessage,
        timestamp: startedAt.getTime(),
      },
    ];

    const toolsCalled: string[] = [];
    let escalated = false;
    let escalateReason: string | undefined;

    const ctx = {
      tenantId,
      callId,
      sessionId,
      phoneNumber,
      customerId,
      conversationId: sessionRow.conversationId,
    };

    const sendUtterance = vi.fn(async (text: string): Promise<TranscriptTurn> => {
      const userTurn: TranscriptTurn = {
        role: 'USER',
        content: text,
        timestamp: Date.now(),
      };
      transcript.push(userTurn);

      // Detect intent.
      const intent = detectIntent(text);

      // Escalation detection.
      if (intent === 'human_escalation') {
        escalated = true;
        escalateReason = 'Customer requested human agent';
        const escalationMsg =
          "I understand you'd like to speak with a human agent. Let me transfer you to a team member who can help. Please hold for a moment.";
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: escalationMsg,
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      // Detect frustration / repeated complaints → escalate.
      const frustration = /\b(angry|frustrated|unacceptable|ridiculous|furious|done with this)\b/i.test(
        text,
      );
      if (frustration) {
        escalated = true;
        escalateReason = 'Customer expressed frustration';
        const msg =
          "I can hear this has been really frustrating for you. I'm going to transfer you to a senior team member right away who can resolve this. Please hold.";
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: msg,
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      // Try tool dispatch for known intents.
      if (intent === 'product_inquiry' && tools.search_products) {
        toolsCalled.push('search_products');
        const toolResult = await tools.search_products({ query: text }, ctx);
        const speak = toolResult.speak ?? (toolResult.result as any)?.answer ?? 'Let me look that up.';
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: speak,
          toolName: 'search_products',
          toolArgs: { query: text },
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      if (intent === 'customer_support' && tools.search_knowledge) {
        toolsCalled.push('search_knowledge');
        const toolResult = await tools.search_knowledge({ query: text }, ctx);
        const speak = toolResult.speak ?? (toolResult.result as any)?.answer ?? 'Let me check that for you.';
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: speak,
          toolName: 'search_knowledge',
          toolArgs: { query: text },
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      if (intent === 'business_plan' && tools.create_lead) {
        toolsCalled.push('create_lead');
        const toolResult = await tools.create_lead(
          {
            firstName: options.customer?.firstName ?? 'Caller',
            lastName: options.customer?.lastName ?? '',
            email: 'unknown@example.com',
            phone: phoneNumber,
            interest: 'business',
          },
          ctx,
        );
        const speak =
          toolResult.speak ??
          "I've captured your interest in joining Dayjoy. A team member will reach out to you shortly.";
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: speak,
          toolName: 'create_lead',
          toolArgs: { interest: 'business' },
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      if (intent === 'appointment_booking' && tools.book_appointment) {
        toolsCalled.push('book_appointment');
        const toolResult = await tools.book_appointment(
          {
            title: 'Customer-requested appointment',
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            department: 'sales',
          },
          ctx,
        );
        const speak =
          toolResult.speak ??
          "I've scheduled an appointment for you. You'll receive a confirmation shortly.";
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: speak,
          toolName: 'book_appointment',
          toolArgs: { department: 'sales' },
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      if (intent === 'lead_collection' && tools.create_lead) {
        toolsCalled.push('create_lead');
        const toolResult = await tools.create_lead(
          {
            firstName: 'Caller',
            lastName: '',
            email: 'unknown@example.com',
            phone: phoneNumber,
            interest: 'product',
          },
          ctx,
        );
        const speak =
          toolResult.speak ??
          "Thanks! I've noted your contact details. Our team will get in touch with you soon.";
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: speak,
          toolName: 'create_lead',
          toolArgs: { interest: 'product' },
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      if (intent === 'distributor_support' && tools.distributor_lookup) {
        toolsCalled.push('distributor_lookup');
        const toolResult = await tools.distributor_lookup({ phone: phoneNumber }, ctx);
        const speak = toolResult.speak ?? 'Let me pull up your distributor information.';
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: speak,
          toolName: 'distributor_lookup',
          toolArgs: { phone: phoneNumber },
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      // Custom flow response if provided.
      if (flowResponses[intent]) {
        const msg = await flowResponses[intent](text, ctx);
        const assistantTurn: TranscriptTurn = {
          role: 'ASSISTANT',
          content: msg,
          timestamp: Date.now(),
        };
        transcript.push(assistantTurn);
        return assistantTurn;
      }

      // Fallback.
      const fallback =
        intent === 'greeting'
          ? "Hello! Thanks for calling Dayjoy. How can I help you today?"
          : "I want to make sure I understand. Could you tell me a bit more about what you're looking for — help with an order, product information, or something else?";
      const assistantTurn: TranscriptTurn = {
        role: 'ASSISTANT',
        content: fallback,
        timestamp: Date.now(),
      };
      transcript.push(assistantTurn);
      return assistantTurn;
    });

    const end = vi.fn(async () => {
      await redis.del(sessionId);
      prismaAny.voiceSession.update.mockResolvedValue({
        ...sessionRow,
        status: 'COMPLETED',
        endedAt: new Date(),
      });
    });

    const getMemory = <T = unknown>(key: string): T | undefined => {
      const raw = redis.store.get(sessionId);
      if (!raw) return undefined;
      try {
        const blob = JSON.parse(raw);
        return blob[key] as T | undefined;
      } catch {
        return undefined;
      }
    };

    const getAllMemory = (): Record<string, unknown> => {
      const raw = redis.store.get(sessionId);
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };

    const call: SimulatedCall = {
      callId,
      sessionId,
      phoneNumber,
      direction: 'INBOUND',
      startedAt,
      transcript,
      welcomeMessage,
      customerId,
      conversationId: sessionRow.conversationId,
      // Use getters so the live state of `escalated` / `escalateReason`
      // (mutated by `sendUtterance`) is reflected when tests assert on
      // `call.escalated` after the call has progressed.
      get escalated(): boolean {
        return escalated;
      },
      get escalateReason(): string | undefined {
        return escalateReason;
      },
      toolsCalled,
      sendUtterance,
      end,
      getMemory,
      getAllMemory,
    };
    calls.set(callId, call);
    return call;
  }

  return {
    simulateInboundCall,
    // Mocked deps (for assertion). `prisma` is cast to `any` so tests
    // can assert on `sim.prisma.voiceSession.create` without TypeScript
    // complaining about the model not being in the strict mock type.
    prisma: prisma as any,
    redis,
    openai,
    _calls: calls,
  };
}

export type VoiceSimulator = ReturnType<typeof createVoiceSimulator>;
