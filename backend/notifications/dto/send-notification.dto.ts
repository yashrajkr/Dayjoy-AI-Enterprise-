import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Notification delivery channel / type. Mirrors the `NotificationType`
 * enum in the Prisma schema (EMAIL / SMS / WHATSAPP / PUSH / IN_APP).
 */
export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  PUSH = 'PUSH',
  IN_APP = 'IN_APP',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/**
 * Payload for {@link NotificationsService.send}.
 *
 * `recipient` is overloaded by `type`:
 *  - EMAIL    → recipient is the email address
 *  - SMS      → recipient is the E.164 phone number
 *  - WHATSAPP → recipient is the WhatsApp number
 *  - PUSH     → recipient is the device push token
 *  - IN_APP   → recipient is the user id (notification persisted for polling)
 *
 * `scheduledAt` (ISO 8601) lets the caller defer delivery. When set, the
 * notification is persisted in PENDING state and a separate worker picks it
 * up at the scheduled time. (For now the send path fires immediately — the
 * field is accepted for forward compatibility.)
 */
export class SendNotificationDto {
  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  distributorId?: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
