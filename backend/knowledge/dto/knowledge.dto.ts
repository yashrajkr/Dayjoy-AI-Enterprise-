import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Discriminator for the kind of source being ingested. Persisted on
 * `RagSource.type` so downstream consumers (the analytics service, the
 * admin UI) can bucket knowledge base contributions by origin.
 */
export enum RagSourceType {
  DOCUMENT = 'document',
  WEBSITE = 'website',
  API = 'api',
  MANUAL = 'manual',
}

export class CreateRagSourceDto {
  @IsString()
  name: string;

  @IsEnum(RagSourceType)
  type: RagSourceType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  configuration?: string; // JSON-encoded; service coerces to object.
}

export class UpdateRagSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  configuration?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class IngestDocumentDto {
  @IsString()
  sourceId: string;

  @IsString()
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class QueryKnowledgeDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string; // Optional — falls back to `user.tenantId`.

  @IsOptional()
  @IsInt()
  @Min(1)
  topK?: number;
}

export class QuerySourcesDto {
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

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class QueryDocumentsDto {
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

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
