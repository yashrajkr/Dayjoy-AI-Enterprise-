import { IsEnum, IsString } from 'class-validator';

/**
 * Role discriminator for `PATCH /api/admin/users/:id/role`. Updates the
 * denormalized `User.role` column — kept in sync with the `UserRole`
 * join table so RBAC checks can short-circuit without a join.
 *
 * Mirrors the canonical role names used by the `RolesGuard` and
 * `PermissionsGuard`. The `SUPER_ADMIN` role is intentionally absent
 * here — promoting a user to super-admin is a database-level operation
 * (the role is reserved for the platform owner).
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
  DISTRIBUTOR = 'DISTRIBUTOR',
  CUSTOMER = 'CUSTOMER',
  USER = 'user',
}

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

/**
 * Body of `POST /api/admin/users/:id/roles` — assigns a role to a user
 * via the `UserRole` join table. The role must already exist in the
 * tenant's `Role` table.
 */
export class AssignRoleDto {
  @IsString()
  roleId: string;

  @IsString()
  assignedBy?: string; // defaults to `currentUser.userId` server-side.
}
