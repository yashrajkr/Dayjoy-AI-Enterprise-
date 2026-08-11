import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Memory type discriminator. Persisted on `AiMemory.type`. Mirrors the
 * `MemoryType` Prisma enum so DTO validation rejects unknown values.
 */
export enum MemoryType {
  FACT = 'FACT',
  PREFERENCE = 'PREFERENCE',
  HISTORY = 'HISTORY',
  CONTEXT = 'CONTEXT',
}

export class CreateMemoryDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsEnum(MemoryType)
  type: MemoryType;

  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  importance?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string; // ISO-8601; service coerces to Date.
}

export class UpdateMemoryDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  importance?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class QueryMemoryDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

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
}
