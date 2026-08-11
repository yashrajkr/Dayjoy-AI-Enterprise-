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
import { EmployeesService } from './employees.service';
import {
  AssignRoleDto,
  CreateEmployeeDto,
  QueryEmployeesDto,
  UpdateEmployeeDto,
  UpdateEmployeeStatusDto,
} from './dto/employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

/**
 * Employees are users with role IN (EMPLOYEE, MANAGER, AGENT).
 *
 * Permission scope reuses the `users:*` permission family — employees are
 * users, so managing them is governed by the same RBAC rules. A separate
 * `employees:*` permission family could be added later if business needs
 * diverge.
 */
@Controller('api/employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('users:read')
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryEmployeesDto,
  ) {
    return this.employeesService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeesService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('users:create')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('users:update')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermissions('users:update')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ) {
    return this.employeesService.updateStatus(id, dto, user);
  }

  @Post(':id/roles')
  @RequirePermissions('users:update')
  async assignRole(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.employeesService.assignRole(id, dto, user);
  }

  @Delete(':id/roles/:role')
  @RequirePermissions('users:update')
  async removeRole(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('role') role: string,
  ) {
    return this.employeesService.removeRole(id, role, user);
  }
}
