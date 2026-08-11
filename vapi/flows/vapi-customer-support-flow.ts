import { Injectable, Logger } from '@nestjs/common';
import {
  FlowType,
  FlowContext,
  FlowResponse,
  VapiFlow,
} from './vapi-flow-types';

/**
 * Customer Support Flow
 *
 * Handles complaint / issue / order-problem conversations. Steps:
 *   1. greeting     — acknowledge the call
 *   2. gather_issue — collect what's wrong (extract order number)
 *   3. lookup       — call the customer_lookup tool
 *   4. propose      — offer a solution (refund / replacement / escalation)
 *   5. confirm      — verify the customer is satisfied
 *   6. close        — wrap up
 *
 * If at any point the user expresses frustration or asks for a human,
 * the flow escalates immediately.
 */
@Injectable()
export class VapiCustomerSupportFlow implements VapiFlow {
  readonly type = FlowType.CUSTOMER_SUPPORT;
  private readonly logger = new Logger(VapiCustomerSupportFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    const step = context.flowState?.step ?? 'greeting';
    this.logger.debug(`customer_support step=${step} session=${context.sessionId}`);

    // Universal escalation trigger
    if (this.wantsHuman(context.userMessage)) {
      return this.escalate('Customer requested human agent');
    }

    switch (step) {
      case 'greeting':
        return this.greeting(context);
      case 'gather_issue':
        return this.gatherIssue(context);
      case 'lookup':
        return this.lookup(context);
      case 'propose':
        return this.propose(context);
      case 'confirm':
        return this.confirm(context);
      case 'close':
        return this.close(context);
      default:
        return {
          message:
            "I'm sorry, I seem to have lost track. Could you tell me again what you need help with?",
          nextStep: 'gather_issue',
        };
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private greeting(context: FlowContext): FlowResponse {
    const name = context.customer?.name;
    const opener = name
      ? `Hi ${name}, thanks for calling Dayjoy support.`
      : 'Hi, thanks for calling Dayjoy support.';
    return {
      message: `${opener} This is Sarah. Could you tell me what's going on — for example, an issue with an order or a product?`,
      nextStep: 'gather_issue',
    };
  }

  private gatherIssue(context: FlowContext): FlowResponse {
    const orderNumber = this.extractOrderNumber(context.userMessage);
    if (orderNumber) {
      return {
        message: `Thanks — I've got order number ${orderNumber}. Let me pull that up.`,
        nextStep: 'lookup',
        collectedData: { orderNumber },
        toolCalls: [
          {
            name: 'customer_lookup',
            arguments: { orderNumber },
          },
        ],
      };
    }
    if (context.customer?.id) {
      // Already identified caller — proceed without an order number.
      return {
        message:
          "Thanks for the details. I can see your account — let me look up your recent orders so I can help.",
        nextStep: 'lookup',
        toolCalls: [
          {
            name: 'customer_lookup',
            arguments: { customerId: context.customer.id },
          },
        ],
      };
    }
    return {
      message:
        "Thanks for explaining. To look into this, I'll need either your order number or the phone number on your account — which would you like to provide?",
      nextStep: 'gather_issue',
    };
  }

  private lookup(context: FlowContext): FlowResponse {
    // Tool execution happens server-side between this turn and the
    // next (Vapi invokes the function-call webhook); we just need
    // to ask the user to confirm what they want fixed.
    return {
      message:
        "I found your account. Could you tell me a bit more about what you'd like me to fix — a refund, a replacement, or something else?",
      nextStep: 'propose',
    };
  }

  private propose(context: FlowContext): FlowResponse {
    return {
      message:
        "Based on our policy, here's what I can do: I can process a replacement order that will ship within 24 hours, or issue a refund to your original payment method. Which would you prefer?",
      nextStep: 'confirm',
    };
  }

  private confirm(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(refund|replacement|yes|okay|sounds good|perfect)/.test(t)) {
      const wantsRefund = /refund/.test(t);
      return {
        message: wantsRefund
          ? "Got it — I've submitted the refund. It should appear on your account in 3-5 business days. Is there anything else I can help with?"
          : "Perfect — I've placed the replacement order. You'll get a tracking number by email within 24 hours. Is there anything else I can help with?",
        nextStep: 'close',
        collectedData: { resolution: wantsRefund ? 'refund' : 'replacement' },
      };
    }
    // Not satisfied — escalate
    return this.escalate(
      'Customer declined proposed solution; prefers human agent',
    );
  }

  private close(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(no|nothing|that'?s all|goodbye|bye)/.test(t)) {
      return {
        message:
          'Thank you for calling Dayjoy. Have a wonderful day — goodbye!',
        isComplete: true,
        endCall: true,
      };
    }
    return {
      message: "Of course — what else can I help you with today?",
      nextStep: 'gather_issue',
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private wantsHuman(text: string): boolean {
    return /\b(human|agent|representative|manager|supervisor|talk to a person)\b/i.test(
      text,
    );
  }

  private escalate(reason: string): FlowResponse {
    return {
      message:
        "I understand. Let me connect you with one of our team members who can help you further — please stay on the line.",
      escalateToHuman: true,
      escalateReason: reason,
      toolCalls: [
        {
          name: 'human_transfer',
          arguments: { department: 'customer_support', reason },
        },
      ],
      isComplete: true,
    };
  }

  private extractOrderNumber(text: string): string | null {
    const m = text.match(/\b((?:DJ|DJY|ORD)?[- ]?\d{5,10})\b/i);
    return m ? m[1].toUpperCase().replace(/[-\s]/g, '') : null;
  }
}
