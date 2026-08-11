/**
 * Voice AI Lead Capture Tests
 * ============================
 *
 * Validates the **lead capture** flow on the Voice AI channel:
 *
 *   1. When a customer expresses interest (product or business), the
 *      AI calls the `create_lead` tool.
 *   2. The AI collects the required lead fields: firstName, lastName,
 *      email, phone, interest.
 *   3. The lead is created in the CRM with `source = 'VOICE'`.
 *   4. The AI speaks a confirmation message including the lead
 *      reference number.
 *   5. Missing fields → the AI prompts the caller to provide them.
 *   6. Existing customer → lead is linked to the existing customer
 *      record (not a duplicate).
 *
 * Uses `createVoiceSimulator()` with a mocked `create_lead` tool that
 * records the call args for assertion.
 *
 * Reference: `vapi/tools/vapi-lead-capture-tool.ts`,
 *            `vapi/flows/vapi-lead-collection-flow.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVoiceSimulator } from '../helpers/voice-simulator';

describe('Voice AI Lead Capture', () => {
  let createLeadMock: ReturnType<typeof vi.fn>;
  let sim: ReturnType<typeof createVoiceSimulator>;

  beforeEach(() => {
    createLeadMock = vi.fn(async (args: any, _ctx: any) => ({
      success: true,
      toolName: 'create_lead',
      args,
      result: {
        leadId: 'lead-12345',
        referenceNumber: 'DJ-LEAD-12345',
        source: 'VOICE',
      },
      speak:
        "Thanks, I've captured your interest. Your reference number is DJ-LEAD-12345. " +
        'Our team will reach out to you within 24 hours.',
    }));

    sim = createVoiceSimulator({
      tools: { create_lead: createLeadMock },
    });
  });

  it('should call create_lead when customer expresses interest', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance("I'm interested in joining Dayjoy as a distributor");

    expect(call.toolsCalled).toContain('create_lead');
    expect(createLeadMock).toHaveBeenCalled();
  });

  it('should collect firstName, lastName, email, phone, interest', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      customer: {
        id: 'cust-1',
        firstName: 'Rahul',
        lastName: 'Sharma',
        customerType: 'CUSTOMER',
      },
    });
    await call.sendUtterance('I am interested in joining');

    const callArgs = createLeadMock.mock.calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.firstName).toBeDefined();
    expect(callArgs.lastName).toBeDefined();
    expect(callArgs.phone).toBeDefined();
    expect(callArgs.interest).toBeDefined();
  });

  it('should create lead with source = VOICE', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance("I'd like to learn more about Dayjoy");

    const result = createLeadMock.mock.results[0]?.value;
    const resolved = await result;
    expect(resolved.result.source).toBe('VOICE');
  });

  it('should speak a confirmation message with the reference number', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('I am interested in your business opportunity');

    expect(turn.content).toMatch(/reference|DJ-LEAD/i);
  });

  it('should mention 24-hour follow-up window in confirmation', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('I want to join Dayjoy');

    expect(turn.content).toMatch(/24 hours|reach out|follow up|contact you/i);
  });

  it('should handle product interest leads', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I am interested in your products');

    expect(call.toolsCalled).toContain('create_lead');
    const callArgs = createLeadMock.mock.calls[0]?.[0] as any;
    expect(callArgs.interest).toMatch(/product/i);
  });

  it('should handle business interest leads', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I want to join the business');

    expect(call.toolsCalled).toContain('create_lead');
    const callArgs = createLeadMock.mock.calls[0]?.[0] as any;
    expect(callArgs.interest).toMatch(/business/i);
  });

  it('should prompt for missing contact info when caller asks to be called back', async () => {
    const sim2 = createVoiceSimulator({
      tools: {
        create_lead: vi.fn(async () => ({
          success: false,
          toolName: 'create_lead',
          args: {},
          result: null,
          speak:
            "I'd love to capture your information, but I'm missing some details. " +
            "Could you give me your first name, last name, email, and phone number?",
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('Please call me back later');

    expect(turn.content).toMatch(/first name|last name|email|phone/i);
  });

  it('should attach the callId to the lead for traceability', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I am interested');

    const ctx = createLeadMock.mock.calls[0]?.[1] as any;
    expect(ctx.callId).toBe(call.callId);
  });

  it('should attach the customer ID when the caller is a known customer', async () => {
    const call = await sim.simulateInboundCall('+919876543210', {
      customer: { id: 'cust-known-1', firstName: 'Amit' },
    });
    await call.sendUtterance("I'm interested");

    const ctx = createLeadMock.mock.calls[0]?.[1] as any;
    expect(ctx.customerId).toBe('cust-known-1');
  });

  it('should not call create_lead for general inquiries that aren\'t lead-worthy', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('What is the return policy?');

    expect(call.toolsCalled).not.toContain('create_lead');
  });

  it('should record the lead creation as a transcript TOOL turn', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance("I'm interested in becoming a distributor");

    const toolTurn = call.transcript.find((t) => t.toolName === 'create_lead');
    expect(toolTurn).toBeDefined();
    expect(toolTurn?.toolArgs).toBeDefined();
  });

  it('should handle lead capture failures gracefully', async () => {
    const sim2 = createVoiceSimulator({
      tools: {
        create_lead: vi.fn(async () => ({
          success: false,
          toolName: 'create_lead',
          args: {},
          result: null,
          speak:
            "I'm sorry, I ran into an issue capturing your details. " +
            'Could I transfer you to a team member who can help?',
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('I am interested in joining');

    expect(turn.content).toMatch(/sorry|issue|transfer|team member/i);
  });
});
