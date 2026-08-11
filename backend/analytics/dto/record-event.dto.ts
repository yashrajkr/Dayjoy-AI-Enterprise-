import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Body of `POST /api/analytics/events`.
 *
 * Records a single analytics event for the current tenant + user.
 * `eventData` is a free-form JSON blob (the event's payload); the
 * caller is responsible for keeping the schema stable for downstream
 * consumers.
 */
export class RecordEventDto {
  @IsString()
  eventType: string;

  @IsObject()
  eventData: Record<string, any>;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  timestamp?: string; // ISO-8601; defaults to `new Date()` server-side.
}
