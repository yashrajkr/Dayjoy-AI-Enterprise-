import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /api/ai/tools/:toolName/execute`.
 *
 * Tool arguments are passed through as a free-form object — each tool's
 * handler is responsible for validating its own input shape (the
 * `BadRequestException` it throws is mapped to HTTP 400 by the global
 * exception filter).
 */
export class ExecuteToolDto {
  @IsOptional()
  @IsObject()
  args?: Record<string, any>;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
