import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

/**
 * Admin feature module.
 *
 * Standalone — does not import other feature modules. `AdminService`
 * queries the User / Tenant / TenantConfig / AuditLog / AccessLog /
 * Integration models directly via `PrismaService` rather than going
 * through `UsersModule` etc., to avoid the circular-import problem
 * (those modules would need to import `AdminModule` for the role-
 * assignment helpers, while `AdminModule` would need them for user
 * queries — direct Prisma access breaks the cycle).
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
