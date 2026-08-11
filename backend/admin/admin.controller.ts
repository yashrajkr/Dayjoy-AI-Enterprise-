import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../_shared/security/permissions.guard';
import { Roles } from '../_shared/common/decorators/roles.decorator';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto, AssignRoleDto } from './dto/update-user-role.dto';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { CreateTenantConfigDto } from './dto/create-tenant-config.dto';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { QueryAuditLogsDto, QueryAccessLogsDto } from './dto/query-logs.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { AuthUser } from '../ai/auth-user';

/**
 * Admin controller.
 *
 * Two auth models:
 *
 *  1. **Tenant admin** — sees only their own tenant's data. Guarded by
 *     `@RequirePermissions('admin:read' | 'admin:update' | ...)`. The
 *     `PermissionsGuard` (registered per-controller) enforces this.
 *
 *  2. **Super admin** — sees all tenants. Guarded by `@Roles('SUPER_ADMIN')`
 *     on the `/tenants/**` routes. The `RolesGuard` (registered globally
 *     as `APP_GUARD`) enforces this.
 *
 * Note: `RolesGuard` checks `user.role` against the role name strings
 * passed to `@Roles()`. The denormalized `User.role` column is the
 * source of truth for this check; it is kept in sync with the
 * `UserRole` join table by `AdminService.updateUserRole()`.
 */
@Controller('api/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ===================================================================
  // Users — `/api/admin/users`
  // ===================================================================

  @Get('users')
  @RequirePermissions('admin:read')
  async findAllUsers(@CurrentUser() user: AuthUser, @Query() query: QueryUsersDto) {
    return this.adminService.findAllUsers(query, user);
  }

  @Get('users/:id')
  @RequirePermissions('admin:read')
  async findOneUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminService.findOneUser(id, user);
  }

  @Patch('users/:id/role')
  @RequirePermissions('admin:update')
  async updateUserRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(id, dto, user);
  }

  @Post('users/:id/roles')
  @RequirePermissions('admin:update')
  async assignRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.adminService.assignRole(id, dto, user);
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('admin:update')
  async removeRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ) {
    return this.adminService.removeRole(id, roleId, user);
  }

  // ===================================================================
  // Tenants — `/api/admin/tenants` (super-admin only)
  // ===================================================================

  @Get('tenants')
  @Roles('SUPER_ADMIN')
  async findAllTenants() {
    return this.adminService.findAllTenants();
  }

  @Get('tenants/:id')
  @Roles('SUPER_ADMIN')
  async findOneTenant(@Param('id') id: string) {
    return this.adminService.findOneTenant(id);
  }

  @Post('tenants')
  @Roles('SUPER_ADMIN')
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.adminService.createTenant(dto);
  }

  @Put('tenants/:id')
  @Roles('SUPER_ADMIN')
  async updateTenant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.adminService.updateTenant(id, dto, user);
  }

  // ===================================================================
  // Tenant config — `/api/admin/config`
  // ===================================================================

  @Get('config')
  @RequirePermissions('admin:read')
  async getTenantConfig(@CurrentUser() user: AuthUser) {
    return this.adminService.getTenantConfig(user.tenantId!);
  }

  @Put('config/:key')
  @RequirePermissions('admin:update')
  async updateTenantConfig(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateTenantConfigDto,
  ) {
    return this.adminService.updateTenantConfig(user.tenantId!, key, dto, user);
  }

  @Delete('config/:key')
  @RequirePermissions('admin:update')
  async deleteTenantConfig(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.adminService.deleteTenantConfig(user.tenantId!, key, user);
  }

  // ===================================================================
  // System stats — `/api/admin/stats`
  // ===================================================================

  @Get('stats')
  @RequirePermissions('admin:read')
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }

  // ===================================================================
  // Audit + access logs — `/api/admin/audit-logs` | `/api/admin/access-logs`
  // ===================================================================

  @Get('audit-logs')
  @RequirePermissions('admin:view_audit_logs')
  async getAuditLogs(@CurrentUser() user: AuthUser, @Query() query: QueryAuditLogsDto) {
    return this.adminService.getAuditLogs(query, user);
  }

  @Get('access-logs')
  @RequirePermissions('admin:view_audit_logs')
  async getAccessLogs(@CurrentUser() user: AuthUser, @Query() query: QueryAccessLogsDto) {
    return this.adminService.getAccessLogs(query, user);
  }

  // ===================================================================
  // Integrations — `/api/admin/integrations`
  // ===================================================================

  @Get('integrations')
  @RequirePermissions('admin:manage_integrations')
  async getIntegrations(@CurrentUser() user: AuthUser) {
    return this.adminService.getIntegrations(user);
  }

  @Put('integrations/:id')
  @RequirePermissions('admin:manage_integrations')
  async updateIntegration(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.adminService.updateIntegration(id, dto, user);
  }
}
