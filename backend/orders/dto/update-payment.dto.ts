import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Payment status values (stored as a plain string column on `orders` —
 * no DB enum, so this enum is enforced at the app layer).
 */
export enum PaymentStatusEnum {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export class UpdatePaymentDto {
  @IsEnum(PaymentStatusEnum)
  paymentStatus: PaymentStatusEnum;

  @IsOptional()
  @IsString()
  paymentId?: string;
}
