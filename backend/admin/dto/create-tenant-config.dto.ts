import { IsString, IsOptional } from 'class-validator';

export class CreateTenantConfigDto {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  description?: string;
}
