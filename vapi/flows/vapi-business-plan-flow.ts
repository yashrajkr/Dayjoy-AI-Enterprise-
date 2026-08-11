import { Injectable, Logger } from '@nestjs/common';
import {
  FlowType,
  FlowContext,
  FlowResponse,
  VapiFlow,
} from './vapi-flow-types';

/**
 * Business Plan Flow
 *
 * Handles calls from prospects asking about the Dayjoy business
 * opportunity: how the compensation plan works, how to join, what
 * the starter kit costs, expected earnings. Steps:
 *   1. explain       — give a high-level pitch
 *   2. qualify       — gauge their interest + experience
 *   3. detail        — explain comp plan / starter kit
 *   4. capture_lead  — collect contact info (delegates to lead_capture tool)
 *   5. schedule      — schedule a follow-up call with business development
 *   6. close
 */
@Injectable()
export class VapiBusinessPlanFlow implements VapiFlow {
  readonly type = FlowType.BUSINESS_PLAN;
  private readonly logger = new Logger(VapiBusinessPlanFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    const step = context.flowState?.step ?? 'explain';
    this.logger.debug(`business_plan step=${step} session=${context.sessionId}`);

    switch (step) {
      case 'explain':
        return this.explain(context);
      case 'qualify':
        return this.qualify(context);
      case 'detail':
        return this.detail(context);
      case 'capture_lead':
        return this.captureLead(context);
      case 'schedule':
        return this.schedule(context);
      case 'close':
        return this.close(context);
      default:
        return {
          message:
            "I'd be happy to tell you about the Dayjoy business opportunity. What would you like to know?",
          nextStep: 'explain',
        };
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private explain(context: FlowContext): FlowResponse {
    return {
      message:
        "Dayjoy is a direct-selling company offering premium health and wellness products. As a distributor, you can earn through retail sales, team commissions, and leadership bonuses. Would you like me to walk you through how the compensation works, or would you prefer to start with how to get started?",
      nextStep: 'qualify',
    };
  }

  private qualify(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(compensation|comp plan|how (much|do) (i|you) earn|commission|money)/.test(t)) {
      return {
        message:
          "Great question. The compensation plan has four ways to earn: retail profit (20-40% markup), team commissions (5-15% on downline sales), leadership bonuses (paid monthly), and incentive trips. To qualify for team commissions, you need to maintain 100 PV (Personal Volume) per month. Would you like more details on any of these?",
        nextStep: 'detail',
        collectedData: { interest: 'compensation' },
      };
    }
    if (/(join|sign up|get started|starter|kit)/.test(t)) {
      return {
        message:
          "Excellent! To join, you'll need a starter kit — we offer three options ranging from $99 to $499, depending on how many products you want to begin with. The most popular is the $199 Business Builder Kit. Would you like me to schedule a call with our business development team to walk you through the options?",
        nextStep: 'capture_lead',
        collectedData: { interest: 'joining' },
      };
    }
    return {
      message:
        "I can explain the compensation plan, walk you through how to join, or talk about the starter kits — which would be most helpful?",
      nextStep: 'qualify',
    };
  }

  private detail(context: FlowContext): FlowResponse {
    const interest = context.flowState?.data?.interest;
    if (interest === 'compensation') {
      return {
        message:
          "Here's more detail: retail profit is the difference between wholesale and retail price (typically 25%). Team commissions kick in once you reach 100 PV and have at least one active downline — you earn 5% on level 1, 10% on level 2, up to 15% on level 3. Leadership bonuses start at the rank of Senior Distributor. Does that sound interesting — would you like to explore joining?",
        nextStep: 'capture_lead',
      };
    }
    return {
      message:
        "The starter kits include product samples, marketing materials, and your own distributor website. The $199 Business Builder Kit is the best value — it includes $400 worth of products. Would you like to sign up?",
      nextStep: 'capture_lead',
    };
  }

  private captureLead(context: FlowContext): Promise<FlowResponse> {
    return Promise.resolve(this.runCaptureLead(context));
  }

  private runCaptureLead(context: FlowContext): FlowResponse {
    // Extract email/phone from message
    const email = this.extractEmail(context.userMessage);
    const phone = this.extractPhone(context.userMessage);
    const name = context.customer?.name ?? this.extractName(context.userMessage);
    if (email || phone) {
      return {
        message:
          "Thank you! I've captured your details. Let me schedule a call with our business development team — they'll walk you through everything. When would be a good time to reach you?",
        nextStep: 'schedule',
        collectedData: { email, phone, name },
        toolCalls: [
          {
            name: 'lead_capture',
            arguments: {
              firstName: name?.split(' ')[0] ?? '',
              lastName: name?.split(' ').slice(1).join(' ') ?? '',
              email: email ?? '',
              phone: phone ?? '',
              interest: 'business_opportunity',
            },
          },
        ],
      };
    }
    return {
      message:
        "Wonderful! Could you share your name and the best email or phone number to reach you? Our business development team will reach out within one business day.",
      nextStep: 'capture_lead',
    };
  }

  private schedule(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    const timeOfDay = /morning/.test(t)
      ? 'morning'
      : /afternoon/.test(t)
        ? 'afternoon'
        : /evening/.test(t)
          ? 'evening'
          : null;
    if (timeOfDay) {
      return {
        message: `Perfect — I'll schedule a call for the ${timeOfDay}. Our team will confirm by email. Is there anything else you'd like to know about Dayjoy in the meantime?`,
        nextStep: 'close',
        collectedData: { preferredTime: timeOfDay },
        toolCalls: [
          {
            name: 'appointment_booking',
            arguments: {
              timeOfDay,
              purpose: 'business_opportunity_follow_up',
              name: context.flowState?.data?.name ?? '',
              email: context.flowState?.data?.email ?? '',
              phone: context.flowState?.data?.phone ?? '',
            },
          },
        ],
      };
    }
    return {
      message:
        "Sounds good — would morning, afternoon, or evening work best for you?",
      nextStep: 'schedule',
    };
  }

  private close(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(no|nothing|goodbye|that'?s all|bye)/.test(t)) {
      return {
        message:
          "Thank you for your interest in Dayjoy! We look forward to speaking with you soon. Have a wonderful day!",
        isComplete: true,
        endCall: true,
      };
    }
    return {
      message:
        "Of course — what else would you like to know? I can tell you more about the products, the compensation plan, or the joining process.",
      nextStep: 'qualify',
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private extractEmail(text: string): string | null {
    const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0] : null;
  }

  private extractPhone(text: string): string | null {
    const m = text.match(/(\+?\d[\d\s\-().]{7,}\d)/);
    return m ? m[1].replace(/\s/g, '') : null;
  }

  private extractName(text: string): string | null {
    const m = text.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    return m ? m[1] : null;
  }
}
