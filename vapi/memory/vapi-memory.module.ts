import { Module } from '@nestjs/common';
import { VapiSessionMemory } from './vapi-session-memory';
import { VapiCustomerProfile } from './vapi-customer-profile';
import { VapiMemoryService } from './vapi-memory-service';

/**
 * Vapi Memory Module.
 *
 * Provides the three memory-tier services used across the Vapi
 * subsystem:
 *   - {@link VapiSessionMemory}     — Redis-backed in-flight call state
 *   - {@link VapiCustomerProfile}   — DB + Redis-cached customer context
 *   - {@link VapiMemoryService}     — orchestrator + long-term `AiMemory` access
 *
 * Depends on:
 *   - `PrismaModule` (global) — for PrismaService
 *   - `RedisModule`   (global) — for the ioredis client
 *
 * Both are `@Global()` so they don't need to be re-imported here.
 */
@Module({
  providers: [VapiSessionMemory, VapiCustomerProfile, VapiMemoryService],
  exports: [VapiSessionMemory, VapiCustomerProfile, VapiMemoryService],
})
export class VapiMemoryModule {}
