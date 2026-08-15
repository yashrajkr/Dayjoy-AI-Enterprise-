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
 * Product Inquiry Flow
 *
 * Handles questions about products: features, prices, availability,
 * recommendations. Steps:
 *   1. greeting        — find out what product they're asking about
 *   2. search          — call search_products with the extracted query
 *   3. present         — describe the matching product(s) + price
 *   4. offer_purchase  — offer to place an order or schedule a follow-up
 *   5. close           — wrap up
 */
@Injectable()
export class VapiProductInquiryFlow implements VapiFlow {
  readonly type = FlowType.PRODUCT_INQUIRY;
  private readonly logger = new Logger(VapiProductInquiryFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    // A caller can ask for a human at any step, not just the first
    // turn — check before dispatching to the current step so an
    // escalation request mid-flow doesn't get swallowed by whatever
    // step-specific regex happens to be active.
    if (isEscalationRequest(context.userMessage)) {
      return buildMidFlowEscalationResponse(context, 'sales');
    }

    const step = context.flowState?.step ?? 'greeting';
    this.logger.debug(`product_inquiry step=${step} session=${context.sessionId}`);

    switch (step) {
      case 'greeting':
        return this.greeting(context);
      case 'search':
        return this.search(context);
      case 'present':
        return this.present(context);
      case 'offer_purchase':
        return this.offerPurchase(context);
      case 'close':
        return this.close(context);
      default:
        return {
          message:
            "I can help with product information. What product are you interested in?",
          nextStep: 'greeting',
        };
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private greeting(context: FlowContext): FlowResponse {
    // If the user already named a product in their opening message,
    // skip straight to the search step.
    const productName = this.extractProductName(context.userMessage);
    if (productName) {
      return {
        message: `Let me look up ${productName} for you — one moment.`,
        nextStep: 'search',
        collectedData: { productName },
        toolCalls: [
          {
            name: 'search_products',
            arguments: { productName, searchAll: false },
          },
        ],
      };
    }
    return {
      message:
        "I'd be happy to help with product information. Dayjoy offers a range of premium health and wellness products — are you looking for something specific, or would you like me to suggest our most popular items?",
      nextStep: 'greeting',
    };
  }

  private search(context: FlowContext): FlowResponse {
    // After the search tool runs, the next user message will be the
    // tool result + their follow-up. For now, present the (mocked)
    // result and ask if they want more details.
    const productName = context.flowState?.data?.productName ?? 'that product';
    return {
      message: `${productName} is one of our most-loved products. It's priced at $49.99 for a 30-day supply, with a 60-day money-back guarantee. Would you like to hear about its benefits, or shall I help you place an order?`,
      nextStep: 'present',
      toolCalls: [
        {
          name: 'search_knowledge',
          arguments: { query: `${productName} benefits usage`, topK: 3 },
        },
      ],
    };
  }

  private present(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(buy|order|purchase|ship|get it)/.test(t)) {
      return {
        message:
          "Wonderful! I can connect you to our ordering team, or schedule a follow-up call. Would you prefer to place the order now with one of our team members, or shall I have someone call you back?",
        nextStep: 'offer_purchase',
      };
    }
    if (/(benefit|how|use|ingredient)/.test(t)) {
      return {
        message:
          "This product supports immune health with a blend of natural ingredients including vitamin C, zinc, and elderberry. The recommended usage is one tablet daily with meals. Would you like to place an order?",
        nextStep: 'offer_purchase',
      };
    }
    return {
      message:
        "Is there anything else you'd like to know about this product, or would you like to place an order?",
      nextStep: 'present',
    };
  }

  private offerPurchase(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(call back|follow.?up|schedule)/.test(t)) {
      return {
        message:
          "No problem — I'll have one of our team members call you back to complete the order. Would tomorrow morning or afternoon work better?",
        nextStep: 'close',
        collectedData: { intent: 'follow_up' },
        toolCalls: [
          {
            name: 'lead_capture',
            arguments: {
              firstName: context.customer?.name?.split(' ')[0] ?? '',
              lastName: context.customer?.name?.split(' ').slice(1).join(' ') ?? '',
              phone: '',
              interest: 'product_purchase',
            },
          },
        ],
      };
    }
    if (/(now|place|order|talk to|agent)/.test(t)) {
      return {
        message:
          "I'll transfer you to our ordering team now — please stay on the line.",
        escalateToHuman: true,
        escalateReason: 'Customer wants to place an order with a human agent',
        toolCalls: [
          {
            name: 'human_transfer',
            arguments: { department: 'sales', reason: 'Place product order' },
          },
        ],
        isComplete: true,
      };
    }
    return {
      message:
        "I can also help you with product details, or schedule a follow-up — what would you prefer?",
      nextStep: 'offer_purchase',
    };
  }

  private close(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(morning|afternoon|evening)/.test(t)) {
      return {
        message:
          "Got it — I'll note that you prefer a call back in the " +
          this.timeOfDayFromMessage(t) +
          ". Our team will reach out within one business day. Is there anything else I can help with?",
        nextStep: 'close',
        collectedData: { preferredTime: this.timeOfDayFromMessage(t) },
      };
    }
    if (/(no|nothing|goodbye|bye|that'?s all)/.test(t)) {
      return {
        message: 'Thank you for calling Dayjoy. Have a wonderful day!',
        isComplete: true,
        endCall: true,
      };
    }
    return {
      message: "Is there anything else I can help you with today?",
      nextStep: 'close',
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private extractProductName(text: string): string | null {
    // Look for "product X", "X product", "the X", or just a
    // capitalized word sequence. Very heuristic — the LLM intent
    // classifier does the real work; this just helps fast-path
    // obvious cases.
    const m =
      text.match(/(?:product|item|about|the)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/) ??
      text.match(/\b(vitamin|immune|wellness|probiotic|collagen|omega)\b/i);
    return m ? (m[1] ?? m[0]) : null;
  }

  private timeOfDayFromMessage(text: string): string {
    if (/morning/.test(text)) return 'morning';
    if (/afternoon/.test(text)) return 'afternoon';
    if (/evening/.test(text)) return 'evening';
    return 'business hours';
  }
}
