import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Payload for {@link OrdersService.update}. Only the "soft" fields of an order
 * can be changed after creation — totals, items, customer, distributor, and
 * status are all immutable from this endpoint (use the dedicated
 * status / payment / items endpoints for those).
 */
export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  shippingAddress?: any;

  @IsOptional()
  @IsObject()
  billingAddress?: any;
}
