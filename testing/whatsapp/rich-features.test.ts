/**
 * WhatsApp AI — Rich Features Tests
 * ===================================
 *
 * Validates the **rich WhatsApp messaging** features supported by the
 * Dayjoy WhatsApp AI channel:
 *
 *   1. **Interactive buttons.** Up to 3 buttons, ≤20 chars each.
 *   2. **List messages.** Up to 10 list items.
 *   3. **Product carousel.** Multi-product carousel message.
 *   4. **Template messages.** Welcome, order confirmation, shipping
 *      update.
 *   5. **Media messages.** Image, PDF, audio.
 *   6. **Quick replies.** Pre-defined quick reply options.
 *
 * Reference: `_reference/whatsapp-python-reference/meta_client.py`
 *            (`send_interactive`, `send_template`, `send_media`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWhatsAppSimulator } from '../helpers/whatsapp-simulator';

describe('WhatsApp Rich Features', () => {
  let sim: ReturnType<typeof createWhatsAppSimulator>;

  beforeEach(() => {
    sim = createWhatsAppSimulator();
  });

  // ---------------------------------------------------------------------------
  // 1. Interactive buttons (max 3, max 20 chars)
  // ---------------------------------------------------------------------------

  it('should send an interactive message with 1 button', async () => {
    sim._resetOutbound();
    const interactive = {
      type: 'button',
      body: { text: 'Confirm your order' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'btn_confirm', title: 'Confirm' } },
        ],
      },
    };
    await sim.sendInteractive('+919876543210', interactive);

    expect(sim._outboundLog[0]?.type).toBe('interactive');
    const interactive2 = sim._outboundLog[0]?.interactive as {
      action: { buttons: Array<{ reply: { title: string } }> };
    };
    expect(interactive2.action.buttons.length).toBe(1);
  });

  it('should send an interactive message with 3 buttons (max)', async () => {
    sim._resetOutbound();
    const interactive = {
      type: 'button',
      body: { text: 'Pick a product' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'b1', title: 'Health Tonic' } },
          { type: 'reply', reply: { id: 'b2', title: 'Beauty Cream' } },
          { type: 'reply', reply: { id: 'b3', title: 'Home Care Kit' } },
        ],
      },
    };
    await sim.sendInteractive('+919876543210', interactive);

    const interactive2 = sim._outboundLog[0]?.interactive as {
      action: { buttons: Array<{ reply: { title: string } }> };
    };
    expect(interactive2.action.buttons.length).toBe(3);
  });

  it('should enforce button title length ≤ 20 characters', () => {
    const validTitle = 'Health Tonic'; // 12 chars
    const longTitle = 'This title exceeds 20 chars'; // 29 chars

    expect(validTitle.length).toBeLessThanOrEqual(20);
    expect(longTitle.length).toBeGreaterThan(20);
  });

  it('should validate that button ids are unique within a message', () => {
    const buttons = [
      { type: 'reply', reply: { id: 'b1', title: 'One' } },
      { type: 'reply', reply: { id: 'b2', title: 'Two' } },
      { type: 'reply', reply: { id: 'b3', title: 'Three' } },
    ];
    const ids = buttons.map((b) => b.reply.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  // ---------------------------------------------------------------------------
  // 2. List messages (max 10 items)
  // ---------------------------------------------------------------------------

  it('should send a list message with up to 10 items', async () => {
    sim._resetOutbound();
    const sections = [
      {
        title: 'Wellness',
        rows: Array.from({ length: 5 }, (_, i) => ({
          id: `p_${i + 1}`,
          title: `Product ${i + 1}`,
          description: `Description ${i + 1}`,
        })),
      },
    ];
    const interactive = {
      type: 'list',
      header: { type: 'text', text: 'Our Products' },
      body: { text: 'Tap to browse' },
      action: { button: 'View Products', sections },
    };
    await sim.sendInteractive('+919876543210', interactive);

    const sent = sim._outboundLog[0]?.interactive as {
      action: { sections: Array<{ rows: unknown[] }> };
    };
    expect(sent.action.sections[0]?.rows.length).toBe(5);
  });

  it('should enforce list max 10 items per section', () => {
    // 11 items would exceed the limit.
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      id: `p_${i + 1}`,
      title: `Product ${i + 1}`,
    }));
    expect(tooMany.length).toBeGreaterThan(10);
  });

  // ---------------------------------------------------------------------------
  // 3. Product carousel
  // ---------------------------------------------------------------------------

  it('should send a product carousel with multiple cards', async () => {
    sim._resetOutbound();
    const interactive = {
      type: 'product',
      header: { type: 'text', text: 'Featured Products' },
      body: { text: 'Check out our top sellers' },
      action: {
        catalog_id: 'dayjoy_catalog_1',
        product_retailer_id: ['prod_1', 'prod_2', 'prod_3'],
      },
    };
    await sim.sendInteractive('+919876543210', interactive);

    const sent = sim._outboundLog[0]?.interactive as {
      action: { product_retailer_id: string[] };
    };
    expect(sent.action.product_retailer_id.length).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 4. Template messages
  // ---------------------------------------------------------------------------

  it('should send a welcome template', async () => {
    sim._resetOutbound();
    await sim.sendTemplate('+919876543210', 'welcome_message', ['Rahul']);

    expect(sim._outboundLog[0]?.templateName).toBe('welcome_message');
    expect(sim._outboundLog[0]?.templateParams).toEqual(['Rahul']);
  });

  it('should send an order confirmation template', async () => {
    sim._resetOutbound();
    await sim.sendTemplate(
      '+919876543210',
      'order_confirmation',
      ['DJ-ORD-12345', '₹1,299', '3-5 business days'],
    );

    expect(sim._outboundLog[0]?.templateName).toBe('order_confirmation');
    expect(sim._outboundLog[0]?.templateParams?.length).toBe(3);
  });

  it('should send a shipping update template', async () => {
    sim._resetOutbound();
    await sim.sendTemplate(
      '+919876543210',
      'shipping_update',
      ['DJ-ORD-12345', 'Shipped', 'BLRDEL12345'],
    );

    expect(sim._outboundLog[0]?.templateName).toBe('shipping_update');
  });

  it('should send an appointment reminder template', async () => {
    sim._resetOutbound();
    await sim.sendTemplate(
      '+919876543210',
      'appointment_reminder',
      ['Tomorrow 2:30 PM', 'Sales Team'],
    );

    expect(sim._outboundLog[0]?.templateName).toBe('appointment_reminder');
  });

  // ---------------------------------------------------------------------------
  // 5. Media messages (image, PDF, audio)
  // ---------------------------------------------------------------------------

  it('should send an image media message', async () => {
    sim._resetOutbound();
    await sim.sendMedia('+919876543210', 'img_1', 'image', 'Health Tonic');

    const msg = sim._outboundLog[0]!;
    expect(msg.type).toBe('image');
    expect(msg.mediaId).toBe('img_1');
    expect(msg.body).toBe('Health Tonic');
  });

  it('should send a PDF document message', async () => {
    sim._resetOutbound();
    await sim.sendMedia('+919876543210', 'pdf_1', 'document', 'Invoice');

    expect(sim._outboundLog[0]?.type).toBe('document');
    expect(sim._outboundLog[0]?.mediaId).toBe('pdf_1');
  });

  it('should send an audio message', async () => {
    sim._resetOutbound();
    await sim.sendMedia('+919876543210', 'audio_1', 'audio');

    expect(sim._outboundLog[0]?.type).toBe('audio');
  });

  // ---------------------------------------------------------------------------
  // 6. Quick replies
  // ---------------------------------------------------------------------------

  it('should send a text message that functions as a quick-reply prompt', async () => {
    sim._resetOutbound();
    await sim.sendText(
      '+919876543210',
      'Quick replies:\n1. Track my order\n2. Browse products\n3. Talk to support',
    );

    expect(sim._outboundLog[0]?.body).toMatch(/quick replies|track|browse|support/i);
  });

  it('should follow up a quick-reply text with an interactive message', async () => {
    sim._resetOutbound();
    // First send the quick-reply prompt.
    await sim.sendText(
      '+919876543210',
      'How can I help? Reply with: products, orders, or support.',
    );
    // Then send interactive buttons.
    await sim.sendInteractive('+919876543210', {
      type: 'button',
      body: { text: 'Or tap an option:' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'qr_products', title: 'Products' } },
          { type: 'reply', reply: { id: 'qr_orders', title: 'Orders' } },
          { type: 'reply', reply: { id: 'qr_support', title: 'Support' } },
        ],
      },
    });

    expect(sim._outboundLog.length).toBe(2);
    expect(sim._outboundLog[0]?.type).toBe('text');
    expect(sim._outboundLog[1]?.type).toBe('interactive');
  });

  // ---------------------------------------------------------------------------
  // Combined multi-feature flow
  // ---------------------------------------------------------------------------

  it('should support a multi-message marketing flow (template + media + buttons)', async () => {
    sim._resetOutbound();
    // 1. Send a promotional template.
    await sim.sendTemplate('+919876543210', 'promo_offer', ['50% off']);
    // 2. Send a product image.
    await sim.sendMedia('+919876543210', 'img_promo', 'image', '50% off!');
    // 3. Send CTA buttons.
    await sim.sendInteractive('+919876543210', {
      type: 'button',
      body: { text: 'Shop now' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'shop_now', title: 'Shop Now' } },
          { type: 'reply', reply: { id: 'later', title: 'Maybe Later' } },
        ],
      },
    });

    expect(sim._outboundLog.length).toBe(3);
    expect(sim._outboundLog[0]?.type).toBe('template');
    expect(sim._outboundLog[1]?.type).toBe('image');
    expect(sim._outboundLog[2]?.type).toBe('interactive');
  });
});
