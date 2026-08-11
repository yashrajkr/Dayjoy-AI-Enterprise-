import { Module, forwardRef } from '@nestjs/common';
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
 * `forwardRef(VapiToolsModule)` because VapiToolsModule transitively
 * imports KnowledgeModule which transitively imports SharedAiModule —
 * a clean DAG, but we use forwardRef defensively to avoid any
 * import-ordering surprises during NestJS bootstrap.
 */
@Module({
  imports: [
    PrismaModule,
    VapiConfigModule,
    forwardRef(() => VapiToolsModule),
  ],
  controllers: [VapiAssistantController],
  providers: [VapiAssistantService],
  exports: [VapiAssistantService],
})
export class VapiAssistantsModule {}
