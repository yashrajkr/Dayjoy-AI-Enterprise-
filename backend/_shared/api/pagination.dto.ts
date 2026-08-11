import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Standard query-string DTO for every paginated list endpoint.
 *
 * Endpoints that return a list accept this DTO either directly
 * (`@Query() query: PaginationDto`) or by extending it with their own
 * filters. The {@link TransformInterceptor} + global `ValidationPipe`
 * (with `transform: true`) ensure `page` / `limit` arrive as integers.
 *
 * Sensible defaults (`page=1`, `limit=20`, `sortOrder='desc'`) mean a
 * bare `GET /api/customers` returns the first 20 rows ordered by
 * `createdAt DESC`.
 *
 * The `limit` is capped at 100 to protect the database from unbounded
 * result sets — clients that need bulk export should use a dedicated
 * export endpoint with cursor-based pagination.
 */
export class PaginationDto {
  /** 1-based page number. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Page size. Capped at 100 to prevent unbounded queries. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Free-text search term (matched against the resource's default search fields). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  search?: string;

  /** Field name to sort by. Services should validate this against a whitelist. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sortBy?: string;

  /** Sort direction. Defaults to `desc` (newest first). */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
