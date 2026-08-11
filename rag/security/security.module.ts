import { Module } from '@nestjs/common';
import { DocumentPermissionsService } from './document-permissions.service';
import { RagSecurityGuard } from './rag-security.guard';
import { TenantIsolationInterceptor } from './tenant-isolation.interceptor';

/**
 * RAG Security module.
 *
 * Wires the document-permission service + RAG guard + tenant-isolation
 * interceptor. `PrismaService` is provided globally by `PrismaModule`,
 * so this module only declares its own providers.
 *
 * Import this module from `app.module.ts` (or from a feature module
 * that needs the guard/interceptor) to enable RAG-level access control:
 *
 *   imports: [
 *     ...,
 *     RagSecurityModule,
 *   ]
 *
 * Then apply the guard/interceptor per-controller:
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard)
 *   @UseInterceptors(TenantIsolationInterceptor)
 *   @Controller('api/rag/documents')
 *   export class RagDocumentsController { ... }
 *
 * Reference: `docs/architecture/10_SECURITY_ARCHITECTURE.md`,
 *            `docs/database/14_DATABASE_SECURITY.md`.
 */
@Module({
  providers: [DocumentPermissionsService, RagSecurityGuard, TenantIsolationInterceptor],
  exports: [
    DocumentPermissionsService,
    RagSecurityGuard,
    TenantIsolationInterceptor,
  ],
})
export class RagSecurityModule {}
