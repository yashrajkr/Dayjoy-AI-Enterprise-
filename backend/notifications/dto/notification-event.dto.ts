import { IsOptional, IsString, IsObject } from 'class-validator';

/**
 * Business event payload for {@link NotificationsService.handleEvent}.
 *
 * `event` is a free-form string name (e.g. `'lead.created'`,
 * `'order.shipped'`, `'ticket.resolved'`) — the service maintains a
 * template map that decides which (type, subject, priority) to use.
 *
 * `payload` carries the business context (tenantId, userId, entityId,
 * etc.) and is serialised into the notification body.
 */
export class NotificationEventDto {
  @IsString()
  event: string;

  @IsObject()
  payload: {
    tenantId: string;
    userId?: string;
    customerId?: string;
    distributorId?: string;
    [key: string]: any;
  };
}

/**
 * Legacy event-type enum kept for backward compatibility with callers
 * that still pass `NotificationEventType.*` strings.
 */
export enum NotificationEventType {
  PASSWORD_RESET = 'PASSWORD_RESET',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  AI_CONVERSATION_EVENT = 'AI_CONVERSATION_EVENT',
}

/**
 * Legacy channel enum kept for backward compatibility.
 */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  APP = 'APP',
}
