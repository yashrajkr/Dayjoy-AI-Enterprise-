/**
 * WhatsApp AI Simulator
 * ======================
 *
 * A lightweight in-process simulator that exercises the contract of
 * the Dayjoy WhatsApp AI channel — webhook verification, signature
 * verification, inbound message processing, outbound message sending,
 * AI conversation flows, and 24-hour opt-in window enforcement.
 *
 * The simulator does NOT make real Meta Cloud API calls and does NOT
 * use a real OpenAI key. Every external dependency is mocked:
 *
 *   - Meta Cloud API → `createMockWhatsAppClient()`.
 *   - OpenAI → `createMockOpenAI()`.
 *   - Postgres → `createMockPrismaService()`.
 *   - Redis → `createMockRedis()`.
 *
 * Reference: `whatsapp-ai/README.md`,
 *            `_reference/whatsapp-python-reference/meta_client.py`,
 *            `_reference/whatsapp-python-reference/service.py`.
 */

import { vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createMockPrisma, createMockRedis, createMockOpenAI } from './mocks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppMessage {
  /** Message id from Meta (e.g. `wamid.HBgM...`). */
  id: string;
  /** Sender phone (E.164, e.g. `+919876543210`). */
  from: string;
  /** Recipient phone (the business number, E.164). */
  to: string;
  /** Message type. */
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'interactive' | 'template' | 'button';
  /** Message timestamp (Unix seconds, as Meta sends). */
  timestamp: string;
  /** Type-specific payload (text body, media id, interactive payload, etc.). */
  payload: {
    text?: string;
    mediaId?: string;
    mimeType?: string;
    caption?: string;
    interactiveType?: 'button_reply' | 'list_reply';
    buttonId?: string;
    buttonTitle?: string;
    listId?: string;
    listTitle?: string;
    templateName?: string;
    templateParams?: string[];
  };
  /** Whether the message was within the 24-hour customer-care window. */
  withinWindow: boolean;
}

export interface WhatsAppWebhookEvent {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<WhatsAppRawMessage>;
        statuses?: Array<WhatsAppRawStatus>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppRawMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string; sha256: string };
  document?: { id: string; mime_type: string; caption?: string; sha256: string; filename: string };
  audio?: { id: string; mime_type: string; sha256: string };
  video?: { id: string; mime_type: string; caption?: string; sha256: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description: string };
  };
  button?: { text: string; payload: string };
  context?: { from: string; id: string };
}

export interface WhatsAppRawStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: string };
    expiration_timestamp?: string;
  };
  errors?: Array<{ code: number; title: string }>;
}

export interface OutboundMessage {
  to: string;
  type: string;
  body?: string;
  mediaId?: string;
  templateName?: string;
  templateParams?: string[];
  interactive?: unknown;
}

export interface WhatsAppSimOptions {
  verifyToken?: string;
  appSecret?: string;
  /** Per-customer opt-in state (phone → optedIn bool). */
  optedIn?: Record<string, boolean>;
  /** Pre-seeded conversation history per phone. */
  conversations?: Record<string, WhatsAppMessage[]>;
  /** Tenant ID (default: 't1'). */
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

export function createWhatsAppSimulator(options: WhatsAppSimOptions = {}) {
  const verifyToken = options.verifyToken ?? 'dayjoy_test_verify_token';
  const appSecret = options.appSecret ?? 'dayjoy_test_app_secret';
  const tenantId = options.tenantId ?? 't1';

  const prisma = createMockPrisma();
  const redis = createMockRedis();
  const openai = createMockOpenAI();

  // Per-phone opt-in state.
  const optInState = new Map<string, boolean>(
    Object.entries(options.optedIn ?? {}),
  );

  // Per-phone last inbound timestamp (for 24-hour window enforcement).
  const lastInboundAt = new Map<string, number>();

  // Conversation history (per phone).
  const conversations = new Map<string, WhatsAppMessage[]>();
  if (options.conversations) {
    for (const [phone, msgs] of Object.entries(options.conversations)) {
      conversations.set(phone, [...msgs]);
    }
  }

  // Outbound message log.
  const outboundLog: OutboundMessage[] = [];

  // Processed webhook message ids (for idempotency).
  const processedMessageIds = new Set<string>();

  // AI auto-reply toggle. Default ON.
  let autoReplyEnabled = true;

  // Attach the `whatsappMessage` model to the prisma mock upfront so
  // tests can assert on `sim.prisma.whatsappMessage.create` without
  // first having to send an inbound message (which would lazy-create
  // the model on first use).
  const prismaAny = prisma as any;
  prismaAny.whatsappMessage = prismaAny.whatsappMessage ?? {
    create: vi.fn().mockResolvedValue({ id: 'msg_mock_1' }),
    update: vi.fn().mockResolvedValue({ id: 'msg_mock_1' }),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  };

  // ---------------------------------------------------------------------------
  // Webhook verification (GET)
  // ---------------------------------------------------------------------------

  function verifyWebhook(query: {
    'hub.mode': string;
    'hub.verify_token': string;
    'hub.challenge': string;
  }): { status: number; body: string } {
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === verifyToken
    ) {
      return { status: 200, body: query['hub.challenge'] };
    }
    return { status: 403, body: 'Forbidden' };
  }

  // ---------------------------------------------------------------------------
  // Signature verification
  // ---------------------------------------------------------------------------

  function verifySignature(payload: string, signatureHeader: string): boolean {
    const expected = 'sha256=' + createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');
    return signatureHeader === expected;
  }

  // ---------------------------------------------------------------------------
  // Inbound message processing
  // ---------------------------------------------------------------------------

  async function processInbound(raw: WhatsAppRawMessage): Promise<{
    accepted: boolean;
    reason?: string;
    message?: WhatsAppMessage;
    aiResponse?: OutboundMessage;
  }> {
    // Idempotency: skip if already processed.
    if (processedMessageIds.has(raw.id)) {
      return { accepted: false, reason: 'duplicate_message_id' };
    }
    processedMessageIds.add(raw.id);

    const from = `+${raw.from}`;
    // An inbound message OPENS the 24-hour customer-care window for
    // that sender — so this message is, by definition, within window.
    lastInboundAt.set(from, Date.now());
    const withinWindow = true;

    // Normalize the raw message into a WhatsAppMessage.
    const message: WhatsAppMessage = {
      id: raw.id,
      from,
      to: '+919999900000', // business number (mocked)
      type: raw.type as WhatsAppMessage['type'],
      timestamp: raw.timestamp,
      payload: {},
      withinWindow,
    };

    if (raw.text) message.payload.text = raw.text.body;
    if (raw.image) {
      message.payload.mediaId = raw.image.id;
      message.payload.mimeType = raw.image.mime_type;
      message.payload.caption = raw.image.caption;
    }
    if (raw.document) {
      message.payload.mediaId = raw.document.id;
      message.payload.mimeType = raw.document.mime_type;
      message.payload.caption = raw.document.caption;
    }
    if (raw.audio) {
      message.payload.mediaId = raw.audio.id;
      message.payload.mimeType = raw.audio.mime_type;
    }
    if (raw.interactive) {
      message.payload.interactiveType = raw.interactive.type;
      if (raw.interactive.button_reply) {
        message.payload.buttonId = raw.interactive.button_reply.id;
        message.payload.buttonTitle = raw.interactive.button_reply.title;
      }
      if (raw.interactive.list_reply) {
        message.payload.listId = raw.interactive.list_reply.id;
        message.payload.listTitle = raw.interactive.list_reply.title;
      }
    }
    if (raw.button) {
      message.payload.buttonId = raw.button.payload;
      message.payload.buttonTitle = raw.button.text;
    }

    // Persist to conversation history.
    const history = conversations.get(from) ?? [];
    history.push(message);
    conversations.set(from, history);

    // Persist to Prisma (mocked).
    const prismaAny = prisma as any;
    prismaAny.whatsappMessage = prismaAny.whatsappMessage ?? {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    };
    await prismaAny.whatsappMessage.create({
      data: {
        tenantId,
        messageId: message.id,
        from: message.from,
        to: message.to,
        type: message.type,
        direction: 'INBOUND',
        payload: message.payload as any,
        timestamp: new Date(parseInt(message.timestamp, 10) * 1000),
        status: 'RECEIVED',
      },
    }).catch(() => null);

    // Auto-reply only if within 24-hour window + opted in.
    const optedIn = optInState.get(from) ?? true;
    if (withinWindow && optedIn && autoReplyEnabled) {
      const aiResponse = generateAutoReply(message);
      if (aiResponse) {
        outboundLog.push(aiResponse);
        return { accepted: true, message, aiResponse };
      }
    }

    return { accepted: true, message };
  }

  // ---------------------------------------------------------------------------
  // 24-hour window check
  // ---------------------------------------------------------------------------

  function isInWindow(phone: string): boolean {
    const last = lastInboundAt.get(phone);
    if (!last) return false;
    const elapsed = Date.now() - last;
    return elapsed < 24 * 60 * 60 * 1000;
  }

  // ---------------------------------------------------------------------------
  // Auto-reply generation (mocked AI)
  // ---------------------------------------------------------------------------

  function generateAutoReply(message: WhatsAppMessage): OutboundMessage | null {
    if (message.type === 'text') {
      const text = message.payload.text ?? '';
      if (/hi|hello|hey/i.test(text)) {
        return {
          to: message.from,
          type: 'text',
          body:
            "Hi! Welcome to Dayjoy. I'm your AI assistant. How can I help you today? " +
            'You can ask about our products, your order, or anything else.',
        };
      }
      if (/product|price|cost/i.test(text)) {
        return {
          to: message.from,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Which product are you interested in?' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'btn_health', title: 'Health Tonic' } },
                { type: 'reply', reply: { id: 'btn_beauty', title: 'Beauty Cream' } },
                { type: 'reply', reply: { id: 'btn_home', title: 'Home Care Kit' } },
              ],
            },
          },
        };
      }
      if (/order|track|status/i.test(text)) {
        return {
          to: message.from,
          type: 'text',
          body: "Let me check your order status. Could you share your order ID?",
        };
      }
      if (/refund|return/i.test(text)) {
        return {
          to: message.from,
          type: 'text',
          body:
            'Our return policy allows 7-day returns on unopened products. ' +
            'Refunds are processed within 5–7 business days.',
        };
      }
      if (/human|agent/i.test(text)) {
        return {
          to: message.from,
          type: 'text',
          body:
            "I'm transferring you to a human agent. They'll be with you shortly.",
        };
      }
      // Default AI reply.
      return {
        to: message.from,
        type: 'text',
        body:
          "Thanks for your message! I'm here to help with products, orders, returns, and more. What would you like to know?",
      };
    }

    if (message.type === 'interactive') {
      const title = message.payload.buttonTitle ?? message.payload.listTitle ?? '';
      return {
        to: message.from,
        type: 'text',
        body: `Great choice — ${title}! Let me get you more details.`,
      };
    }

    if (message.type === 'image' || message.type === 'document' || message.type === 'audio') {
      return {
        to: message.from,
        type: 'text',
        body: "Thanks for sharing that. Could you tell me what you'd like help with?",
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Outbound message API
  // ---------------------------------------------------------------------------

  async function sendText(to: string, body: string): Promise<OutboundMessage> {
    const msg: OutboundMessage = { to, type: 'text', body };
    outboundLog.push(msg);
    return msg;
  }

  async function sendTemplate(
    to: string,
    templateName: string,
    templateParams: string[] = [],
  ): Promise<OutboundMessage> {
    const msg: OutboundMessage = { to, type: 'template', templateName, templateParams };
    outboundLog.push(msg);
    return msg;
  }

  async function sendInteractive(to: string, interactive: unknown): Promise<OutboundMessage> {
    const msg: OutboundMessage = { to, type: 'interactive', interactive };
    outboundLog.push(msg);
    return msg;
  }

  async function sendMedia(
    to: string,
    mediaId: string,
    type: 'image' | 'document' | 'audio',
    caption?: string,
  ): Promise<OutboundMessage> {
    const msg: OutboundMessage = { to, type, mediaId, body: caption };
    outboundLog.push(msg);
    return msg;
  }

  // ---------------------------------------------------------------------------
  // Opt-in management
  // ---------------------------------------------------------------------------

  function optIn(phone: string): void {
    optInState.set(phone, true);
  }

  function optOut(phone: string): void {
    optInState.set(phone, false);
  }

  function isOptedIn(phone: string): boolean {
    return optInState.get(phone) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Status update processing
  // ---------------------------------------------------------------------------

  async function processStatusUpdate(raw: WhatsAppRawStatus): Promise<{
    accepted: boolean;
    status?: string;
  }> {
    const prismaAny = prisma as any;
    prismaAny.whatsappMessage = prismaAny.whatsappMessage ?? {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    };
    await prismaAny.whatsappMessage.update({
      where: { messageId: raw.id },
      data: { status: raw.status.toUpperCase() },
    }).catch(() => null);
    return { accepted: true, status: raw.status };
  }

  // ---------------------------------------------------------------------------
  // Webhook event processing (entry point)
  // ---------------------------------------------------------------------------

  async function processWebhookEvent(
    event: WhatsAppWebhookEvent,
  ): Promise<{ accepted: boolean; processed: number }> {
    let processed = 0;
    for (const entry of event.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value.messages ?? []) {
          const result = await processInbound(msg);
          // Only count actually-accepted messages toward `processed`
          // (duplicate message ids are skipped — idempotency).
          if (result.accepted) processed++;
        }
        for (const status of change.value.statuses ?? []) {
          await processStatusUpdate(status);
          processed++;
        }
      }
    }
    return { accepted: true, processed };
  }

  // ---------------------------------------------------------------------------
  // Public surface
  // ---------------------------------------------------------------------------

  return {
    // Config
    verifyToken,
    appSecret,
    tenantId,

    // Mocked deps (for assertion). `prisma` is cast to `any` so tests
    // can assert on `sim.prisma.whatsappMessage.create` without
    // TypeScript complaining about the model not being in the strict
    // mock type.
    prisma: prisma as any,
    redis,
    openai,

    // Webhook
    verifyWebhook,
    verifySignature,
    processWebhookEvent,
    processInbound,
    processStatusUpdate,

    // Outbound
    sendText,
    sendTemplate,
    sendInteractive,
    sendMedia,

    // Opt-in
    optIn,
    optOut,
    isOptedIn,

    // Window
    isInWindow,

    // Inspection
    _outboundLog: outboundLog,
    _conversations: conversations,
    _processedMessageIds: processedMessageIds,
    _optInState: optInState,
    _lastInboundAt: lastInboundAt,

    // Test helpers
    _setAutoReply: (enabled: boolean) => { autoReplyEnabled = enabled; },
    _resetOutbound: () => { outboundLog.length = 0; },
    _seedInbound: (phone: string, ts: number = Date.now()) => {
      lastInboundAt.set(phone, ts);
    },
  };
}

export type WhatsAppSimulator = ReturnType<typeof createWhatsAppSimulator>;

// ---------------------------------------------------------------------------
// Webhook event builders — match Meta's payload shape
// ---------------------------------------------------------------------------

export function buildTextMessageWebhook(
  from: string,
  text: string,
  messageId: string = `wamid_${Math.random().toString(36).slice(2)}`,
  timestamp: string = Math.floor(Date.now() / 1000).toString(),
): WhatsAppWebhookEvent {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'wba_id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919999900000',
                phone_number_id: 'phone_id_1',
              },
              contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
              messages: [
                {
                  from: from.replace('+', ''),
                  id: messageId,
                  timestamp,
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

export function buildInteractiveButtonReplyWebhook(
  from: string,
  buttonId: string,
  buttonTitle: string,
  messageId: string = `wamid_${Math.random().toString(36).slice(2)}`,
): WhatsAppWebhookEvent {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'wba_id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919999900000',
                phone_number_id: 'phone_id_1',
              },
              contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
              messages: [
                {
                  from: from.replace('+', ''),
                  id: messageId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: { id: buttonId, title: buttonTitle },
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

export function buildStatusWebhook(
  messageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  recipientId: string,
): WhatsAppWebhookEvent {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'wba_id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919999900000',
                phone_number_id: 'phone_id_1',
              },
              statuses: [
                {
                  id: messageId,
                  status,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: recipientId,
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}
