import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

/**
 * Employees module — exposes `/api/employees/*` for managing users that
 * carry an employee-role (`EMPLOYEE` / `MANAGER` / `AGENT`) and their
 * supplementary `Employee` profile rows (department, designation,
 * reports-to, status).
 *
 * Note: this module is intentionally NOT re-exporting `UsersService`.
 * Employees are modelled as users, but the employee endpoints reuse
 * the `users:*` permission family (see {@link EmployeesController}).
 */
@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
