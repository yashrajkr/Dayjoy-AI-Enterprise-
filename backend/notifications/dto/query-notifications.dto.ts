import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from './send-notification.dto';

/**
 * Query params for the current-user's notification inbox
 * (`GET /api/notifications`).
 */
export class QueryNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  isRead?: string; // 'true' / 'false' — parsed to boolean in the service
}
