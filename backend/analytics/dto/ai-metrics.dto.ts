import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AiMetricsDto {
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
  channel?: string;
}
