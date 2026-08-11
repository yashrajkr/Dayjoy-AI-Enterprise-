import { Injectable } from '@nestjs/common';
import { RolesGuard } from '../../_shared/common/guards/roles.guard';

@Injectable()
export class EmployeeOnlyGuard extends RolesGuard {
  // This guard is used with @Roles('EMPLOYEE', 'MANAGER', 'ADMIN') to restrict endpoints to employees/managers/admins.
}
