import { Injectable, Logger } from '@nestjs/common';
import {
  FlowType,
  FlowContext,
  FlowResponse,
  VapiFlow,
} from './vapi-flow-types';

/**
 * Lead Collection Flow
 *
 * Collects contact details (name, email, phone, area of interest)
 * from anonymous callers who want to be contacted. Used when the
 * caller is not yet a customer and doesn't want to commit to a
 * specific flow (product inquiry / business plan / etc).
 *
 * Steps:
 *   1. ask_name     — first + last name
 *   2. ask_email    — email
 *   3. ask_phone    — phone (often already known from caller id)
 *   4. ask_interest — product / business / general
 *   5. confirm      — read back + invoke lead_capture tool
 *   6. close
 */
@Injectable()
export class VapiLeadCollectionFlow implements VapiFlow {
  readonly type = FlowType.LEAD_COLLECTION;
  private readonly logger = new Logger(VapiLeadCollectionFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    const step = context.flowState?.step ?? 'ask_name';
    this.logger.debug(`lead_collection step=${step} session=${context.sessionId}`);

    switch (step) {
      case 'ask_name':
        return this.askName(context);
      case 'ask_email':
        return this.askEmail(context);
      case 'ask_phone':
        return this.askPhone(context);
      case 'ask_interest':
        return this.askInterest(context);
      case 'confirm':
        return this.confirm(context);
      case 'close':
        return this.close(context);
      default:
        return {
          message:
            "I'd be happy to take your details so we can follow up. Could you tell me your name?",
          nextStep: 'ask_name',
        };
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private askName(context: FlowContext): FlowResponse {
    const name = this.extractName(context.userMessage);
    if (name) {
      return {
        message: `Lovely to meet you, ${name.split(' ')[0]}! And what's the best email address to reach you?`,
        nextStep: 'ask_email',
        collectedData: { name },
      };
    }
    return {
      message:
        "I'd be happy to take your details so the right team can follow up. Could you tell me your first and last name?",
      nextStep: 'ask_name',
    };
  }

  private askEmail(context: FlowContext): FlowResponse {
    const email = this.extractEmail(context.userMessage);
    if (email) {
      return {
        message:
          "Got it. And what's the best phone number to reach you on? You can also say 'use this number' if you'd like me to use the one you're calling from.",
        nextStep: 'ask_phone',
        collectedData: { email },
      };
    }
    return {
      message: "I'm sorry, I didn't catch the email — could you repeat that?",
      nextStep: 'ask_email',
    };
  }

  private askPhone(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    const phone =
      this.extractPhone(context.userMessage) ??
      (/use this number|this number|current number/.test(t)
        ? context.customer?.id
          ? 'use_caller_id'
          : null
        : null);
    if (phone) {
      return {
        message:
          "Perfect. Finally — what are you most interested in? Our products, the business opportunity, or just general information?",
        nextStep: 'ask_interest',
        collectedData: { phone },
      };
    }
    return {
      message: "Could you share a phone number we can reach you on?",
      nextStep: 'ask_phone',
    };
  }

  private askInterest(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    let interest = 'general';
    if (/(product|buy|purchase|order)/.test(t)) interest = 'product';
    else if (/(business|opportunity|join|earn|distributor)/.test(t)) interest = 'business';
    else if (/(general|info|information|learn)/.test(t)) interest = 'general';
    return {
      message:
        "Thank you! Let me confirm your details so I can pass them to the right team. Shall I go ahead and submit this?",
      nextStep: 'confirm',
      collectedData: { interest },
    };
  }

  private confirm(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    const data = context.flowState?.data ?? {};
    if (/(yes|confirm|submit|go ahead|sure)/.test(t)) {
      const [firstName, ...rest] = (data.name ?? '').split(' ');
      return {
        message:
          "Wonderful — I've submitted your details. Our team will reach out within one business day. Is there anything else I can help you with?",
        nextStep: 'close',
        toolCalls: [
          {
            name: 'lead_capture',
            arguments: {
              firstName,
              lastName: rest.join(' '),
              email: data.email ?? '',
              phone: data.phone === 'use_caller_id' ? '' : (data.phone ?? ''),
              interest: data.interest ?? 'general',
            },
          },
        ],
        collectedData: { submitted: true },
      };
    }
    if (/(no|change|correct|wrong)/.test(t)) {
      return {
        message:
          "Of course — what would you like to change? Name, email, phone, or interest?",
        nextStep: 'ask_name',
      };
    }
    return {
      message: "Would you like me to submit these details to our team?",
      nextStep: 'confirm',
    };
  }

  private close(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(no|nothing|goodbye|bye|that'?s all)/.test(t)) {
      return {
        message:
          'Thank you for calling Dayjoy — we look forward to speaking with you soon. Have a great day!',
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

  private extractName(text: string): string | null {
    const m = text.match(
      /(?:my name is|i'm|i am|this is|it's|its)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
    );
    if (m) return m[1];
    // Bare "John Smith"
    const bare = text.match(/^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)$/);
    return bare ? bare[1] : null;
  }

  private extractEmail(text: string): string | null {
    const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0] : null;
  }

  private extractPhone(text: string): string | null {
    const m = text.match(/(\+?\d[\d\s\-().]{7,}\d)/);
    return m ? m[1].replace(/\s/g, '') : null;
  }
}
