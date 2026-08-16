import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HealthCheckError,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';
import { InjectRedis } from '../security/redis.decorators';
import type Redis from 'ioredis';

/**
 * Health endpoints used by Kubernetes probes, load balancers and external monitors.
 *
 * - `GET /health/live`  — Liveness probe: returns 200 as long as the Node process is
 *   event-loop-healthy and can answer requests. No external dependencies are checked.
 * - `GET /health/ready` — Readiness probe: returns 200 only when every downstream
 *   dependency (PostgreSQL, Redis) can be reached. Traffic should be withheld until
 *   this passes.
 * - `GET /health`       — Alias for `/health/ready` for backwards compatibility.
 *
 * All responses are emitted in the Terminus v0.x shape:
 * `{ status, info, error, details }`.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * @nestjs/terminus has no built-in Redis indicator, so this pings the
   * injected ioredis client directly in the same
   * `{ [key]: { status, ... } }` shape Terminus indicators return.
   */
  private async pingRedis(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return { [key]: { status: 'up' } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HealthCheckError('Redis check failed', {
        [key]: { status: 'down', message },
      });
    }
  }

  @Get('live')
  @HealthCheck()
  liveness() {
    return this.health.check([
      async () => ({
        app: {
          status: 'up' as const,
          timestamp: Date.now(),
          uptime: process.uptime(),
        },
      }),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      async () => this.prismaIndicator.pingCheck('database', this.prisma),
      async () => this.pingRedis('redis'),
    ]);
  }

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.readiness();
  }
}
