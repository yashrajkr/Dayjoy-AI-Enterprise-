import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DistributorTierEnum } from './create-distributor.dto';

export class UpdateDistributorDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPerson?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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
  @IsString()
  status?: string;
}
