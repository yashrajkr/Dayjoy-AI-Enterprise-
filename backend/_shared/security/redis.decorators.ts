import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.module';

/**
 * Parameter decorator that injects the shared ioredis client.
 *
 * @example
 *   constructor(@InjectRedis() private readonly redis: Redis) {}
 */
export const InjectRedis = (): ParameterDecorator => Inject(REDIS_CLIENT);
