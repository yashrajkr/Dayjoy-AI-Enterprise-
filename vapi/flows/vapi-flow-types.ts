/**
 * Vapi Flow Types
 *
 * Type definitions for the conversation-flow subsystem. A "flow" is
 * a stateful, multi-turn dialog script for one of the seven intent
 * categories the assistant handles (customer support, product
 * inquiry, distributor support, business plan, appointment booking,
 * lead collection, human escalation).
 *
 * Each flow implements the {@link VapiFlow} interface and is
 * dispatched by {@link VapiConversationFlowManager} based on the
 * intent detected for the current user utterance.
 */

/**
 * The seven canonical flow types.
 *
 * The values match the strings the LLM intent classifier is
 * prompted to emit — keep them stable across prompt versions so
 * the manager's `getFlow(type)` lookup keeps working.
 */
export enum FlowType {
  CUSTOMER_SUPPORT = 'customer_support',
  PRODUCT_INQUIRY = 'product_inquiry',
  DISTRIBUTOR_SUPPORT = 'distributor_support',
  BUSINESS_PLAN = 'business_plan',
  APPOINTMENT_BOOKING = 'appointment_booking',
  LEAD_COLLECTION = 'lead_collection',
  HUMAN_ESCALATION = 'human_escalation',
}

/**
 * All valid flow type string literals. Useful for runtime validation
 * of LLM-emitted intent labels.
 */
export const ALL_FLOW_TYPES: readonly FlowType[] = Object.values(FlowType);

/**
 * Per-session flow state. Stored in the Redis session memory under
 * the `flowState` key so it survives webhook retries and multi-pod
 * routing.
 */
export interface FlowState {
  flowType: FlowType;
  step: string;
  data: Record<string, any>;
  startedAt: Date;
  lastUpdated: Date;
  completedSteps: string[];
}

/**
 * Context passed into every flow `execute()` call. The manager
 * builds this from the Redis session memory + the current user
 * utterance.
 */
export interface FlowContext {
  sessionId: string;
  tenantId: string;
  customerId?: string;
  conversationId?: string;
  callId?: string;
  userMessage: string;
  flowState?: FlowState;
  customer?: {
    id: string;
    name?: string;
    type?: string;
    recentOrders?: Array<{
      orderNumber: string;
      status: string;
      total: number;
    }>;
    preferences?: Record<string, string>;
    facts?: Array<{ key: string; value: string }>;
  };
}

/**
 * Response from a flow step. The `message` is what the assistant
 * speaks next; the other flags tell the caller (Vapi) what to do.
 */
export interface FlowResponse {
  /** What the assistant should say next. */
  message: string;
  /** Tools to invoke (the manager will translate these into Vapi function calls). */
  toolCalls?: Array<{ name: string; arguments: Record<string, any> }>;
  /** Set to true to trigger a human handoff. */
  escalateToHuman?: boolean;
  /** Reason for the escalation (logged + shown to the human agent). */
  escalateReason?: string;
  /** Set to true to end the call after speaking the message. */
  endCall?: boolean;
  /** Next step id within the flow (omitted if the flow is complete). */
  nextStep?: string;
  /** Mark the flow as complete (clears the activeFlow in session memory). */
  isComplete?: boolean;
  /** Data extracted during this step (merged into flowState.data). */
  collectedData?: Record<string, any>;
}

/**
 * Interface every flow implementation must satisfy.
 */
export interface VapiFlow {
  /** The flow type this implementation handles. */
  readonly type: FlowType;
  /**
   * Execute one step of the flow. The context contains the user's
   * latest utterance + the current flow state. Returns the response
   * to speak + the next step (or completion flag).
   */
  execute(context: FlowContext): Promise<FlowResponse>;
}

/**
 * Intent detection result. `confidence` is 0-1 — when below 0.5,
 * the manager will re-prompt the user to clarify rather than
 * committing to a flow.
 */
export interface IntentResult {
  intent: FlowType;
  confidence: number;
  entities?: Record<string, any>;
}

/**
 * Escalation-phrase matcher shared by every flow's `execute()`. A
 * caller can ask for a human at ANY point mid-flow, not just when the
 * top-level intent classifier happens to route to
 * `FlowType.HUMAN_ESCALATION` on the very first turn — e.g. someone
 * three turns into `product_inquiry` who suddenly says "I want to talk
 * to a person" needs to escalate immediately, not finish the current
 * flow first. Each non-escalation flow checks this at the top of its
 * own `execute()` and, on a match, hands off to
 * `FlowType.HUMAN_ESCALATION`-shaped behavior itself rather than
 * silently continuing its own step machine.
 *
 * Mirrors the phrase list in
 * `vapi/webhooks/vapi-transcript-handler.ts`'s `detectEscalation()` —
 * that one flags the session for later reporting; this one drives
 * live in-call behavior.
 */
const ESCALATION_PHRASE_PATTERN =
  /\b(human|agent|representative|real person|talk to (a )?person|speak to (a )?(human|person)|manager|supervisor)\b/i;

export function isEscalationRequest(userMessage: string): boolean {
  return ESCALATION_PHRASE_PATTERN.test(userMessage ?? '');
}

/**
 * Build the standard escalation `FlowResponse` a flow returns when
 * {@link isEscalationRequest} matches mid-flow. Shared so every flow
 * produces the same shape `VapiHumanEscalationFlow` itself returns
 * (message + `escalateToHuman: true` + a `human_transfer` tool call +
 * `isComplete: true`), rather than each flow inventing its own
 * variant.
 */
export function buildMidFlowEscalationResponse(
  context: FlowContext,
  department: string,
): FlowResponse {
  return {
    message:
      "I understand you'd like to speak with a human agent. I'm going to transfer you now. Please stay on the line.",
    escalateToHuman: true,
    escalateReason: 'Customer asked for a human agent mid-flow',
    toolCalls: [
      {
        name: 'human_transfer',
        arguments: {
          department,
          reason: 'Customer asked for a human agent mid-flow',
          customerId: context.customer?.id ?? '',
          conversationId: context.conversationId ?? '',
        },
      },
    ],
    isComplete: true,
    endCall: false,
  };
}
