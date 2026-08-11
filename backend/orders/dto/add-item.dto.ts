import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Payload for `POST /api/orders/:id/items` — adds a single line item to an
 * existing PENDING order. The service recalculates totals after the insert.
 */
export class AddItemDto {
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
