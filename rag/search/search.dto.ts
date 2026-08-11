import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Channel the search request originated from. Drives the system-prompt
 * template selection (voice → concise spoken, whatsapp → short casual,
 * web → detailed markdown, api → default).
 */
export enum SearchChannel {
  VOICE = 'VOICE',
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
  API = 'API',
}

/**
 * Body for `POST /api/rag/search` and `POST /api/rag/search/stream`.
 *
 * Either `tenantId` (server-to-server) or an authenticated user
 * (customer-portal) must be present — the service falls back to
 * `user.tenantId` when `tenantId` is omitted.
 */
export class SearchQueryDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(SearchChannel)
  channel?: SearchChannel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxChunks?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxHistoryTurns?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxMemories?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4000)
  maxTokens?: number;

  @IsOptional()
  @IsEnum(['markdown', 'plain', 'structured'])
  responseFormat?: 'markdown' | 'plain' | 'structured';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  /** Skip the cache (force a fresh retrieval + LLM call). */
  @IsOptional()
  @IsBoolean()
  skipCache?: boolean;
}

/**
 * Body for `POST /api/rag/search/:queryId/feedback`.
 *
 * `rating: 'positive'` → thumbs up. `rating: 'negative'` → thumbs down.
 * `rating: 'neutral'` → clears previous feedback.
 */
export class SearchFeedbackDto {
  @IsEnum(['positive', 'negative', 'neutral'])
  rating: 'positive' | 'negative' | 'neutral';

  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * Query string for `GET /api/rag/search/history`.
 */
export class QuerySearchHistoryDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
