import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination request for message history inside a conversation.
 *
 * `order=asc` returns oldest-first (chat-window layout),
 * `order=desc` returns newest-first (recent-activity layout).
 */
export class QueryHistoryDto {
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
  order?: 'asc' | 'desc' = 'asc';
}
