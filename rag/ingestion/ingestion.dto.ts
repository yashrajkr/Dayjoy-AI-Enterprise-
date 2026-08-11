import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Discriminator for the kind of source being ingested. Persisted on
 * `RagSource.type` so downstream consumers (the analytics service, the
 * admin UI) can bucket knowledge-base contributions by origin.
 */
export enum RagSourceType {
  DOCUMENT = 'document',
  WEBSITE = 'website',
  API = 'api',
  MANUAL = 'manual',
}

/**
 * Body for `POST /api/rag/ingest` — ingest a single document.
 *
 * Two modes:
 *  - **Inline text** (`content` provided, no `fileBuffer`): the
 *    ingestion service treats the supplied string as the raw text and
 *    skips the loader phase.
 *  - **File upload** (`fileBuffer` provided, multipart endpoint): the
 *    service picks a loader by `mimeType` and runs the full pipeline
 *    (load → chunk → embed → store).
 */
export class IngestDocumentDto {
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsEnum(RagSourceType)
  sourceType: RagSourceType = RagSourceType.DOCUMENT;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * Populated by the multipart upload endpoint — never serialized from
   * JSON. The DTO carries it so the service signature is uniform.
   */
  fileBuffer?: Buffer;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  chunkSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  chunkOverlap?: number;
}

/**
 * Body for `POST /api/rag/ingest/batch` — ingest multiple documents in
 * a single request. The service processes up to 5 documents in
 * parallel (configurable).
 */
export class IngestBatchDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IngestDocumentDto)
  documents: IngestDocumentDto[];
}

/**
 * Result returned by the ingestion service.
 */
export interface IngestionResult {
  documentId: string;
  chunkCount: number;
  status: 'READY' | 'PROCESSING' | 'FAILED' | 'DELETED';
  error?: string;
}

/**
 * Batch result — per-document outcomes plus an aggregate summary.
 */
export interface BatchIngestionResult {
  results: IngestionResult[];
  totalDocuments: number;
  succeeded: number;
  failed: number;
  totalChunks: number;
}
