import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paginated audit-log query. Filters by `userId`, `action`
 * (INSERT/UPDATE/DELETE), `resourceType`, and a date window.
 */
export class QueryAuditLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  action?: string; // INSERT | UPDATE | DELETE

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  since?: string; // ISO-8601

  @IsOptional()
  @IsString()
  until?: string; // ISO-8601
}

/**
 * Paginated access-log query. Filters by `userId`, `result`
 * (success/denied/error), and a date window.
 */
export class QueryAccessLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  result?: string; // success | denied | error

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  since?: string;

  @IsOptional()
  @IsString()
  until?: string;
}
