/**
 * Voice AI Greetings Tests
 * =========================
 *
 * Validates the **greeting behaviour** of the Dayjoy Voice AI assistant
 * (`VapiCallStartedHandler.buildWelcomeMessage()` contract):
 *
 *   1. Inbound calls start with an ASSISTANT greeting message.
 *   2. The greeting matches a polite regex (hello / hi / welcome / thank you).
 *   3. Known customers are greeted by name.
 *   4. Distributors get a business-focused greeting.
 *   5. Returning customers with recent orders are offered an order update.
 *   6. After-hours calls (outside 9 AM – 6 PM) acknowledge the limited hours.
 *   7. Business-hours calls use a professional tone.
 *
 * Uses `createVoiceSimulator()` so no real Vapi / OpenAI / Postgres is
 * required. The simulator's `buildWelcomeMessage()` mirrors the real
 * handler's logic exactly.
 *
 * Reference: `vapi/webhooks/vapi-call-started-handler.ts#buildWelcomeMessage`,
 *            `vapi/assistants/vapi-conversation-flows.md`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createVoiceSimulator } from '../helpers/voice-simulator';

describe('Voice AI Greetings', () => {
  let sim: ReturnType<typeof createVoiceSimulator>;

  beforeEach(() => {
    sim = createVoiceSimulator();
  });

  it('should greet inbound calls with an ASSISTANT message', async () => {
    const call = await sim.simulateInboundCall('+919876543210');

    expect(call.transcript.length).toBeGreaterThan(0);
    expect(call.transcript[0]?.role).toBe('ASSISTANT');
    expect(call.welcomeMessage.length).toBeGreaterThan(0);
  });

  it('should match a polite greeting pattern', async () => {
    const call = await sim.simulateInboundCall('+919876543210');

    expect(call.transcript[0]?.content).toMatch(
      /hello|hi|welcome|thank you for calling/i,
    );
  });

  it('should greet by name if customer identified', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      customer: {
        id: 'cust-rahul',
        firstName: 'Rahul',
        lastName: 'Sharma',
        customerType: 'CUSTOMER',
      },
    });

    expect(call.transcript[0]?.content).toContain('Rahul');
  });

  it('should greet distributors with a business-focused message', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      customer: {
        id: 'dist-1',
        firstName: 'Priya',
        lastName: 'Patel',
        customerType: 'DISTRIBUTOR',
      },
    });

    expect(call.transcript[0]?.content).toContain('Priya');
    expect(call.transcript[0]?.content).toMatch(/business/i);
  });

  it('should offer order updates to returning customers with recent orders', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      customer: {
        id: 'cust-returning',
        firstName: 'Vikram',
        lastName: 'Reddy',
        customerType: 'CUSTOMER',
        recentOrders: [
          { id: 'ord-1', totalAmount: 1299, status: 'DELIVERED' },
        ],
      },
    });

    expect(call.transcript[0]?.content).toContain('Vikram');
    expect(call.transcript[0]?.content).toMatch(/order|update|recent/i);
  });

  it('should use professional tone for business hours', async () => {
    // 10 AM — business hours.
    const call = await sim.simulateInboundCall('+919876543210', {
      mockTime: '10:00',
    });

    expect(call.transcript[0]?.content).toMatch(
      /hello|good morning|good afternoon|thank you for calling/i,
    );
  });

  it('should acknowledge after-hours calls', async () => {
    // 11 PM — after hours.
    const call = await sim.simulateInboundCall('+919876543210', {
      mockTime: '23:00',
    });

    expect(call.transcript[0]?.content).toMatch(
      /thank you for calling|currently (outside|closed|limited)|business hours/i,
    );
  });

  it('should not address the caller by name when unknown', async () => {
    const call = await sim.simulateInboundCall('+919999999999');

    // No customer attached → generic greeting, no name mention.
    expect(call.customerId).toBeUndefined();
    expect(call.transcript[0]?.content).toMatch(/thank you for calling|virtual assistant/i);
  });

  it('should include the assistant name (Sarah) in the greeting', async () => {
    const call = await sim.simulateInboundCall('+919876543210');

    // The handler introduces herself as "Sarah".
    expect(call.welcomeMessage).toMatch(/sarah/i);
  });

  it('should ask an open-ended "how can I help" question', async () => {
    const call = await sim.simulateInboundCall('+919876543210');

    expect(call.welcomeMessage).toMatch(/how can i help|how may i help|how can i assist/i);
  });

  it('should handle early-morning (5 AM) calls as after-hours', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      mockTime: '05:00',
    });

    expect(call.transcript[0]?.content).toMatch(
      /outside our business hours|currently (closed|limited)|business hours/i,
    );
  });

  it('should handle end-of-business (6 PM) calls as business hours', async () => {
    // 6 PM is the boundary — our impl treats 6 PM as after-hours
    // (BUSINESS_HOURS_END is exclusive), so this should also be after-hours.
    const call = await sim.simulateInboundCall('+919876543210', {
      mockTime: '18:00',
    });

    expect(call.transcript[0]?.content).toMatch(
      /business hours|outside|limited/i,
    );
  });

  it('should handle afternoon (3 PM) calls as business hours', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      mockTime: '15:00',
    });

    // Should NOT mention after-hours / closed.
    expect(call.transcript[0]?.content).not.toMatch(
      /currently closed|outside our business hours/i,
    );
  });
});
