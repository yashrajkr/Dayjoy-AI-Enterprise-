import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DocumentPermissionsService } from './document-permissions.service';

/**
 * RAG Security Guard
 * ==================
 *
 * NestJS guard that enforces per-document access control on RAG
 * endpoints. Apply it per-controller (or per-route) with
 * `@UseGuards(RagSecurityGuard)` after `JwtAuthGuard` so that
 * `request.user` is populated:
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard, RagSecurityGuard)
 *   @Controller('api/rag/documents')
 *   export class RagDocumentsController { ... }
 *
 * ## How it finds the document ID
 *
 * The guard looks for a document ID on the request in this order:
 *
 *   1. `request.params.documentId`    — `/api/rag/documents/:documentId`
 *   2. `request.params.id`            — generic `:id` style routes
 *   3. `request.body.documentId`      — POST/PUT bodies
 *   4. `request.query.documentId`     — query-string for GETs
 *   5. `request.body.chunkIds[]`      — bulk-chunk operations; the guard
 *      checks each chunk's parent document
 *
 * If no document ID can be found, the guard is a no-op (`return true`)
 * — routes that don't reference a specific document (e.g. `POST /search`
 * which goes through the retrieval pipeline) don't need this guard
 * because {@link DocumentPermissionsService.filterAccessibleChunks}
 * already filters results at the service layer.
 *
 * ## Tenant isolation
 *
 * The guard does NOT check tenant isolation itself — that's already
 * enforced inside `DocumentPermissionsService.canAccessDocumentRow`
 * (tenant mismatch → `false`). The guard simply translates that
 * `false` into a `403 Forbidden`.
 *
 * Denials are logged at WARN level for audit; the `AllExceptionsFilter`
 * wraps the resulting `ForbiddenException` in the standard error
 * envelope so the client sees a clean `{ success: false, error: ... }`
 * response.
 *
 * Reference: `docs/architecture/10_SECURITY_ARCHITECTURE.md` (Section 4 —
 * Authorization Model), `docs/database/14_DATABASE_SECURITY.md`
 * (Section 5 — AI Security Model).
 */
@Injectable()
export class RagSecurityGuard implements CanActivate {
  private readonly logger = new Logger(RagSecurityGuard.name);

  constructor(
    private readonly documentPermissions: DocumentPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{
        user?: { userId?: string; tenantId?: string; role?: string };
        params?: Record<string, string>;
        body?: any;
        query?: any;
      }>();

    const user = request.user;
    if (!user || !user.userId) {
      throw new UnauthorizedException(
        'RagSecurityGuard requires an authenticated user',
      );
    }

    const documentId =
      request.params?.documentId ||
      request.params?.id ||
      request.body?.documentId ||
      request.query?.documentId;

    // 1. Single-document check.
    if (documentId && typeof documentId === 'string') {
      const ok = await this.documentPermissions.canAccessDocument(
        user.userId,
        documentId,
      );
      if (!ok) {
        this.logger.warn(
          `RagSecurityGuard DENIED user=${user.userId} document=${documentId}`,
        );
        throw new ForbiddenException(
          'You do not have access to this document',
        );
      }
      return true;
    }

    // 2. Bulk-chunk check — every chunk's parent document must be accessible.
    const chunkIds: string[] | undefined = request.body?.chunkIds;
    if (Array.isArray(chunkIds) && chunkIds.length > 0) {
      const accessible = await this.documentPermissions.filterAccessibleChunks(
        user.userId,
        chunkIds,
      );
      if (accessible.length !== chunkIds.length) {
        const denied = chunkIds.filter((id) => !accessible.includes(id));
        this.logger.warn(
          `RagSecurityGuard DENIED user=${user.userId} chunks=[${denied.join(', ')}]`,
        );
        throw new ForbiddenException(
          `Access denied for ${denied.length} of ${chunkIds.length} chunks`,
        );
      }
      return true;
    }

    // 3. No document context on the request → no-op. (Service-layer
    //    filtering is responsible for retrieval-style endpoints.)
    return true;
  }
}
