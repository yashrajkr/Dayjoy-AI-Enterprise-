import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaModule } from '../database/prisma.module';
import { RedisModule } from '../security/redis.module';

/**
 * Wires the health controller together with its dependencies (Prisma + Redis).
 *
 * `TerminusModule` provides the `HealthCheckService`, `PrismaHealthIndicator`
 * and `RedisHealthIndicator` used by the controller.
 */
@Module({
  imports: [TerminusModule, PrismaModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
