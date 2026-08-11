import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Reasons for an inventory adjustment. Mirrors the `InventoryTxnReason` enum
 * in the Prisma schema (PURCHASE / SALE / RETURN / ADJUSTMENT / TRANSFER /
 * RESERVATION / RELEASE).
 */
export enum InventoryAdjustmentReason {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  RESERVATION = 'RESERVATION',
  RELEASE = 'RELEASE',
}

/**
 * Payload for the `PATCH /api/products/:id/inventory` endpoint.
 *
 * `quantity` is the **new absolute** stock level (not a delta). The service
 * computes the delta against the current inventory row and writes an
 * `InventoryTransaction` row recording the change with the supplied `reason`.
 */
export class UpdateInventoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;

  @IsEnum(InventoryAdjustmentReason)
  reason: InventoryAdjustmentReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
