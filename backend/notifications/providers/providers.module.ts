import { Module } from '@nestjs/common';
import { EmailProvider } from './email.provider';
import { SmsProvider } from './sms.provider';
import { WhatsAppProvider } from './whatsapp.provider';
import { PushProvider } from './push.provider';
import { InAppProvider } from './in-app.provider';
import {
  NOTIFICATION_PROVIDER_EMAIL,
  NOTIFICATION_PROVIDER_SMS,
  NOTIFICATION_PROVIDER_WHATSAPP,
  NOTIFICATION_PROVIDER_PUSH,
  NOTIFICATION_PROVIDER_IN_APP,
} from './tokens';

/**
 * Wires all five notification providers into the DI container.
 *
 * Each provider is bound under a channel-specific injection token
 * (`NOTIFICATION_PROVIDER_EMAIL`, `NOTIFICATION_PROVIDER_SMS`, etc) so the
 * {@link NotificationsService} can resolve the right provider for a given
 * notification type at runtime.
 *
 * The real providers (Email / Sms / WhatsApp / Push) are `@Injectable`
 * because they inject `ConfigService` for their credentials. The InApp
 * provider is `@Injectable` because it injects `PrismaService`.
 */
@Module({
  providers: [
    { provide: NOTIFICATION_PROVIDER_EMAIL, useClass: EmailProvider },
    { provide: NOTIFICATION_PROVIDER_SMS, useClass: SmsProvider },
    { provide: NOTIFICATION_PROVIDER_WHATSAPP, useClass: WhatsAppProvider },
    { provide: NOTIFICATION_PROVIDER_PUSH, useClass: PushProvider },
    { provide: NOTIFICATION_PROVIDER_IN_APP, useClass: InAppProvider },
    InAppProvider,
  ],
  exports: [
    NOTIFICATION_PROVIDER_EMAIL,
    NOTIFICATION_PROVIDER_SMS,
    NOTIFICATION_PROVIDER_WHATSAPP,
    NOTIFICATION_PROVIDER_PUSH,
    NOTIFICATION_PROVIDER_IN_APP,
    InAppProvider,
  ],
})
export class ProvidersModule {}
