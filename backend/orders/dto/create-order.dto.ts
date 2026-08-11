import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

/**
 * Payload for {@link OrdersService.create}.
 *
 * `items` MUST be non-empty (validated at the service layer too). Each item's
 * `unitPrice` is supplied by the caller (typically the catalog price at
 * checkout time) so the order total reflects what the customer agreed to,
 * not the current product price.
 *
 * `shippingAddress` and `billingAddress` are free-form JSON objects — the
 * admin UI uses a `{ line1, line2, city, state, postalCode, country }`
 * shape but the schema leaves it open for international variations.
 */
export class CreateOrderDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  distributorId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsOptional()
  @IsObject()
  shippingAddress?: any;

  @IsOptional()
  @IsObject()
  billingAddress?: any;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
