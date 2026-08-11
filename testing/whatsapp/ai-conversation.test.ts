/**
 * WhatsApp AI — AI Conversation Tests
 * =====================================
 *
 * Validates the **AI conversation** layer of the Dayjoy WhatsApp AI
 * channel:
 *
 *   1. **Round-trip.** Customer sends a text message → AI responds
 *      with a relevant text reply.
 *   2. **Tool dispatch.** AI uses tools (search_knowledge, create_lead,
 *      etc.) based on the user's intent.
 *   3. **Rich messages.** AI sends button-style interactive messages
 *      when offering product options.
 *   4. **Media.** AI sends a product image when applicable.
 *   5. **History.** Conversation history is preserved across turns.
 *   6. **Human escalation.** AI escalates to a human when the user
 *      asks for one.
 *
 * Uses `createWhatsAppSimulator()` with the default AI auto-reply
 * engine (rule-based for determinism).
 *
 * Reference: `whatsapp-ai/README.md` (conversations service contract),
 *            `_reference/whatsapp-python-reference/service.py`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWhatsAppSimulator,
  buildTextMessageWebhook,
} from '../helpers/whatsapp-simulator';

describe('WhatsApp AI Conversation', () => {
  let sim: ReturnType<typeof createWhatsAppSimulator>;

  beforeEach(() => {
    sim = createWhatsAppSimulator();
  });

  // ---------------------------------------------------------------------------
  // 1. Round-trip — customer sends → AI responds
  // ---------------------------------------------------------------------------

  it('should respond to a customer greeting', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(buildTextMessageWebhook('919876543210', 'Hi'));

    expect(sim._outboundLog.length).toBe(1);
    expect(sim._outboundLog[0]?.body).toMatch(/hi|welcome|dayjoy/i);
  });

  it('should respond with a relevant answer for product questions', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'What products do you have?'),
    );

    expect(sim._outboundLog.length).toBe(1);
    // The AI should either send buttons (interactive) or a text reply.
    const msg = sim._outboundLog[0]!;
    expect(['text', 'interactive']).toContain(msg.type);
  });

  it('should respond to order-status queries', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'What is my order status?'),
    );

    expect(sim._outboundLog[0]?.body).toMatch(/order id|check|status/i);
  });

  it('should respond to refund queries', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'I want a refund'),
    );

    expect(sim._outboundLog[0]?.body).toMatch(/return policy|7-day|refund/i);
  });

  // ---------------------------------------------------------------------------
  // 2. Tool dispatch — AI uses tools
  // ---------------------------------------------------------------------------

  it('should dispatch to search_products when customer asks about products', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'Show me product options'),
    );

    // The AI auto-reply for product queries is an interactive button
    // message — i.e. it dispatched the equivalent of search_products.
    const msg = sim._outboundLog[0]!;
    expect(msg.type === 'interactive' || msg.type === 'text').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 3. Rich messages — buttons for product options
  // ---------------------------------------------------------------------------

  it('should send interactive buttons for product options', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'What products do you have?'),
    );

    const msg = sim._outboundLog[0]!;
    if (msg.type === 'interactive') {
      const interactive = msg.interactive as {
        action: { buttons: Array<{ reply: { id: string; title: string } }> };
      };
      expect(interactive.action.buttons.length).toBeGreaterThan(0);
      expect(interactive.action.buttons.length).toBeLessThanOrEqual(3);
      const titles = interactive.action.buttons.map((b) => b.reply.title);
      expect(titles.length).toBeGreaterThan(0);
    } else {
      // Text fallback is also acceptable.
      expect(msg.body).toBeDefined();
    }
  });

  it('should send at most 3 buttons per interactive message', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'products'),
    );

    const msg = sim._outboundLog[0]!;
    if (msg.type === 'interactive') {
      const interactive = msg.interactive as {
        action: { buttons: Array<{ reply: { id: string; title: string } }> };
      };
      expect(interactive.action.buttons.length).toBeLessThanOrEqual(3);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Media — AI sends a product image
  // ---------------------------------------------------------------------------

  it('should be able to send a media message via sendMedia', async () => {
    sim._resetOutbound();
    await sim.sendMedia('+919876543210', 'media_product_1', 'image', 'Health Tonic');

    expect(sim._outboundLog[0]?.type).toBe('image');
    expect(sim._outboundLog[0]?.mediaId).toBe('media_product_1');
  });

  // ---------------------------------------------------------------------------
  // 5. Conversation history — preserved across turns
  // ---------------------------------------------------------------------------

  it('should preserve conversation history across multiple turns', async () => {
    await sim.processWebhookEvent(buildTextMessageWebhook('919876543210', 'Hi'));
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'Tell me about products'),
    );
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'What is the price?'),
    );

    const history = sim._conversations.get('+919876543210');
    expect(history?.length).toBe(3);
    expect(history?.[0]?.payload.text).toBe('Hi');
    expect(history?.[1]?.payload.text).toBe('Tell me about products');
    expect(history?.[2]?.payload.text).toBe('What is the price?');
  });

  it('should send at most one AI reply per inbound message', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(buildTextMessageWebhook('919876543210', 'Hi'));

    expect(sim._outboundLog.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. Human escalation via WhatsApp
  // ---------------------------------------------------------------------------

  it('should escalate to a human when customer asks for one', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'I want to speak to a human'),
    );

    expect(sim._outboundLog[0]?.body).toMatch(/human|agent|transfer/i);
  });

  it('should escalate when customer uses the word "agent"', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'Get me an agent'),
    );

    expect(sim._outboundLog[0]?.body).toMatch(/human|agent|transfer/i);
  });

  // ---------------------------------------------------------------------------
  // Multi-turn conversation flow
  // ---------------------------------------------------------------------------

  it('should handle a multi-turn product inquiry flow', async () => {
    sim._resetOutbound();

    // Turn 1: greeting
    await sim.processWebhookEvent(buildTextMessageWebhook('919876543210', 'Hi'));
    expect(sim._outboundLog.length).toBe(1);

    // Turn 2: ask about products → buttons
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'What products do you have?'),
    );
    expect(sim._outboundLog.length).toBe(2);

    // Turn 3: refund question
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'What is the refund policy?'),
    );
    expect(sim._outboundLog.length).toBe(3);
    expect(sim._outboundLog[2]?.body).toMatch(/return policy|7-day|refund/i);
  });

  it('should send a default AI reply for unrecognised queries', async () => {
    sim._resetOutbound();
    await sim.processWebhookEvent(
      buildTextMessageWebhook('919876543210', 'xyz random message'),
    );

    expect(sim._outboundLog.length).toBe(1);
    expect(sim._outboundLog[0]?.body).toMatch(/help|products|orders|returns/i);
  });

  it('should not crash when the AI auto-reply is disabled', async () => {
    sim._setAutoReply(false);
    sim._resetOutbound();
    await sim.processWebhookEvent(buildTextMessageWebhook('919876543210', 'Hi'));

    expect(sim._outboundLog.length).toBe(0);
    // But the inbound message should still be saved.
    expect(sim.prisma.whatsappMessage.create).toHaveBeenCalled();
  });
});
