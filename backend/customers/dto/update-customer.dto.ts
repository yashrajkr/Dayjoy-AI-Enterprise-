import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CustomerSourceEnum, CustomerTypeEnum } from './create-customer.dto';

/**
 * Update payload for a customer. Every field is optional — `null` is NOT
 * accepted (use the dedicated delete-customer endpoint to soft-delete).
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerTypeEnum)
  customerType?: CustomerTypeEnum;

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
  @IsString()
  status?: string;
}
