import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TemplatesService } from './templates.service';
import { NotificationsController } from './notifications.controller';
import { ProvidersModule } from './providers/providers.module';
import { ProductsModule } from '../products/products.module';

/**
 * Notifications feature module.
 *
 * `PrismaModule` is `@Global()` so it doesn't need to be imported here.
 * `ProvidersModule` wires the five channel-specific providers (Email /
 * Sms / WhatsApp / Push / InApp).
 * `ProductsModule` is imported so `AuthUser` (exported from
 * `ProductsService`) is reachable — but actually `AuthUser` is just a
 * TypeScript interface, so the import is only for runtime DI symmetry.
 */
@Module({
  imports: [ProvidersModule, ProductsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, TemplatesService],
  exports: [NotificationsService, TemplatesService],
})
export class NotificationsModule {}
