import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../backend/_shared/database/prisma.module';
import { SharedAiModule } from '../../backend/_shared/ai/ai.module';
import { KnowledgeModule } from '../../backend/knowledge/knowledge.module';
import { ProductsModule } from '../../backend/products/products.module';
import { CustomersModule } from '../../backend/customers/customers.module';
import { DistributorsModule } from '../../backend/distributors/distributors.module';
import { NotificationsModule } from '../../backend/notifications/notifications.module';

import { VapiToolRegistry } from './vapi-tool-registry.service';
import { VapiSearchKnowledgeTool } from './vapi-search-knowledge-tool';
import { VapiSearchProductsTool } from './vapi-search-products-tool';
import { VapiCustomerLookupTool } from './vapi-customer-lookup-tool';
import { VapiDistributorLookupTool } from './vapi-distributor-lookup-tool';
import { VapiLeadCaptureTool } from './vapi-lead-capture-tool';
import { VapiAppointmentBookingTool } from './vapi-appointment-booking-tool';
import { VapiSupportTicketTool } from './vapi-support-ticket-tool';
import { VapiHumanTransferTool } from './vapi-human-transfer-tool';
import { VAPI_TOOL_REGISTRY } from '../webhooks/vapi-function-call-handler';

/**
 * VapiToolsModule — provides all 8 Vapi tools + the central
 * `VapiToolRegistry`.
 *
 * Imported backend modules (each provides the service the corresponding
 * tool injects):
 *   - KnowledgeModule       → KnowledgeService (search_knowledge)
 *   - ProductsModule        → ProductsService   (search_products)
 *   - CustomersModule       → CustomersService  (customer_lookup)
 *   - DistributorsModule    → DistributorsService (distributor_lookup)
 *   - NotificationsModule   → NotificationsService (human_transfer)
 *
 * `PrismaModule` + `SharedAiModule` are `@Global()` so they don't need
 * to be imported here, but we import them anyway for explicitness (and
 * to make the dependency graph obvious when reading this file).
 *
 * `forwardRef` is used on the imports because the backend modules
 * transitively import SharedAiModule (global) and PrismaModule (global)
 * — circular import warnings would otherwise fire at bootstrap.
 */
@Module({
  imports: [
    PrismaModule,
    SharedAiModule,
    forwardRef(() => KnowledgeModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => DistributorsModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [
    VapiToolRegistry,
    VapiSearchKnowledgeTool,
    VapiSearchProductsTool,
    VapiCustomerLookupTool,
    VapiDistributorLookupTool,
    VapiLeadCaptureTool,
    VapiAppointmentBookingTool,
    VapiSupportTicketTool,
    VapiHumanTransferTool,
    // Bind the VAPI_TOOL_REGISTRY token that VapiFunctionCallHandler
    // (vapi/webhooks/vapi-function-call-handler.ts) depends on via
    // @Optional() @Inject(VAPI_TOOL_REGISTRY). This binding previously
    // did not exist anywhere in the module graph — the handler's
    // @Optional() decorator meant DI silently resolved it to
    // `undefined` instead of throwing, so every tool call in
    // production failed closed with TOOL_REGISTRY_UNAVAILABLE without
    // any startup error to signal the misconfiguration.
    { provide: VAPI_TOOL_REGISTRY, useExisting: VapiToolRegistry },
  ],
  exports: [
    VapiToolRegistry,
    VapiSearchKnowledgeTool,
    VapiSearchProductsTool,
    VapiCustomerLookupTool,
    VapiDistributorLookupTool,
    VapiLeadCaptureTool,
    VapiAppointmentBookingTool,
    VapiSupportTicketTool,
    VapiHumanTransferTool,
    VAPI_TOOL_REGISTRY,
  ],
})
export class VapiToolsModule {}
