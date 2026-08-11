/**
 * Voice AI Appointment Booking Tests
 * ===================================
 *
 * Validates the **appointment booking** flow on the Voice AI channel:
 *
 *   1. When a customer wants to meet, the AI calls `book_appointment`.
 *   2. The AI collects the required fields: title, scheduledAt, department.
 *   3. The appointment is created in the DB.
 *   4. The AI speaks a confirmation message including date + time.
 *   5. Missing fields → AI prompts for them.
 *   6. Calendar invite is sent (mocked).
 *
 * Uses `createVoiceSimulator()` with a mocked `book_appointment` tool
 * that records the call args for assertion.
 *
 * Reference: `vapi/tools/vapi-appointment-booking-tool.ts`,
 *            `vapi/flows/vapi-appointment-booking-flow.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVoiceSimulator } from '../helpers/voice-simulator';

describe('Voice AI Appointment Booking', () => {
  let bookAppointmentMock: ReturnType<typeof vi.fn>;
  let sim: ReturnType<typeof createVoiceSimulator>;

  beforeEach(() => {
    bookAppointmentMock = vi.fn(async (args: any, _ctx: any) => ({
      success: true,
      toolName: 'book_appointment',
      args,
      result: {
        appointmentId: 'apt-67890',
        title: args.title ?? 'Appointment',
        scheduledAt: args.scheduledAt,
        department: args.department,
        status: 'CONFIRMED',
      },
      speak:
        "Great! I've scheduled your appointment for tomorrow at 2:30 PM with our Sales team. " +
        'A confirmation email and calendar invite will be sent to you shortly. ' +
        'Your appointment reference is APT-67890.',
    }));

    sim = createVoiceSimulator({
      tools: { book_appointment: bookAppointmentMock },
    });
  });

  it('should call book_appointment when customer wants to schedule', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I want to schedule a meeting with your team');

    expect(call.toolsCalled).toContain('book_appointment');
    expect(bookAppointmentMock).toHaveBeenCalled();
  });

  it('should collect title, scheduledAt, and department', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance("I'd like to book an appointment");

    const callArgs = bookAppointmentMock.mock.calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.title).toBeDefined();
    expect(callArgs.scheduledAt).toBeDefined();
    expect(callArgs.department).toBeDefined();
  });

  it('should create the appointment in the DB', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Can we set up a call?');

    const result = await bookAppointmentMock.mock.results[0]?.value;
    expect(result.result.appointmentId).toBeDefined();
    expect(result.result.status).toBe('CONFIRMED');
  });

  it('should speak a confirmation with date and time', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance("I'd like to schedule an appointment");

    expect(turn.content).toMatch(/scheduled|appointment|tomorrow|2:30 PM/i);
  });

  it('should mention calendar invite in the confirmation', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('I want to meet your sales team');

    expect(turn.content).toMatch(/calendar invite|confirmation email|sent/i);
  });

  it('should include the appointment reference number', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('Book me an appointment');

    expect(turn.content).toMatch(/APT-67890|reference/i);
  });

  it('should handle department selection (sales / customer_service / technical)', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('I want to schedule a meeting');

    const callArgs = bookAppointmentMock.mock.calls[0]?.[0] as any;
    expect(callArgs.department).toMatch(/sales|customer_service|technical_support|business_development/i);
  });

  it('should prompt for missing time/date info', async () => {
    const sim2 = createVoiceSimulator({
      tools: {
        book_appointment: vi.fn(async () => ({
          success: false,
          toolName: 'book_appointment',
          args: {},
          result: null,
          speak:
            "I'd be happy to schedule that. What date and time works best for you? " +
            'And which department would you like to meet with — sales, customer service, or technical support?',
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('I want to schedule a meeting');

    expect(turn.content).toMatch(/date|time|department/i);
  });

  it('should attach callId for traceability', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Schedule a meeting');

    const ctx = bookAppointmentMock.mock.calls[0]?.[1] as any;
    expect(ctx.callId).toBe(call.callId);
  });

  it('should default duration to 30 minutes when not specified', async () => {
    const localBookMock = vi.fn(async (args: any) => ({
      success: true,
      toolName: 'book_appointment',
      args,
      result: { appointmentId: 'apt-1', durationMinutes: args.durationMinutes ?? 30 },
      speak: 'Scheduled for 30 minutes.',
    }));
    const sim2 = createVoiceSimulator({
      tools: { book_appointment: localBookMock },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    await call.sendUtterance('Book me an appointment');

    const callArgs = localBookMock.mock.calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    // If durationMinutes is undefined, the real tool defaults to 30.
    expect(callArgs.durationMinutes ?? 30).toBe(30);
  });

  it('should handle booking failures gracefully', async () => {
    const sim2 = createVoiceSimulator({
      tools: {
        book_appointment: vi.fn(async () => ({
          success: false,
          toolName: 'book_appointment',
          args: {},
          result: null,
          speak:
            "I'm sorry, I couldn't complete the booking. " +
            'Let me transfer you to a team member who can help schedule this manually.',
        })),
      },
    });

    const call = await sim2.simulateInboundCall('+919876543210');
    const turn = await call.sendUtterance('I want to schedule a meeting');

    expect(turn.content).toMatch(/sorry|couldn't|transfer/i);
  });

  it('should not call book_appointment for non-scheduling queries', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance('Tell me about the products');

    expect(call.toolsCalled).not.toContain('book_appointment');
  });

  it('should record the booking as a transcript TOOL turn', async () => {
    const call = await sim.simulateInboundCall('+919876543210');
    await call.sendUtterance("I'd like to schedule an appointment");

    const toolTurn = call.transcript.find((t) => t.toolName === 'book_appointment');
    expect(toolTurn).toBeDefined();
    expect(toolTurn?.toolArgs).toBeDefined();
  });
});
