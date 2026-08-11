import { Injectable, Logger } from '@nestjs/common';
import {
  FlowType,
  FlowContext,
  FlowResponse,
  VapiFlow,
} from './vapi-flow-types';

/**
 * Human Escalation Flow
 *
 * The "I want to talk to a person" flow. Single-step:
 *   1. summarize  — acknowledge + summarize what we know (so the
 *                   human agent gets context)
 *   2. transfer   — invoke human_transfer tool with department + reason
 *
 * This flow is also entered by force when any other flow's response
 * sets `escalateToHuman: true` — the manager re-routes through here
 * so the caller always gets a consistent handoff experience.
 */
@Injectable()
export class VapiHumanEscalationFlow implements VapiFlow {
  readonly type = FlowType.HUMAN_ESCALATION;
  private readonly logger = new Logger(VapiHumanEscalationFlow.name);

  async execute(context: FlowContext): Promise<FlowResponse> {
    const step = context.flowState?.step ?? 'summarize';
    this.logger.debug(`human_escalation step=${step} session=${context.sessionId}`);

    switch (step) {
      case 'summarize':
        return this.summarize(context);
      case 'transfer':
        return this.transfer(context);
      case 'close':
        return this.close(context);
      default:
        return this.summarize(context);
    }
  }

  // -------------------------------------------------------------------
  // steps
  // -------------------------------------------------------------------

  private summarize(context: FlowContext): FlowResponse {
    const reason =
      context.flowState?.data?.reason ??
      this.inferReason(context.userMessage) ??
      'Customer requested human assistance';

    // Build a one-sentence summary of what we know so the human
    // agent doesn't have to listen to the full recording from
    // scratch.
    const summaryParts: string[] = [];
    if (context.customer?.name) {
      summaryParts.push(`Caller: ${context.customer.name}`);
    }
    if (context.flowState?.flowType) {
      summaryParts.push(`prior flow: ${context.flowState.flowType}`);
    }
    if (context.flowState?.data?.orderNumber) {
      summaryParts.push(`order: ${context.flowState.data.orderNumber}`);
    }
    if (context.flowState?.data?.topic) {
      summaryParts.push(`topic: ${context.flowState.data.topic}`);
    }
    const summary = summaryParts.join('; ');

    return {
      message:
        "I understand you'd like to speak with a human agent. I'm going to transfer you now and share what we've discussed so you don't have to repeat yourself. Please stay on the line.",
      nextStep: 'transfer',
      collectedData: { reason, summary },
    };
  }

  private transfer(context: FlowContext): FlowResponse {
    const data = context.flowState?.data ?? {};
    const department = this.inferDepartment(data.reason, context);
    return {
      message: `Transferring you to our ${department.replace(/_/g, ' ')} team now. Thank you for your patience.`,
      escalateToHuman: true,
      escalateReason: data.reason ?? 'Customer requested human assistance',
      toolCalls: [
        {
          name: 'human_transfer',
          arguments: {
            department,
            reason: data.reason ?? 'Customer requested human assistance',
            summary: data.summary ?? '',
            customerId: context.customer?.id ?? '',
            conversationId: context.conversationId ?? '',
          },
        },
      ],
      isComplete: true,
      endCall: false, // don't hang up — the transfer takes over the call
    };
  }

  private close(context: FlowContext): FlowResponse {
    // If the transfer failed (e.g. after-hours with no agents), the
    // manager can re-enter here to gracefully close the call.
    return {
      message:
        "I'm sorry, but I wasn't able to transfer you right now. Our team will call you back as soon as possible. Thank you for your patience — goodbye.",
      isComplete: true,
      endCall: true,
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private inferReason(text: string): string | null {
    const t = text.toLowerCase();
    if (/frustrated|angry|upset/.test(t)) return 'Customer expressed frustration';
    if (/complaint/.test(t)) return 'Customer wants to file a complaint';
    if (/manager|supervisor/.test(t)) return 'Customer requested escalation to manager';
    if (/not helpful|you'?re not/.test(t)) return 'AI assistant was not helpful';
    return 'Customer requested human assistance';
  }

  private inferDepartment(
    reason: string | undefined,
    context: FlowContext,
  ): string {
    const priorFlow = context.flowState?.data?.priorFlow ?? context.flowState?.flowType;
    if (priorFlow === FlowType.DISTRIBUTOR_SUPPORT) return 'distributor_relations';
    if (priorFlow === FlowType.PRODUCT_INQUIRY) return 'sales';
    if (priorFlow === FlowType.BUSINESS_PLAN) return 'business_development';
    if (priorFlow === FlowType.CUSTOMER_SUPPORT) return 'customer_support';
    if (/complaint/i.test(reason ?? '')) return 'customer_relations';
    return 'customer_support';
  }
}
