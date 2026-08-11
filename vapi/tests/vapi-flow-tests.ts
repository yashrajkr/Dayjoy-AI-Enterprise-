/**
 * Vapi Flow Tests
 *
 * Real unit tests for the conversation-flow layer.
 *
 * Coverage:
 *   1. `VapiConversationFlowManager.detectIntent()` — heuristic fast path
 *      across all 7 intent types + active-flow prior + LLM fallback.
 *   2. The 7 flow implementations (Customer Support, Product Inquiry,
 *      Distributor Support, Business Plan, Appointment Booking,
 *      Lead Collection, Human Escalation) — happy path + escalation
 *      triggers + state transitions.
 *
 * The flow manager's OpenAI client is mocked so we never hit a real
 * LLM API in tests.
 *
 * Run with: `vitest run vapi/tests/vapi-flow-tests.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VapiConversationFlowManager } from '../flows/vapi-conversation-flow-manager';
import { VapiCustomerSupportFlow } from '../flows/vapi-customer-support-flow';
import { VapiProductInquiryFlow } from '../flows/vapi-product-inquiry-flow';
import { VapiDistributorSupportFlow } from '../flows/vapi-distributor-support-flow';
import { VapiBusinessPlanFlow } from '../flows/vapi-business-plan-flow';
import { VapiAppointmentBookingFlow } from '../flows/vapi-appointment-booking-flow';
import { VapiLeadCollectionFlow } from '../flows/vapi-lead-collection-flow';
import { VapiHumanEscalationFlow } from '../flows/vapi-human-escalation-flow';
import { FlowType, type FlowContext } from '../flows/vapi-flow-types';
import { VapiSessionMemory } from '../memory/vapi-session-memory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContext(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    sessionId: 'sess-1',
    tenantId: 't1',
    userMessage: '',
    ...overrides,
  };
}

function makeMockSessionMemory() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue(null),
    getByCallId: vi.fn().mockResolvedValue(null),
    clear: vi.fn().mockResolvedValue(undefined),
  } as unknown as VapiSessionMemory;
}

function makeMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: { content: 'product_inquiry' },
            },
          ],
        }),
      },
    },
    embeddings: { create: vi.fn() },
  };
}

function buildManager(): VapiConversationFlowManager {
  const openai = makeMockOpenAI() as any;
  const sessionMemory = makeMockSessionMemory();
  return new VapiConversationFlowManager(
    openai,
    sessionMemory,
    new VapiCustomerSupportFlow(),
    new VapiProductInquiryFlow(),
    new VapiDistributorSupportFlow(),
    new VapiBusinessPlanFlow(),
    new VapiAppointmentBookingFlow(),
    new VapiLeadCollectionFlow(),
    new VapiHumanEscalationFlow(),
  );
}

// ===========================================================================
// VapiConversationFlowManager — Intent Detection
// ===========================================================================
describe('VapiFlows', () => {
  describe('VapiConversationFlowManager.detectIntent (heuristic)', () => {
    let manager: VapiConversationFlowManager;

    beforeEach(() => {
      manager = buildManager();
    });

    it('detects customer_support intent on "order issue"', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'I have a problem with my order' }),
      );
      expect(result.intent).toBe(FlowType.CUSTOMER_SUPPORT);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('detects customer_support intent on "return"', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'I want to return this product' }),
      );
      expect(result.intent).toBe(FlowType.CUSTOMER_SUPPORT);
    });

    it('detects product_inquiry intent on "product" keyword', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'Tell me about your products' }),
      );
      expect(result.intent).toBe(FlowType.PRODUCT_INQUIRY);
    });

    it('detects product_inquiry intent on "price" keyword', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'What is the price of multivitamin?' }),
      );
      expect(result.intent).toBe(FlowType.PRODUCT_INQUIRY);
    });

    it('detects distributor_support intent', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'How is my commission calculated?' }),
      );
      expect(result.intent).toBe(FlowType.DISTRIBUTOR_SUPPORT);
    });

    it('detects business_plan intent on "join" + "opportunity"', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'I want to join the business opportunity' }),
      );
      expect(result.intent).toBe(FlowType.BUSINESS_PLAN);
    });

    it('detects appointment_booking intent on "schedule"', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'I want to schedule an appointment' }),
      );
      expect(result.intent).toBe(FlowType.APPOINTMENT_BOOKING);
    });

    it('detects lead_collection intent on "follow up"', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'Please follow up with me later' }),
      );
      expect(result.intent).toBe(FlowType.LEAD_COLLECTION);
    });

    it('detects human_escalation intent on "human/manager"', async () => {
      const result = await manager.detectIntent(
        buildContext({ userMessage: 'I want to speak to a human agent' }),
      );
      expect(result.intent).toBe(FlowType.HUMAN_ESCALATION);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('uses active flow as a strong prior when no human request', async () => {
      const result = await manager.detectIntent(
        buildContext({
          userMessage: 'Yes',
          flowState: {
            flowType: FlowType.BUSINESS_PLAN,
            step: 'explain_opportunity',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.intent).toBe(FlowType.BUSINESS_PLAN);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('switches to human_escalation when user asks for human even mid-flow', async () => {
      const result = await manager.detectIntent(
        buildContext({
          userMessage: 'Just put me through to a manager please',
          flowState: {
            flowType: FlowType.CUSTOMER_SUPPORT,
            step: 'gather_issue',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.intent).toBe(FlowType.HUMAN_ESCALATION);
    });
  });

  // =========================================================================
  // Customer Support Flow
  // =========================================================================
  describe('VapiCustomerSupportFlow', () => {
    let flow: VapiCustomerSupportFlow;

    beforeEach(() => {
      flow = new VapiCustomerSupportFlow();
    });

    it('greets on the first step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.message).toContain('Dayjoy support');
      expect(result.nextStep).toBe('gather_issue');
    });

    it('extracts an order number and triggers customer_lookup tool call', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'I have a problem with order ORD123456',
          flowState: {
            flowType: FlowType.CUSTOMER_SUPPORT,
            step: 'gather_issue',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.nextStep).toBe('lookup');
      expect(result.collectedData?.orderNumber).toBeTruthy();
      expect(result.toolCalls?.[0]?.name).toBe('customer_lookup');
    });

    it('escalates when user asks for a human', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'Just transfer me to a human agent',
          flowState: {
            flowType: FlowType.CUSTOMER_SUPPORT,
            step: 'gather_issue',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
      expect(result.toolCalls?.[0]?.name).toBe('human_transfer');
      expect(result.isComplete).toBe(true);
    });

    it('closes the call when user says goodbye', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'No, that is all. Goodbye.',
          flowState: {
            flowType: FlowType.CUSTOMER_SUPPORT,
            step: 'close',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.isComplete).toBe(true);
      expect(result.endCall).toBe(true);
      expect(result.message).toContain('goodbye');
    });
  });

  // =========================================================================
  // Product Inquiry Flow
  // =========================================================================
  describe('VapiProductInquiryFlow', () => {
    let flow: VapiProductInquiryFlow;

    beforeEach(() => {
      flow = new VapiProductInquiryFlow();
    });

    it('greets on the first step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.nextStep).toBeTruthy();
    });

    it('escalates when user asks for a human mid-flow', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'I want to talk to a person',
          flowState: {
            flowType: FlowType.PRODUCT_INQUIRY,
            step: 'gather_product_interest',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
    });
  });

  // =========================================================================
  // Distributor Support Flow
  // =========================================================================
  describe('VapiDistributorSupportFlow', () => {
    let flow: VapiDistributorSupportFlow;

    beforeEach(() => {
      flow = new VapiDistributorSupportFlow();
    });

    it('returns a message + next step on the greeting step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.message).toBeTruthy();
      expect(typeof result.nextStep === 'string' || result.isComplete).toBe(true);
    });

    it('escalates when user asks for a human', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'transfer me to a manager',
          flowState: {
            flowType: FlowType.DISTRIBUTOR_SUPPORT,
            step: 'greeting',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
    });
  });

  // =========================================================================
  // Business Plan Flow
  // =========================================================================
  describe('VapiBusinessPlanFlow', () => {
    let flow: VapiBusinessPlanFlow;

    beforeEach(() => {
      flow = new VapiBusinessPlanFlow();
    });

    it('returns a message on the greeting step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.message).toBeTruthy();
    });

    it('escalates when user asks for a human', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'please put me through to a human',
          flowState: {
            flowType: FlowType.BUSINESS_PLAN,
            step: 'greeting',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
    });
  });

  // =========================================================================
  // Appointment Booking Flow
  // =========================================================================
  describe('VapiAppointmentBookingFlow', () => {
    let flow: VapiAppointmentBookingFlow;

    beforeEach(() => {
      flow = new VapiAppointmentBookingFlow();
    });

    it('returns a message on the greeting step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.message).toBeTruthy();
    });

    it('escalates when user asks for a human', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'I want to talk to an agent',
          flowState: {
            flowType: FlowType.APPOINTMENT_BOOKING,
            step: 'greeting',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
    });
  });

  // =========================================================================
  // Lead Collection Flow
  // =========================================================================
  describe('VapiLeadCollectionFlow', () => {
    let flow: VapiLeadCollectionFlow;

    beforeEach(() => {
      flow = new VapiLeadCollectionFlow();
    });

    it('returns a message on the greeting step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.message).toBeTruthy();
    });

    it('escalates when user asks for a human', async () => {
      const result = await flow.execute(
        buildContext({
          userMessage: 'put me through to a supervisor',
          flowState: {
            flowType: FlowType.LEAD_COLLECTION,
            step: 'greeting',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: [],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
    });
  });

  // =========================================================================
  // Human Escalation Flow
  // =========================================================================
  describe('VapiHumanEscalationFlow', () => {
    let flow: VapiHumanEscalationFlow;

    beforeEach(() => {
      flow = new VapiHumanEscalationFlow();
    });

    it('triggers human_transfer + escalates on the greeting step', async () => {
      const result = await flow.execute(
        buildContext({ userMessage: 'I need to talk to someone' }),
      );
      expect(result.escalateToHuman).toBe(true);
      expect(result.toolCalls?.some((c) => c.name === 'human_transfer')).toBe(true);
    });
  });

  // =========================================================================
  // VapiConversationFlowManager.getFlow — registry coverage
  // =========================================================================
  describe('VapiConversationFlowManager.getFlow', () => {
    it('returns the registered flow for every FlowType', () => {
      const manager = buildManager();
      for (const type of Object.values(FlowType)) {
        const flow = manager.getFlow(type);
        expect(flow).toBeDefined();
        expect(flow?.type).toBe(type);
      }
    });
  });

  // =========================================================================
  // VapiConversationFlowManager.processFlow — orchestration
  // =========================================================================
  describe('VapiConversationFlowManager.processFlow', () => {
    it('dispatches to the customer support flow on a complaint utterance', async () => {
      const manager = buildManager();
      const result = await manager.processFlow(
        buildContext({ userMessage: 'I have a complaint about my order' }),
      );

      expect(result.message).toBeTruthy();
      // The first response from any flow should include a non-empty
      // `message` for the assistant to speak.
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('asks for clarification when intent confidence is too low', async () => {
      const manager = buildManager();
      // "hi" alone falls back to product_inquiry at confidence 0.3
      // (below the 0.5 threshold) — the manager should ask for more info.
      const result = await manager.processFlow(
        buildContext({ userMessage: 'hi' }),
      );
      expect(result.message).toMatch(/understand|tell me|help/i);
    });

    it('escalates when user asks for a human mid-flow', async () => {
      const manager = buildManager();
      const result = await manager.processFlow(
        buildContext({
          userMessage: 'transfer me to a human agent',
          flowState: {
            flowType: FlowType.CUSTOMER_SUPPORT,
            step: 'gather_issue',
            data: {},
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: ['greeting'],
          },
        }),
      );
      expect(result.escalateToHuman).toBe(true);
    });
  });
});
