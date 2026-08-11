import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../_shared/database/prisma.service';
import { SendNotificationDto } from '../dto/send-notification.dto';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './notification.provider.interface';

/**
 * In-app notification provider — REAL implementation.
 *
 * In-app notifications are simply persisted to the `notifications` table
 * for the user to read on next poll / websocket push. The
 * {@link NotificationsService} already persists the notification row before
 * dispatching — so this provider's job is just to ensure the row is
 * addressable to a user (i.e. `userId` must be set, since the inbox query
 * is `WHERE userId = ?`).
 *
 * If `userId` is missing, the provider reports a failure so the service
 * marks the notification FAILED rather than silently dropping it.
 */
@Injectable()
export class InAppProvider implements NotificationProvider {
  private readonly logger = new Logger(InAppProvider.name);
  readonly name = 'in-app';
  readonly channel = 'IN_APP';

  constructor(private readonly prisma: PrismaService) {}

  async dispatch(dto: SendNotificationDto): Promise<ProviderDispatchResult> {
    if (!dto.userId) {
      return {
        success: false,
        errorMessage: 'IN_APP notifications require a userId',
      };
    }

    // The NotificationsService has already created the notifications row.
    // We just record an additional notification_logs entry marking it as
    // "delivered" to the in-app inbox. Real-time push to the client (if any)
    // would be triggered here via a websocket gateway.
    try {
      await this.prisma.notificationLog.create({
        data: {
          tenantId: dto.tenantId,
          notificationId: (dto as any).notificationId ?? 'unknown',
          channel: 'IN_APP' as any,
          event: 'DELIVERED',
          status: 'success',
          provider: this.name,
        },
      });
    } catch (err) {
      this.logger.warn(
        `InAppProvider: failed to write delivery log: ${(err as Error).message}`,
      );
    }

    return {
      success: true,
      providerMessageId: `in-app-${dto.userId}-${Date.now()}`,
      response: { deliveredTo: dto.userId },
    };
  }
}
