import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Voice-call metrics query. Filters by `agentId` when supplied (the
 * voice channel routes inbound calls to a specific `AiAgent` of type
 * `VOICE`); otherwise aggregates across all voice agents.
 */
export class VoiceMetricsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  outcome?: string; // COMPLETED, FAILED, TRANSFERRED, etc.
}

/**
 * WhatsApp messaging metrics query. Filters by `contactId` (a specific
 * customer / lead WhatsApp thread) when supplied; otherwise aggregates
 * across all WhatsApp sessions.
 */
export class WhatsAppMetricsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  direction?: string; // inbound, outbound
}
