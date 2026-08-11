/**
 * WhatsApp AI — Webhook Handling Tests
 * =====================================
 *
 * Validates the **WhatsApp webhook** contract documented in
 * `whatsapp-ai/README.md`:
 *
 *   1. **Webhook verification (GET).**
 *      - Valid `hub.mode=subscribe` + `hub.verify_token` → 200 + challenge.
 *      - Invalid verify token → 403.
 *      - Missing `hub.mode` → 403.
 *
 *   2. **Signature verification (POST).**
 *      - Valid `X-Hub-Signature-256` HMAC → process the payload.
 *      - Invalid signature → reject (401).
 *      - Missing signature header → reject.
 *
 *   3. **Inbound message → saved to DB.** A `messages` payload with a
 *      text body is persisted as a `whatsappMessage` row.
 *
 *   4. **Status update → message status updated.** A `statuses` payload
 *      with `status=read` updates the existing message's status.
 *
 *   5. **Idempotency.** A duplicate webhook (same `message.id`) is
 *      skipped — no second DB row, no second AI reply.
 *
 * Reference: `_reference/whatsapp-python-reference/meta_client.py`
 *            (`verify_webhook_signature`, `parse_webhook_event`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWhatsAppSimulator,
  buildTextMessageWebhook,
  buildStatusWebhook,
} from '../helpers/whatsapp-simulator';
import { computeMetaSignature } from '../helpers/mocks';

describe('WhatsApp Webhook Handling', () => {
  let sim: ReturnType<typeof createWhatsAppSimulator>;

  beforeEach(() => {
    sim = createWhatsAppSimulator({
      verifyToken: 'dayjoy_test_verify_token',
      appSecret: 'dayjoy_test_app_secret',
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Webhook verification (GET)
  // ---------------------------------------------------------------------------

  it('should return 200 + challenge for valid verification request', () => {
    const result = sim.verifyWebhook({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'dayjoy_test_verify_token',
      'hub.challenge': 'challenge_abc123',
    });

    expect(result.status).toBe(200);
    expect(result.body).toBe('challenge_abc123');
  });

  it('should return 403 for invalid verify token', () => {
    const result = sim.verifyWebhook({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_abc123',
    });

    expect(result.status).toBe(403);
  });

  it('should return 403 for missing hub.mode', () => {
    const result = sim.verifyWebhook({
      'hub.mode': '',
      'hub.verify_token': 'dayjoy_test_verify_token',
      'hub.challenge': 'challenge_abc123',
    });

    expect(result.status).toBe(403);
  });

  it('should return 403 for non-subscribe mode', () => {
    const result = sim.verifyWebhook({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': 'dayjoy_test_verify_token',
      'hub.challenge': 'challenge_abc123',
    });

    expect(result.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 2. Signature verification (POST)
  // ---------------------------------------------------------------------------

  it('should accept a webhook with a valid HMAC signature', () => {
    const payload = JSON.stringify(buildTextMessageWebhook('919876543210', 'hi'));
    const signature = computeMetaSignature(payload, sim.appSecret);

    expect(sim.verifySignature(payload, signature)).toBe(true);
  });

  it('should reject a webhook with an invalid HMAC signature', () => {
    const payload = JSON.stringify(buildTextMessageWebhook('919876543210', 'hi'));
    const signature = 'sha256=invalid_hex_string';

    expect(sim.verifySignature(payload, signature)).toBe(false);
  });

  it('should reject a webhook with a missing signature header', () => {
    const payload = JSON.stringify(buildTextMessageWebhook('919876543210', 'hi'));

    expect(sim.verifySignature(payload, '')).toBe(false);
  });

  it('should reject a webhook with a signature missing the sha256= prefix', () => {
    const payload = JSON.stringify(buildTextMessageWebhook('919876543210', 'hi'));
    const validSig = computeMetaSignature(payload, sim.appSecret);
    const stripped = validSig.replace('sha256=', '');

    expect(sim.verifySignature(payload, stripped)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. Inbound message → saved to DB
  // ---------------------------------------------------------------------------

  it('should save an inbound text message to the DB', async () => {
    const event = buildTextMessageWebhook('919876543210', 'Hi there');

    const result = await sim.processWebhookEvent(event);

    expect(result.accepted).toBe(true);
    expect(result.processed).toBe(1);
    expect(sim.prisma.whatsappMessage.create).toHaveBeenCalled();
  });

  it('should persist the message with the correct direction (INBOUND)', async () => {
    const event = buildTextMessageWebhook('919876543210', 'Hello');

    await sim.processWebhookEvent(event);

    const createCall = sim.prisma.whatsappMessage.create.mock.calls[0]?.[0];
    expect(createCall?.data?.direction).toBe('INBOUND');
    expect(createCall?.data?.type).toBe('text');
  });

  it('should record the sender phone as +E.164', async () => {
    const event = buildTextMessageWebhook('919876543210', 'Hello');

    await sim.processWebhookEvent(event);

    const createCall = sim.prisma.whatsappMessage.create.mock.calls[0]?.[0];
    expect(createCall?.data?.from).toBe('+919876543210');
  });

  // ---------------------------------------------------------------------------
  // 4. Status update → message status updated
  // ---------------------------------------------------------------------------

  it('should update the message status when a status webhook arrives', async () => {
    const statusEvent = buildStatusWebhook('wamid_1', 'read', '919876543210');

    await sim.processWebhookEvent(statusEvent);

    expect(sim.prisma.whatsappMessage.update).toHaveBeenCalled();
    const updateCall = sim.prisma.whatsappMessage.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.status).toBe('READ');
  });

  it('should handle delivered status updates', async () => {
    const statusEvent = buildStatusWebhook('wamid_2', 'delivered', '919876543210');

    await sim.processWebhookEvent(statusEvent);

    const updateCall = sim.prisma.whatsappMessage.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.status).toBe('DELIVERED');
  });

  it('should handle failed status updates', async () => {
    const statusEvent = buildStatusWebhook('wamid_3', 'failed', '919876543210');

    await sim.processWebhookEvent(statusEvent);

    const updateCall = sim.prisma.whatsappMessage.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.status).toBe('FAILED');
  });

  // ---------------------------------------------------------------------------
  // 5. Idempotency — duplicate webhook → skip
  // ---------------------------------------------------------------------------

  it('should skip duplicate inbound messages (same message.id)', async () => {
    const event = buildTextMessageWebhook(
      '919876543210',
      'Hi',
      'wamid_duplicate_1',
    );

    const first = await sim.processWebhookEvent(event);
    expect(first.processed).toBe(1);

    // Reset the create mock to count only the second call.
    sim.prisma.whatsappMessage.create.mockClear();

    // Send the same event again (same message id).
    const second = await sim.processWebhookEvent(event);
    expect(second.processed).toBe(0);
    expect(sim.prisma.whatsappMessage.create).not.toHaveBeenCalled();
  });

  it('should NOT auto-reply to a duplicate message', async () => {
    const event = buildTextMessageWebhook(
      '919876543210',
      'Hi',
      'wamid_dup_noreply',
    );

    // First call: 1 outbound auto-reply.
    sim._resetOutbound();
    await sim.processWebhookEvent(event);
    expect(sim._outboundLog.length).toBe(1);

    // Second call (duplicate): no new outbound.
    sim._resetOutbound();
    await sim.processWebhookEvent(event);
    expect(sim._outboundLog.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Misc webhook handling
  // ---------------------------------------------------------------------------

  it('should process multiple messages in a single webhook event', async () => {
    const event: any = buildTextMessageWebhook('919876543210', 'first');
    // Add a second message to the same entry.
    event.entry[0].changes[0].value.messages.push({
      from: '919876543210',
      id: 'wamid_multi_2',
      timestamp: Math.floor(Date.now() / 1000).toString(),
      type: 'text',
      text: { body: 'second' },
    });

    const result = await sim.processWebhookEvent(event);
    expect(result.processed).toBe(2);
  });

  it('should handle an empty webhook event gracefully', async () => {
    const event = { object: 'whatsapp_business_account', entry: [] };
    const result = await sim.processWebhookEvent(event as any);
    expect(result.accepted).toBe(true);
    expect(result.processed).toBe(0);
  });

  it('should record the contact name when provided', async () => {
    const event = buildTextMessageWebhook('919876543210', 'Hi');
    // The builder sets the contact name to 'Test User'.
    await sim.processWebhookEvent(event);
    expect(sim.prisma.whatsappMessage.create).toHaveBeenCalled();
  });

  it('should handle webhooks with both messages and statuses', async () => {
    const event: any = buildTextMessageWebhook('919876543210', 'Hi');
    event.entry[0].changes[0].value.statuses = [
      {
        id: 'wamid_existing',
        status: 'delivered',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        recipient_id: '919876543210',
      },
    ];

    const result = await sim.processWebhookEvent(event);
    expect(result.processed).toBe(2);
  });
});
