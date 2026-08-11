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
 * Roles that count as "employee" for the purposes of the
 * `/api/employees/*` endpoints. The denormalized `User.role` column
 * holds the lower-cased form (`employee`, `manager`, `agent`).
 */
export enum EmployeeRoleEnum {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
}

/**
 * Lifecycle states for an Employee profile. Stored on the
 * `Employee.status` column (a plain `String`).
 */
export enum EmployeeStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ON_LEAVE = 'on_leave',
  TERMINATED = 'terminated',
}

export class CreateEmployeeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one number' })
  password: string;

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
  @IsEnum(EmployeeRoleEnum)
  role?: EmployeeRoleEnum;

  // -----------------------------------------------------------------
  // Employee-profile fields (stored on the `Employee` row, NOT the
  // `User` row).
  // -----------------------------------------------------------------

  @IsOptional()
  @IsString()
  @MaxLength(32)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  designation?: string;

  @IsOptional()
  @IsString()
  reportsTo?: string;
}

export class UpdateEmployeeDto {
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
  @IsString()
  @MaxLength(64)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  designation?: string;

  @IsOptional()
  @IsString()
  reportsTo?: string;
}

export class UpdateEmployeeStatusDto {
  @IsEnum(EmployeeStatusEnum)
  status: EmployeeStatusEnum;
}

export class AssignRoleDto {
  @IsEnum(EmployeeRoleEnum)
  role: EmployeeRoleEnum;
}

export class QueryEmployeesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(EmployeeStatusEnum)
  status?: EmployeeStatusEnum;
}
