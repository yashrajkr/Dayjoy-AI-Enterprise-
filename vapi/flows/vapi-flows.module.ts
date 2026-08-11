import { Module } from '@nestjs/common';
import { VapiConversationFlowManager } from './vapi-conversation-flow-manager';
import { VapiCustomerSupportFlow } from './vapi-customer-support-flow';
import { VapiProductInquiryFlow } from './vapi-product-inquiry-flow';
import { VapiDistributorSupportFlow } from './vapi-distributor-support-flow';
import { VapiBusinessPlanFlow } from './vapi-business-plan-flow';
import { VapiAppointmentBookingFlow } from './vapi-appointment-booking-flow';
import { VapiLeadCollectionFlow } from './vapi-lead-collection-flow';
import { VapiHumanEscalationFlow } from './vapi-human-escalation-flow';
import { VapiMemoryModule } from '../memory/vapi-memory.module';

/**
 * Vapi Flows Module.
 *
 * Provides the {@link VapiConversationFlowManager} and the seven flow
 * implementations. The manager depends on:
 *   - `OPENAI_CLIENT` (provided by the global `SharedAiModule`)
 *   - `VapiSessionMemory` (provided by `VapiMemoryModule`)
 *
 * Each flow is a stateless `@Injectable` — its per-session state
 * lives in the Redis session memory via the manager, not inside the
 * flow class itself. This keeps the flows safe to share across
 * concurrent calls.
 */
@Module({
  imports: [VapiMemoryModule],
  providers: [
    VapiConversationFlowManager,
    VapiCustomerSupportFlow,
    VapiProductInquiryFlow,
    VapiDistributorSupportFlow,
    VapiBusinessPlanFlow,
    VapiAppointmentBookingFlow,
    VapiLeadCollectionFlow,
    VapiHumanEscalationFlow,
  ],
  exports: [
    VapiConversationFlowManager,
    VapiCustomerSupportFlow,
    VapiProductInquiryFlow,
    VapiDistributorSupportFlow,
    VapiBusinessPlanFlow,
    VapiAppointmentBookingFlow,
    VapiLeadCollectionFlow,
    VapiHumanEscalationFlow,
  ],
})
export class VapiFlowsModule {}
