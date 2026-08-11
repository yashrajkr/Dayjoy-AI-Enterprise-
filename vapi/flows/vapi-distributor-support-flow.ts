import { Injectable, Logger } from '@nestjs/common';
import {
  FlowType,
  FlowContext,
  FlowResponse,
  VapiFlow,
} from './vapi-flow-types';

/**
 * Distributor Support Flow
 *
 * Handles calls from existing Dayjoy distributors: compensation-plan
 * questions, rank-advancement help, downline issues, commission
 * disputes, training resources. Steps:
 *   1. identify    — confirm the caller is a distributor (by code)
 *   2. classify    — figure out which sub-topic (comp / rank / downline)
 *   3. resolve     — answer from knowledge base or open a ticket
 *   4. confirm     — verify the distributor is satisfied
 *   5. close
 */
@Injectable()
export class VapiDistributorSupportFlow implements VapiFlow {
  readonly type = FlowType.DISTRIBUTOR_SUPPORT;
  private readonly logger = new Logger(VapiDistributorSupportFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    const step = context.flowState?.step ?? 'identify';
    this.logger.debug(`distributor_support step=${step} session=${context.sessionId}`);

    if (this.wantsHuman(context.userMessage)) {
      return this.escalate('Distributor requested human agent');
    }

    switch (step) {
      case 'identify':
        return this.identify(context);
      case 'classify':
        return this.classify(context);
      case 'resolve':
        return this.resolve(context);
      case 'confirm':
        return this.confirm(context);
      case 'close':
        return this.close(context);
      default:
        return {
          message:
            "I can help with distributor questions — compensation, rank advancement, or your downline. What would you like to know?",
          nextStep: 'classify',
        };
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private identify(context: FlowContext): FlowResponse {
    if (context.customer?.type?.toUpperCase() === 'DISTRIBUTOR') {
      return {
        message: `Hi ${context.customer.name ?? 'there'}! I see you're a Dayjoy distributor. How can I help you today — questions about commissions, rank advancement, or your team?`,
        nextStep: 'classify',
        collectedData: { identified: true },
      };
    }
    // Ask for the distributor code
    return {
      message:
        "Thanks for calling Dayjoy distributor support. Could you share your distributor code so I can pull up your account?",
      nextStep: 'identify',
      toolCalls: context.userMessage.match(/\b[A-Z]{2,4}-?\d{3,6}\b/i)
        ? [
            {
              name: 'distributor_lookup',
              arguments: {
                distributorCode: context.userMessage.match(/\b[A-Z]{2,4}-?\d{3,6}\b/i)![0],
              },
            },
          ]
        : undefined,
    };
  }

  private classify(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(commission|payout|earn|paid)/.test(t)) {
      return {
        message:
          "I can help with commission questions. Let me pull up the latest compensation details — one moment.",
        nextStep: 'resolve',
        collectedData: { topic: 'commissions' },
        toolCalls: [
          {
            name: 'search_knowledge',
            arguments: { query: 'distributor commission payout schedule', topK: 3 },
          },
        ],
      };
    }
    if (/(rank|advancement|promote|level)/.test(t)) {
      return {
        message:
          "Rank advancement — great. Let me look up the current rank requirements so I can give you accurate info.",
        nextStep: 'resolve',
        collectedData: { topic: 'rank_advancement' },
        toolCalls: [
          {
            name: 'search_knowledge',
            arguments: { query: 'rank advancement requirements', topK: 3 },
          },
        ],
      };
    }
    if (/(downline|team|upline|sponsor)/.test(t)) {
      return {
        message:
          "Downline and team questions — I can help. Could you tell me a bit more about what you'd like to know?",
        nextStep: 'resolve',
        collectedData: { topic: 'downline' },
      };
    }
    return {
      message:
        "I can help with commissions, rank advancement, or your downline — which would you like to discuss?",
      nextStep: 'classify',
    };
  }

  private resolve(context: FlowContext): FlowResponse {
    const topic = context.flowState?.data?.topic ?? 'commissions';
    const t = context.userMessage.toLowerCase();
    if (/(still|not happy|dispute|wrong|missing)/.test(t)) {
      return {
        message:
          "I understand this is frustrating. Let me open a support ticket so our distributor relations team can investigate and follow up with you directly.",
        nextStep: 'confirm',
        toolCalls: [
          {
            name: 'create_support_ticket',
            arguments: {
              subject: `Distributor ${topic} inquiry`,
              description: context.userMessage,
              priority: 'high',
            },
          },
        ],
        collectedData: { resolution: 'ticket' },
      };
    }
    return {
      message:
        "Based on our compensation plan, commissions are paid monthly on the 15th, with a 30-day hold for any refunds or chargebacks. You can view your full statement in your distributor portal. Does that answer your question, or would you like me to open a ticket for further review?",
      nextStep: 'confirm',
    };
  }

  private confirm(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(yes|good|great|thanks|that helps|satisfied)/.test(t)) {
      return {
        message:
          "I'm glad I could help. Is there anything else I can help you with today?",
        nextStep: 'close',
      };
    }
    if (/(no|not really|still confused|ticket)/.test(t)) {
      return {
        message:
          "Understood — I'll create a support ticket and our team will reach out within one business day. Is there anything else?",
        nextStep: 'close',
        toolCalls: [
          {
            name: 'create_support_ticket',
            arguments: {
              subject: 'Distributor follow-up needed',
              description: context.userMessage,
              priority: 'normal',
            },
          },
        ],
      };
    }
    return {
      message: "Could you let me know if that answers your question?",
      nextStep: 'confirm',
    };
  }

  private close(context: FlowContext): FlowResponse {
    const t = context.userMessage.toLowerCase();
    if (/(no|nothing|goodbye|that'?s all|bye)/.test(t)) {
      return {
        message:
          'Thank you for being a valued Dayjoy distributor. Have a great day!',
        isComplete: true,
        endCall: true,
      };
    }
    return {
      message:
        "Of course — what else can I help you with? I can answer questions about commissions, rank advancement, or your team.",
      nextStep: 'classify',
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private wantsHuman(text: string): boolean {
    return /\b(human|agent|representative|manager|supervisor)\b/i.test(text);
  }

  private escalate(reason: string): FlowResponse {
    return {
      message:
        "Of course — let me connect you with a member of our distributor relations team. Please stay on the line.",
      escalateToHuman: true,
      escalateReason: reason,
      toolCalls: [
        {
          name: 'human_transfer',
          arguments: { department: 'distributor_relations', reason },
        },
      ],
      isComplete: true,
    };
  }
}
