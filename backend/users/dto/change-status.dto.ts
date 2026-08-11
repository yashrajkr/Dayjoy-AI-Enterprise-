import { IsEnum } from 'class-validator';

/**
 * Lifecycle states for a User account, mirroring the `UserStatus` Prisma
 * enum on the `User` model. `DELETED` is intentionally excluded here —
 * deletion is a one-way operation handled by `DELETE /api/users/:id`
 * (soft-delete + audit log), not a status mutation.
 */
export enum ChangeUserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class ChangeStatusDto {
  @IsEnum(ChangeUserStatus)
  status!: ChangeUserStatus;
}
