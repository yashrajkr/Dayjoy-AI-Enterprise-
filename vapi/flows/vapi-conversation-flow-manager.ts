import { Inject, Injectable, Logger } from '@nestjs/common';
import { OPENAI_CLIENT } from '../../backend/_shared/ai/openai.provider';
import type OpenAI from 'openai';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import {
  ALL_FLOW_TYPES,
  FlowContext,
  FlowResponse,
  FlowState,
  FlowType,
  IntentResult,
  VapiFlow,
} from './vapi-flow-types';
import { VapiCustomerSupportFlow } from './vapi-customer-support-flow';
import { VapiProductInquiryFlow } from './vapi-product-inquiry-flow';
import { VapiDistributorSupportFlow } from './vapi-distributor-support-flow';
import { VapiBusinessPlanFlow } from './vapi-business-plan-flow';
import { VapiAppointmentBookingFlow } from './vapi-appointment-booking-flow';
import { VapiLeadCollectionFlow } from './vapi-lead-collection-flow';
import { VapiHumanEscalationFlow } from './vapi-human-escalation-flow';

/**
 * System prompt for the LLM intent classifier. The model is told to
 * emit ONLY the intent label, no extra prose, so we can parse the
 * response with a simple string lookup.
 */
const INTENT_SYSTEM_PROMPT = `You are an intent classifier for the Dayjoy voice AI assistant.
Classify the user's latest message into exactly one of these intents:

- customer_support: complaints, order issues, returns, refunds, problems
- product_inquiry: product questions, prices, features, availability
- distributor_support: questions from existing distributors about commissions, rank, downline
- business_plan: questions about joining Dayjoy, the business opportunity, compensation plan
- appointment_booking: scheduling a call or appointment
- lead_collection: caller wants to be contacted back, leave contact details
- human_escalation: caller wants to speak to a human, frustrated, asking for a manager

Reply with ONLY the intent name (one of the seven above). No punctuation, no explanation.`;

/**
 * Confidence threshold below which the manager refuses to commit to
 * a flow and instead asks the user to clarify. Tuned so that obvious
 * intents ("I want a refund") classify with confidence > 0.9 while
 * ambiguous utterances ("hi") land below.
 */
const INTENT_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Vapi Conversation Flow Manager.
 *
 * Routes each user utterance to the right flow:
 *   1. If a flow is already active for the session (stored in Redis
 *      session memory under `flowState`), continue it.
 *   2. Otherwise, detect the intent:
 *      a. Fast path: keyword-based heuristic in
 *         {@link #heuristicIntent}. Handles obvious cases without
 *         an LLM round-trip.
 *      b. Slow path: LLM classifier (gpt-4o-mini, temperature 0).
 *         Used when the heuristic returns low confidence.
 *   3. Persist the detected intent + flow state to Redis session
 *      memory so subsequent utterances route to the same flow.
 *   4. Delegate to the flow's `execute()` method.
 *   5. On flow completion (`isComplete: true`), clear the active
 *      flow from session memory so the next utterance re-classifies.
 */
@Injectable()
export class VapiConversationFlowManager {
  private readonly logger = new Logger(VapiConversationFlowManager.name);

  /** Map of flow type -> implementation, populated in constructor. */
  private readonly flows: Map<FlowType, VapiFlow>;

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    private readonly sessionMemory: VapiSessionMemory,
    customerSupportFlow: VapiCustomerSupportFlow,
    productInquiryFlow: VapiProductInquiryFlow,
    distributorSupportFlow: VapiDistributorSupportFlow,
    businessPlanFlow: VapiBusinessPlanFlow,
    appointmentBookingFlow: VapiAppointmentBookingFlow,
    leadCollectionFlow: VapiLeadCollectionFlow,
    humanEscalationFlow: VapiHumanEscalationFlow,
  ) {
    this.flows = new Map<FlowType, VapiFlow>([
      [FlowType.CUSTOMER_SUPPORT, customerSupportFlow],
      [FlowType.PRODUCT_INQUIRY, productInquiryFlow],
      [FlowType.DISTRIBUTOR_SUPPORT, distributorSupportFlow],
      [FlowType.BUSINESS_PLAN, businessPlanFlow],
      [FlowType.APPOINTMENT_BOOKING, appointmentBookingFlow],
      [FlowType.LEAD_COLLECTION, leadCollectionFlow],
      [FlowType.HUMAN_ESCALATION, humanEscalationFlow],
    ]);
  }

  /**
   * Detect the intent of a user utterance. Uses the active flow as
   * a strong prior (returns it directly if present), then falls
   * back to the heuristic, then the LLM.
   */
  async detectIntent(context: FlowContext): Promise<IntentResult> {
    // 1. Active flow is a strong prior — keep it unless the user
    //    explicitly asks for a human or to switch topics.
    if (context.flowState?.flowType) {
      const wantsHuman = /\b(human|agent|manager|supervisor|talk to a person)\b/i.test(
        context.userMessage,
      );
      if (wantsHuman) {
        return { intent: FlowType.HUMAN_ESCALATION, confidence: 0.95 };
      }
      return {
        intent: context.flowState.flowType,
        confidence: 0.8,
      };
    }

    // 2. Heuristic fast path
    const heuristic = this.heuristicIntent(context.userMessage);
    if (heuristic.confidence >= 0.7) {
      return heuristic;
    }

    // 3. LLM classifier
    try {
      const llm = await this.llmIntent(context.userMessage);
      if (llm) return llm;
    } catch (err) {
      this.logger.warn(
        `LLM intent classification failed: ${(err as Error).message} — using heuristic fallback`,
      );
    }

    // 4. Final fallback — the heuristic result, even if low confidence
    return heuristic;
  }

  /**
   * Process a user utterance: detect intent, run the flow, persist
   * state, return the response.
   */
  async processFlow(context: FlowContext): Promise<FlowResponse> {
    const intent = await this.detectIntent(context);

    if (intent.confidence < INTENT_CONFIDENCE_THRESHOLD) {
      return {
        message:
          "I want to make sure I understand. Could you tell me a bit more about what you're looking for — help with an order, product information, or something else?",
      };
    }

    const flow = this.flows.get(intent.intent);
    if (!flow) {
      this.logger.error(`No flow registered for intent ${intent.intent}`);
      return {
        message:
          "I'm sorry, I'm not sure how to help with that. Could you rephrase?",
      };
    }

    // Make sure the flowState on the context matches the detected
    // intent — if the user switched topics, start a fresh flow.
    if (
      !context.flowState ||
      context.flowState.flowType !== intent.intent
    ) {
      context.flowState = {
        flowType: intent.intent,
        step: 'greeting',
        data: { ...(intent.entities ?? {}) },
        startedAt: new Date(),
        lastUpdated: new Date(),
        completedSteps: [],
      };
    }

    let response: FlowResponse;
    try {
      response = await flow.execute(context);
    } catch (err) {
      this.logger.error(
        `Flow ${intent.intent} threw: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return {
        message:
          "I'm sorry, something went wrong on my end. Let me transfer you to a team member who can help.",
        escalateToHuman: true,
        escalateReason: `Flow execution error: ${(err as Error).message}`,
      };
    }

    // Persist the updated flow state to Redis so the next utterance
    // picks up where we left off.
    await this.persistFlowState(context, response, intent.intent);

    return response;
  }

  /**
   * Initialize (or reset) the flow state for a session. Called by
   * the call-started handler to make sure we have a clean slate.
   */
  async resetFlowState(sessionId: string): Promise<void> {
    await this.sessionMemory.set(sessionId, 'flowState', null);
    await this.sessionMemory.set(sessionId, 'activeFlow', null);
  }

  // -------------------------------------------------------------------
  // Intent detection strategies
  // -------------------------------------------------------------------

  /**
   * Keyword-based heuristic intent detection. Fast (no LLM call)
   * and accurate for obvious cases. Returns confidence 0.5-0.95 for
   * matched intents, or 0.3 + product_inquiry as a soft default.
   */
  private heuristicIntent(message: string): IntentResult {
    const t = message.toLowerCase();

    if (/\b(human|agent|representative|manager|supervisor|talk to (a )?person)\b/.test(t)) {
      return { intent: FlowType.HUMAN_ESCALATION, confidence: 0.95 };
    }
    if (/\b(buy|price|cost|how much|product|catalog|item|in stock)\b/.test(t)) {
      return { intent: FlowType.PRODUCT_INQUIRY, confidence: 0.85 };
    }
    if (/\b(order|delivery|shipment|track|return|refund|complaint|issue|problem|broken|damaged)\b/.test(t)) {
      return { intent: FlowType.CUSTOMER_SUPPORT, confidence: 0.9 };
    }
    if (/\b(distributor|commission|rank|downline|upline|payout)\b/.test(t)) {
      return { intent: FlowType.DISTRIBUTOR_SUPPORT, confidence: 0.9 };
    }
    if (/\b(business|opportunity|join|sign ?up|earn|income|compensation|starter kit)\b/.test(t)) {
      return { intent: FlowType.BUSINESS_PLAN, confidence: 0.9 };
    }
    if (/\b(appointment|schedule|book|meet|call back)\b/.test(t)) {
      return { intent: FlowType.APPOINTMENT_BOOKING, confidence: 0.85 };
    }
    if (/\b(lead|interest|contact me|more info|reach me|follow up)\b/.test(t)) {
      return { intent: FlowType.LEAD_COLLECTION, confidence: 0.85 };
    }
    // Soft default — product inquiry is the most common call type.
    return { intent: FlowType.PRODUCT_INQUIRY, confidence: 0.3 };
  }

  /**
   * LLM-based intent classification. Uses gpt-4o-mini at
   * temperature 0 for deterministic output. Returns null on parse
   * failure (caller falls back to heuristic).
   */
  private async llmIntent(message: string): Promise<IntentResult | null> {
    if (!message || message.trim().length < 3) return null;
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0,
      max_tokens: 20,
    });
    const raw = response.choices[0]?.message?.content?.trim().toLowerCase();
    if (!raw) return null;
    const match = ALL_FLOW_TYPES.find((f) => f === raw);
    if (!match) return null;
    return { intent: match, confidence: 0.85 };
  }

  // -------------------------------------------------------------------
  // State persistence
  // -------------------------------------------------------------------

  /**
   * Persist the updated flow state to Redis session memory.
   *
   * If the flow signaled completion (`isComplete: true`), the
   * flowState is cleared so the next utterance re-classifies.
   * Otherwise, the step / data are updated.
   */
  private async persistFlowState(
    context: FlowContext,
    response: FlowResponse,
    intent: FlowType,
  ): Promise<void> {
    try {
      if (response.isComplete) {
        await this.sessionMemory.set(context.sessionId, 'flowState', null);
        await this.sessionMemory.set(context.sessionId, 'activeFlow', null);
        return;
      }

      const current = context.flowState!;
      const updated: FlowState = {
        ...current,
        flowType: intent,
        step: response.nextStep ?? current.step,
        data: { ...current.data, ...(response.collectedData ?? {}) },
        lastUpdated: new Date(),
        completedSteps:
          response.nextStep && !current.completedSteps.includes(current.step)
            ? [...current.completedSteps, current.step]
            : current.completedSteps,
      };
      await this.sessionMemory.set(context.sessionId, 'flowState', updated);
      await this.sessionMemory.set(context.sessionId, 'activeFlow', intent);
    } catch (err) {
      // Don't fail the whole turn just because we couldn't persist
      // flow state — the next turn will re-detect.
      this.logger.warn(
        `Failed to persist flow state for session ${context.sessionId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Get the flow implementation for a type. Exposed for testing.
   */
  getFlow(type: FlowType): VapiFlow | undefined {
    return this.flows.get(type);
  }
}
