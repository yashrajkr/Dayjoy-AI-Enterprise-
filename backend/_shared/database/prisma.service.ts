import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wraps the generated PrismaClient so that:
 *  - the connection is opened eagerly on module init (`$connect`)
 *  - the connection is closed cleanly on module destroy (`$disconnect`)
 *  - SIGTERM/SIGINT are translated into `app.close()` so NestJS lifecycle
 *    hooks (and our $disconnect) run before the process exits.
 *
 * Note: Prisma 6 removed the `$on('beforeExit')` event that older versions
 * used for shutdown wiring. The new recommended approach — implemented below —
 * is to listen for OS signals directly and call `app.close()`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma client connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected');
  }

  /**
   * Register OS signal handlers that close the Nest application (and thus
   * trigger this service's `onModuleDestroy`) before exiting. Should be
   * called from `bootstrap()` after the app is created.
   */
  async enableShutdownHooks(app: INestApplication) {
    const shutdown = async (signal: string) => {
      this.logger.log(`Received ${signal} — closing application...`);
      try {
        await app.close();
      } catch (err) {
        this.logger.error(`Error during shutdown: ${(err as Error).message}`);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  }
}
