import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CustomerTypeEnum {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
}

export enum CustomerSourceEnum {
  WEB = 'WEB',
  WHATSAPP = 'WHATSAPP',
  VOICE = 'VOICE',
  REFERRAL = 'REFERRAL',
  SOCIAL = 'SOCIAL',
  WALK_IN = 'WALK_IN',
  OTHER = 'OTHER',
}

/**
 * Inline address payload supplied at customer-creation time. Stored as a
 * JSON array on `Customer.address` (the schema has no `CustomerAddress`
 * table — addresses are an array of plain objects).
 */
export class CreateCustomerAddressDto {
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
  isDefaultShipping?: boolean;

  @IsOptional()
  isDefaultBilling?: boolean;
}

export class CreateCustomerDto {
  @IsEnum(CustomerTypeEnum)
  customerType: CustomerTypeEnum;

  /**
   * Required when `customerType === BUSINESS`. Validated at the service
   * layer (not via class-validator) so the error is a `BadRequestException`
   * rather than a 422 validation payload — matches the API error-handling
   * conventions used across the rest of the backend.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEnum(CustomerSourceEnum)
  source?: CustomerSourceEnum;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerAddressDto)
  address?: CreateCustomerAddressDto;
}
