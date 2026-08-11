import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Discriminators for the `Metric.type` and `Metric.unit` columns. Mirror
 * the `MetricType` and `MetricUnit` Prisma enums so DTO validation
 * rejects unknown values before they reach Prisma.
 */
export enum MetricType {
  COUNT = 'COUNT',
  SUM = 'SUM',
  AVERAGE = 'AVERAGE',
  PERCENTAGE = 'PERCENTAGE',
  RATIO = 'RATIO',
}

export enum MetricUnit {
  NUMBER = 'NUMBER',
  PERCENT = 'PERCENT',
  CURRENCY = 'CURRENCY',
  DURATION = 'DURATION',
}

export class CreateMetricDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MetricType)
  type: MetricType;

  @IsEnum(MetricUnit)
  unit: MetricUnit;

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  query: string; // SQL or PRQL — executed by the metric refresh job.

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  refreshInterval?: number; // seconds; default 300.

  @IsOptional()
  @IsString()
  status?: string; // active | paused — default 'active'.
}

export class RecordMetricValueDto {
  @Type(() => Number)
  @IsInt()
  value: number;

  @IsOptional()
  @IsObject()
  dimensions?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  timestamp?: string; // ISO-8601; defaults to `new Date()` server-side.
}

export class QueryMetricsDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string;

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
}
