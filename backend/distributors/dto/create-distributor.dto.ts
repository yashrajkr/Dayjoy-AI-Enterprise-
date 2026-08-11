import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DistributorTierEnum {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

/**
 * Inline address payload supplied at distributor-creation time. Stored as
 * a JSON object on `Distributor.address` (the schema has no separate
 * `DistributorAddress` table).
 */
export class DistributorAddressDto {
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
}

export class CreateDistributorDto {
  @IsString()
  @MaxLength(64)
  distributorCode: string;

  @IsString()
  @MaxLength(128)
  companyName: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPerson?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsEnum(DistributorTierEnum)
  tier?: DistributorTierEnum;

  @IsOptional()
  @Type(() => DistributorAddressDto)
  address?: DistributorAddressDto;
}
