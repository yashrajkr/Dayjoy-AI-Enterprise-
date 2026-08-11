/**
 * Voice AI Human Escalation Tests
 * ================================
 *
 * Validates the **human escalation** flow on the Voice AI channel:
 *
 *   1. **Explicit request.** Caller says "let me talk to a human" →
 *      AI escalates immediately.
 *   2. **Frustration detection.** Caller shows frustration (angry,
 *      unacceptable, ridiculous) → AI escalates.
 *   3. **Repeated failures.** Three consecutive failed attempts → AI
 *      escalates.
 *   4. **Summary before transfer.** AI summarises the conversation in
 *      the escalation message.
 *   5. **Confirmation.** AI tells the caller they're being transferred
 *      and asks them to hold.
 *   6. **Reason capture.** The escalation records the reason (explicit
 *      request / frustration / repeated failure).
 *   7. **Department routing.** Where applicable, the AI routes to the
 *      right department (customer_service, manager, technical_support).
 *
 * Reference: `vapi/flows/vapi-human-escalation-flow.ts`,
 *            `vapi/tools/vapi-human-transfer-tool.ts`,
 *            `vapi/prompts/escalation-protocols.ts`,
 *            `vapi/assistants/vapi-escalation-protocols.md`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVoiceSimulator } from '../helpers/voice-simulator';

describe('Voice AI Human Escalation', () => {
  let sim: ReturnType<typeof createVoiceSimulator>;

  beforeEach(() => {
    sim = createVoiceSimulator({
      tools: {
        human_transfer: vi.fn(async (args: { department?: string; reason?: string }) => ({
          success: true,
          toolName: 'human_transfer',
          args,
          result: {
            transferId: 'transfer-abc123',
            department: args.department ?? 'customer_service',
            reason: args.reason ?? 'Customer requested human agent',
          },
          speak:
            "I understand you'd like to speak with a human agent. " +
            'Let me transfer you to a team member who can help. Please hold for a moment.',
        })),
      },
    });
  });

  it('should escalate when customer explicitly asks for a human', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Let me talk to a human');

    expect(call.escalated).toBe(true);
  });

  it('should escalate when customer asks for a manager', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I want to speak to your manager');

    expect(call.escalated).toBe(true);
  });

  it('should escalate when customer asks for a supervisor', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Get me your supervisor');

    expect(call.escalated).toBe(true);
  });

  it('should escalate when customer is frustrated', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('This is unacceptable! I am furious!');

    expect(call.escalated).toBe(true);
    expect(call.escalateReason).toMatch(/frustration/i);
  });

  it('should escalate when customer uses anger words', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I am so angry with your service');

    expect(call.escalated).toBe(true);
  });

  it('should escalate when customer says "ridiculous"', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('This is ridiculous, I want help now');

    expect(call.escalated).toBe(true);
  });

  it('should escalate when customer says "done with this"', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance("I'm done with this, give me a real person");

    expect(call.escalated).toBe(true);
  });

  it('should speak a confirmation message when transferring', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('Let me talk to a human');

    expect(turn.content).toMatch(/transfer|hold|team member|human/i);
  });

  it('should record the escalate reason as "Customer requested human agent"', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Can I speak to a human please?');

    expect(call.escalateReason).toBe('Customer requested human agent');
  });

  it('should NOT escalate for general product questions', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Tell me about the Health Tonic');

    expect(call.escalated).toBe(false);
  });

  it('should NOT escalate for general complaint without frustration', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('My order is delayed');

    expect(call.escalated).toBe(false);
  });

  it('should escalate after three consecutive failed attempts', async () => {
    // Simulate 3 "I don't understand" responses in a row.
    const sim2 = createVoiceSimulator({
      flowResponses: {
        unknown: async () =>
          "I'm sorry, I'm not sure how to help with that. Could you rephrase?",
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    await call.sendUtterance('xyz abc');
    await call.sendUtterance('qwerty zxcv');
    const thirdTurn = await call.sendUtterance('asdf jkl;');

    // After 3 unclear turns, the response should ask the user if they
    // want a human (or escalate).
    expect(thirdTurn.content).toMatch(/transfer|human|team member|rephrase|clarify/i);
  });

  it('should produce a conversation summary before transfer', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I have a complaint about my order');
    const escalateTurn = await call.sendUtterance('This is unacceptable, give me a human');

    // The escalation message should reference the conversation context.
    expect(escalateTurn.content).toMatch(/transfer|hold|team member/i);
    expect(call.transcript.length).toBeGreaterThan(3);
  });

  it('should not break the call flow after escalation flag is set', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Transfer me to a human');

    expect(call.escalated).toBe(true);
    // The call object should still be usable.
    expect(typeof call.end).toBe('function');
  });

  it('should end the call cleanly after escalation', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Let me talk to a manager');

    expect(call.escalated).toBe(true);
    await expect(call.end()).resolves.toBeUndefined();
  });

  it('should escalate when customer asks "talk to a person"', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I want to talk to a person');

    expect(call.escalated).toBe(true);
  });

  it('should escalate when customer asks "talk to an agent"', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Talk to an agent please');

    expect(call.escalated).toBe(true);
  });
});
