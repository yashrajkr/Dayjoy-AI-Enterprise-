/**
 * Vapi Voice Test Cases
 *
 * Table-driven test catalog covering the canonical voice scenarios the
 * Voice AI assistant must handle. Each scenario declares:
 *   - `userSays` — the simulated caller utterance.
 *   - `expectedIntent` — the flow the `VapiConversationFlowManager`
 *     heuristic should detect for this utterance.
 *   - `expectedResponseContains` — substring expected in the assistant
 *     response when the utterance is fed through `processFlow()`.
 *
 * Plus a small set of explicit assertions per scenario (intent matches,
 * response is non-empty, etc).
 *
 * Run with: `vitest run vapi/tests/vapi-voice-test-cases.ts`
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
import { createMockRedis } from '../../backend/_shared/testing/mock-redis';

// ---------------------------------------------------------------------------
// Test case catalog
// ---------------------------------------------------------------------------
export interface VoiceTestCase {
  name: string;
  userSays: string;
  expectedIntent: FlowType;
  expectedResponseContains?: string;
  tags?: string[];
}

const TEST_CASES: VoiceTestCase[] = [
  {
    name: 'customer complains about a delayed order',
    userSays: 'My order still has not arrived and it has been two weeks',
    expectedIntent: FlowType.CUSTOMER_SUPPORT,
    expectedResponseContains: 'Dayjoy support',
    tags: ['customer_support', 'complaint'],
  },
  {
    name: 'customer asks about return policy',
    userSays: 'I want to return this product for a refund',
    expectedIntent: FlowType.CUSTOMER_SUPPORT,
    tags: ['customer_support', 'return'],
  },
  {
    name: 'customer asks for product recommendation',
    userSays: 'Can you recommend a good multivitamin for daily use?',
    expectedIntent: FlowType.PRODUCT_INQUIRY,
    tags: ['product_inquiry', 'recommendation'],
  },
  {
    name: 'customer asks about product price',
    userSays: 'How much does the Omega-3 supplement cost?',
    expectedIntent: FlowType.PRODUCT_INQUIRY,
    tags: ['product_inquiry', 'price'],
  },
  {
    name: 'distributor asks about commission calculation',
    userSays: 'How is my commission calculated this month?',
    expectedIntent: FlowType.DISTRIBUTOR_SUPPORT,
    tags: ['distributor_support', 'commission'],
  },
  {
    name: 'distributor asks about downline performance',
    userSays: 'Show me my downline team performance and rank',
    expectedIntent: FlowType.DISTRIBUTOR_SUPPORT,
    tags: ['distributor_support', 'downline'],
  },
  {
    name: 'prospect asks about joining the business',
    userSays: 'I want to join the Dayjoy business opportunity',
    expectedIntent: FlowType.BUSINESS_PLAN,
    tags: ['business_plan', 'join'],
  },
  {
    name: 'prospect asks about the compensation plan',
    userSays: 'Tell me about the compensation plan and starter kit',
    expectedIntent: FlowType.BUSINESS_PLAN,
    tags: ['business_plan', 'compensation'],
  },
  {
    name: 'customer wants to schedule a call back',
    userSays: 'I would like to schedule an appointment for tomorrow',
    expectedIntent: FlowType.APPOINTMENT_BOOKING,
    tags: ['appointment_booking', 'schedule'],
  },
  {
    name: 'prospect leaves contact details',
    userSays: 'Please follow up with me later — I want more info',
    expectedIntent: FlowType.LEAD_COLLECTION,
    tags: ['lead_collection', 'follow_up'],
  },
  {
    name: 'frustrated customer demands to speak to a human',
    userSays: 'Put me through to a human agent right now',
    expectedIntent: FlowType.HUMAN_ESCALATION,
    tags: ['human_escalation', 'frustrated'],
  },
  {
    name: 'customer asks for a manager',
    userSays: 'I need to speak to your manager immediately',
    expectedIntent: FlowType.HUMAN_ESCALATION,
    tags: ['human_escalation', 'manager'],
  },
];

// ---------------------------------------------------------------------------
// Manager factory
// ---------------------------------------------------------------------------
function buildManager(): VapiConversationFlowManager {
  const openai = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'product_inquiry' } }],
        }),
      },
    },
    embeddings: { create: vi.fn() },
  } as any;
  const sessionMemory = new VapiSessionMemory(createMockRedis() as any);
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

function buildContext(userMessage: string): FlowContext {
  return {
    sessionId: 'sess-1',
    tenantId: 't1',
    userMessage,
  };
}

// ===========================================================================
// Test runner — iterates the catalog
// ===========================================================================
describe('VapiVoiceTestCases', () => {
  let manager: VapiConversationFlowManager;

  beforeEach(() => {
    manager = buildManager();
  });

  describe('intent detection across voice scenarios', () => {
    for (const tc of TEST_CASES) {
      it(`detects ${tc.expectedIntent} for: "${tc.name}"`, async () => {
        const result = await manager.detectIntent(buildContext(tc.userSays));
        expect(result.intent).toBe(tc.expectedIntent);
        expect(result.confidence).toBeGreaterThan(0);
      });
    }
  });

  describe('processFlow returns a non-empty response for every scenario', () => {
    for (const tc of TEST_CASES) {
      it(`responds to: "${tc.name}"`, async () => {
        const result = await manager.processFlow(buildContext(tc.userSays));
        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        if (tc.expectedResponseContains) {
          expect(result.message.toLowerCase()).toContain(
            tc.expectedResponseContains.toLowerCase(),
          );
        }
      });
    }
  });

  describe('human escalation scenarios return escalateToHuman=true', () => {
    for (const tc of TEST_CASES.filter((t) =>
      t.tags?.includes('human_escalation'),
    )) {
      it(`escalates for: "${tc.name}"`, async () => {
        const result = await manager.processFlow(buildContext(tc.userSays));
        expect(result.escalateToHuman).toBe(true);
        expect(result.toolCalls?.some((c) => c.name === 'human_transfer')).toBe(true);
      });
    }
  });

  describe('catalog integrity', () => {
    it('covers all 7 flow types', () => {
      const coveredIntents = new Set(TEST_CASES.map((tc) => tc.expectedIntent));
      for (const flowType of Object.values(FlowType)) {
        expect(coveredIntents.has(flowType)).toBe(true);
      }
    });

    it('contains at least 12 scenarios', () => {
      expect(TEST_CASES.length).toBeGreaterThanOrEqual(12);
    });

    it('every scenario has a non-empty userSays', () => {
      for (const tc of TEST_CASES) {
        expect(tc.userSays.length).toBeGreaterThan(0);
      }
    });
  });
});
