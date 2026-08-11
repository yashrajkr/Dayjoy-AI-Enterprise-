import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Period granularity for time-series metric breakdowns.
 *  - `day`   → 1 row per calendar day.
 *  - `week`  → 1 row per ISO week.
 *  - `month` → 1 row per calendar month.
 *
 * The service translates this into a Postgres `date_trunc()` argument
 * when grouping by period.
 */
export enum PeriodGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class SalesMetricsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;

  @IsOptional()
  @IsEnum(PeriodGranularity)
  period?: PeriodGranularity = PeriodGranularity.DAY;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  distributorId?: string;
}

export class CustomerMetricsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;

  @IsOptional()
  @IsEnum(PeriodGranularity)
  period?: PeriodGranularity = PeriodGranularity.MONTH;
}

export class ProductMetricsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 30;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
