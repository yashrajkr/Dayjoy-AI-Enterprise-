import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for `POST /api/orders/:id/cancel`. `reason` is stored on the
 * order's `metadata` and included in the customer-facing cancellation
 * notification.
 */
export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
