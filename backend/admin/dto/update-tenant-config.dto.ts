import { IsOptional, IsString } from 'class-validator';

/**
 * Body of `PUT /api/admin/config/:key` — update a single tenant-config
 * value. The `key` is taken from the URL param, so the body only
 * carries the value (+ optional description override).
 */
export class UpdateTenantConfigDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
