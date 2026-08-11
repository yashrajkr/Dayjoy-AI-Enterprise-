import { IsEnum, IsString } from 'class-validator';

/**
 * Allowed order statuses. Mirrors the `OrderStatus` enum in the Prisma schema
 * (which mirrors the DB enum).
 *
 * State-machine transitions are enforced by a DB trigger
 * (`validate_order_status_transition` in `013_constraints.sql`). The service
 * layer doesn't pre-validate transitions — it just attempts the update and
 * lets the trigger raise a `check_violation` if the transition is invalid,
 * which we translate into a `BadRequestException`.
 */
export enum OrderStatusEnum {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  RETURNED = 'RETURNED',
}

export class UpdateStatusDto {
  @IsEnum(OrderStatusEnum)
  status: OrderStatusEnum;
}
