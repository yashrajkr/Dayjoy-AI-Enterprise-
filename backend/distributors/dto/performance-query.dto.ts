import { IsDateString, IsOptional } from 'class-validator';

/**
 * Query-string DTO for `GET /api/distributors/:id/performance`. Both
 * dates are optional — omitting them yields lifetime performance.
 */
export class PerformanceQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
