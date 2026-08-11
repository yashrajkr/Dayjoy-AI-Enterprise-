import { Injectable } from '@nestjs/common';
import { RolesGuard } from '../../_shared/common/guards/roles.guard';

@Injectable()
export class AdminOnlyGuard extends RolesGuard {
  // This guard is used with @Roles('ADMIN') to restrict endpoints to admins only.
  // It inherits the logic from RolesGuard.
}
