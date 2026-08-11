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
  ],
})
export class VapiToolsModule {}
