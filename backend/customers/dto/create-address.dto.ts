import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Payload for `POST /api/customers/:id/addresses`. Each customer stores
 * its addresses as a JSON array on the `Customer.address` column (the
 * schema has no `CustomerAddress` table). The service assigns a UUID
 * `id` to each address when persisting.
 */
export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  label?: string;

  @IsString()
  @MaxLength(255)
  line1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @IsString()
  @MaxLength(64)
  city: string;

  @IsString()
  @MaxLength(64)
  state: string;

  @IsString()
  @MaxLength(20)
  postalCode: string;

  @IsString()
  @MaxLength(64)
  country: string;

  @IsOptional()
  @IsBoolean()
  isDefaultShipping?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultBilling?: boolean;
}

/**
 * Same shape, every field optional, for `PUT /api/customers/:id/addresses/:addressId`.
 */
export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  country?: string;

  @IsOptional()
  @IsBoolean()
  isDefaultShipping?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultBilling?: boolean;
}
