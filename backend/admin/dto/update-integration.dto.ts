import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of `PUT /api/admin/integrations/:id` — update an integration's
 * config / credentials / status. The `type` field is intentionally
 * read-only (changing a Vapi integration into a Twilio integration
 * would orphan stored credentials).
 */
export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;

  @IsOptional()
  @IsString()
  status?: string; // active | inactive | error
}
