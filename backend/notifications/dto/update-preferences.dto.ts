import { IsBoolean, IsEnum, IsObject, IsOptional } from 'class-validator';
import { NotificationType } from './send-notification.dto';

/**
 * Payload for `PUT /api/notifications/preferences`.
 *
 * Upserts a single channel preference for the current user. `categories`
 * is a free-form JSON object of `{categoryName: boolean}` toggles, e.g.
 * `{"order_updates": true, "promotions": false}`.
 */
export class UpdatePreferencesDto {
  @IsEnum(NotificationType)
  channel: NotificationType;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  categories?: Record<string, boolean>;

  @IsOptional()
  quietHoursStart?: string;

  @IsOptional()
  quietHoursEnd?: string;
}
