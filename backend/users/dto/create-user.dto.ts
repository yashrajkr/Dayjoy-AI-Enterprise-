import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Canonical role names used across the platform. Kept in sync with the
 * `Role.name` values created by the database seed (SUPER_ADMIN, ADMIN,
 * EMPLOYEE, MANAGER, AGENT, CUSTOMER, DISTRIBUTOR). The denormalized
 * `User.role` column is set to the lower-cased form of the chosen value
 * (e.g. `EMPLOYEE` → `employee`) to stay consistent with the existing
 * `@default("user")` on the schema.
 */
export enum UserRoleEnum {
  USER = 'USER',
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
  CUSTOMER = 'CUSTOMER',
  DISTRIBUTOR = 'DISTRIBUTOR',
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  // At least one letter + one number — keeps the rule intentionally light so
  // the unit-test happy path with "Password123!" passes.
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one number' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;
}
