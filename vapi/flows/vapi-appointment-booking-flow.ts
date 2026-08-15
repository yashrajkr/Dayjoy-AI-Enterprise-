import { Injectable, Logger } from '@nestjs/common';
import {
  FlowType,
  FlowContext,
  FlowResponse,
  VapiFlow,
  isEscalationRequest,
  buildMidFlowEscalationResponse,
} from './vapi-flow-types';

/**
 * Appointment Booking Flow
 *
 * Collects the details needed to book a follow-up appointment and
 * invokes the `appointment_booking` tool. Steps:
 *   1. ask_date    — what day?
 *   2. ask_time    — what time?
 *   3. ask_purpose — what's the appointment about?
 *   4. confirm     — read back the details + book
 *   5. close
 *
 * Re-uses the customer's name if already known. The booking tool
 * itself is owned by Agent 3's tools subsystem — this flow only
 * constructs the call.
 */
@Injectable()
export class VapiAppointmentBookingFlow implements VapiFlow {
  readonly type = FlowType.APPOINTMENT_BOOKING;
  private readonly logger = new Logger(VapiAppointmentBookingFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    if (isEscalationRequest(context.userMessage)) {
      return buildMidFlowEscalationResponse(context, 'customer_service');
    }

    const step = context.flowState?.step ?? 'ask_date';
    this.logger.debug(`appointment_booking step=${step} session=${context.sessionId}`);

    switch (step) {
      case 'ask_date':
        return this.askDate(context);
      case 'ask_time':
        return this.askTime(context);
      case 'ask_purpose':
        return this.askPurpose(context);
      case 'confirm':
        return this.confirm(context);
      case 'close':
        return this.close(context);
      default:
        return {
          message:
            "I can help you schedule an appointment. What day works best for you?",
          nextStep: 'ask_date',
        };
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private askDate(context: FlowContext): FlowResponse {
    const date = this.extractDate(context.userMessage);
    if (date) {
      return {
        message: `Got it — ${date}. What time of day works for you? Morning, afternoon, or a specific time?`,
        nextStep: 'ask_time',
        collectedData: { date },
      };
    }
    return {
      message:
        "Sure — I can help you schedule an appointment. What day would you like? You can say something like 'tomorrow', 'next Monday', or a specific date.",
      nextStep: 'ask_date',
    };
  }

  private askTime(context: FlowContext): FlowResponse {
    const time = this.extractTime(context.userMessage);
    if (time) {
      return {
        message: `Got it — ${time}. And what's the purpose of the appointment? For example, a product consultation, business opportunity discussion, or follow-up.`,
        nextStep: 'ask_purpose',
        collectedData: { time },
      };
    }
    return {
      message:
        "What time works for you? You can say 'morning', 'afternoon', or a specific time like '10 AM'.",
      nextStep: 'ask_time',
    };
  }

  private askPurpose(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    let purpose = 'general';
    if (/(business|opportunity|join|distributor)/.test(t)) purpose = 'business_opportunity';
    else if (/(product|consult|recommend)/.test(t)) purpose = 'product_consultation';
    else if (/(follow.?up|check|return)/.test(t)) purpose = 'follow_up';
    return {
      message: `Perfect. Let me confirm: I'll book a ${purpose.replace(/_/g, ' ')} appointment. Shall I go ahead and book it?`,
      nextStep: 'confirm',
      collectedData: { purpose },
    };
  }

  private confirm(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    const data = context.flowState?.data ?? {};
    if (/(yes|confirm|book|go ahead|sure)/.test(t)) {
      return {
        message:
          "Excellent — I've booked the appointment. You'll receive a confirmation by email shortly. Is there anything else I can help you with?",
        nextStep: 'close',
        toolCalls: [
          {
            name: 'appointment_booking',
            arguments: {
              firstName: context.customer?.name?.split(' ')[0] ?? '',
              lastName: context.customer?.name?.split(' ').slice(1).join(' ') ?? '',
              date: data.date ?? '',
              time: data.time ?? '',
              purpose: data.purpose ?? 'general',
              customerId: context.customer?.id ?? '',
            },
          },
        ],
        collectedData: { booked: true },
      };
    }
    if (/(no|change|different)/.test(t)) {
      return {
        message:
          "Of course — what would you like to change? The date, time, or purpose?",
        nextStep: 'ask_date',
      };
    }
    return {
      message: "Would you like me to go ahead and book this appointment?",
      nextStep: 'confirm',
    };
  }

  private close(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(no|nothing|goodbye|bye|that'?s all)/.test(t)) {
      return {
        message:
          'Thank you for calling Dayjoy. We look forward to seeing you at your appointment. Have a great day!',
        isComplete: true,
        endCall: true,
      };
    }
    return {
      message: "Of course — what else can I help you with today?",
      nextStep: 'close',
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private extractDate(text: string): string | null {
    const t = text.toLowerCase();
    if (/today/.test(t)) return new Date().toISOString().slice(0, 10);
    if (/tomorrow/.test(t)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    // Specific date like "2026-01-15" or "January 15"
    const iso = text.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];
    const named = text.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i,
    );
    if (named) {
      const month = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
      ].indexOf(named[1].toLowerCase()) + 1;
      const day = Number.parseInt(named[2], 10);
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  private extractTime(text: string): string | null {
    const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (m && /\b(morning|afternoon|evening)\b/i.test(text)) {
      return text.match(/\b(morning|afternoon|evening)\b/i)![0].toLowerCase();
    }
    if (m) {
      const hour = Number.parseInt(m[1], 10);
      const minute = m[2] ? Number.parseInt(m[2], 10) : 0;
      const ampm = m[3]?.toLowerCase() ?? (hour >= 12 ? 'pm' : 'am');
      return `${hour}:${String(minute).padStart(2, '0')} ${ampm}`;
    }
    if (/\b(morning|afternoon|evening)\b/i.test(text)) {
      return text.match(/\b(morning|afternoon|evening)\b/i)![0].toLowerCase();
    }
    return null;
  }
}
