import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  RedisHealthIndicator,
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
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

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
      async () => this.redisIndicator.pingCheck('redis', this.redis),
    ]);
  }

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.readiness();
  }
}
