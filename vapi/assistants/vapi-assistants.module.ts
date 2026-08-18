import { Module } from '@nestjs/common';
import { PrismaModule } from '../../backend/_shared/database/prisma.module';
import { VapiConfigModule } from '../config/vapi-config.module';
import { VapiToolsModule } from '../tools/vapi-tools.module';
import { VapiAssistantService } from './vapi-assistant.service';
import { VapiAssistantController } from './vapi-assistant.controller';

/**
 * VapiAssistantsModule — wires the assistant service + controller.
 *
 * Imports:
 *   - VapiConfigModule  → provides VapiClientService
 *   - VapiToolsModule   → provides VapiToolRegistry (used to assemble
 *                         the assistant's tool list)
 *   - PrismaModule      → global, imported for explicitness
 *
 * No `forwardRef` on `VapiToolsModule`: it's a clean DAG (Knowledge/
 * Products/Customers/Distributors/Notifications have no back-reference
 * to `vapi/`) — a previous defensive `forwardRef` here was unnecessary
 * and, combined with the same pattern elsewhere, caused 5 of
 * `VapiToolRegistry`'s 8 tools to silently fail to register depending
 * on which import path constructed the registry first.
 */
@Module({
  imports: [
    PrismaModule,
    VapiConfigModule,
    VapiToolsModule,
  ],
  controllers: [VapiAssistantController],
  providers: [VapiAssistantService],
  exports: [VapiAssistantService],
})
export class VapiAssistantsModule {}
