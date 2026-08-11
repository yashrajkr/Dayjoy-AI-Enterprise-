import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Login payload.
 *
 * `tenantId` is optional — when supplied, the user must belong to that
 * tenant (additional defence-in-depth for multi-tenant deployments where
 * the same email could theoretically exist in two tenants).
 */
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
