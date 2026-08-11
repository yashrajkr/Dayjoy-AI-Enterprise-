import { IsEnum, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum OrderSortBy {
  CREATED_AT = 'createdAt',
  TOTAL = 'total',
  STATUS = 'status',
}

export enum OrderSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Query/filter parameters for {@link OrdersService.findAll}.
 *
 * `dateFrom` / `dateTo` apply an inclusive range filter on `createdAt`
 * (ISO 8601 strings are accepted by Prisma's `DateTime` filter).
 */
export class QueryOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  distributorId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(OrderSortBy)
  sortBy?: OrderSortBy = OrderSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(OrderSortOrder)
  sortOrder?: OrderSortOrder = OrderSortOrder.DESC;
}
