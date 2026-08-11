import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';

/**
 * Document Permissions Service
 * ===========================
 *
 * Enforces per-document access control on top of the RAG knowledge base,
 * implementing the access-control + AI security model defined in:
 *
 *   - `docs/architecture/10_SECURITY_ARCHITECTURE.md` (Section 4 — Authorization Model)
 *   - `docs/database/14_DATABASE_SECURITY.md` (Section 5 — AI Security Model)
 *   - `docs/ai/16_AI_GOVERNANCE.md`
 *
 * ## Permission model
 *
 * Every `RagDocument` may carry a `metadata.restrictions` block that
 * scopes who can see it. The block is optional and lives entirely in
 * JSON — there's no separate `rag_document_permissions` table today:
 *
 *   {
 *     "restrictions": {
 *       "roles": ["DISTRIBUTOR_MANAGER", "ADMIN"],   // optional allow-list of roles
 *       "userIds": ["u-1", "u-2"],                    // optional allow-list of users
 *       "tenantScoped": true                          // optional, default true
 *     }
 *   }
 *
 * Rules (in evaluation order):
 *
 *   1. **Super-admin bypass** — users carrying the `SUPER_ADMIN` role
 *      (resolved through the `user_roles` join table, mirroring
 *      `PermissionsGuard`) see everything. This short-circuit happens
 *      *after* the tenant check, so a super-admin in tenant A still
 *      can't read tenant B's documents.
 *   2. **Tenant isolation** — if the user's `tenantId` doesn't match the
 *      document's `tenantId`, deny. This is the primary isolation
 *      boundary in the multi-tenant schema (every RAG table has
 *      `tenant_id`).
 *   3. **No restrictions** — documents without a `restrictions` block
 *      are visible to everyone in the tenant.
 *   4. **Role restriction** — if `restrictions.roles` is set, the user
 *      must hold at least one of those roles.
 *   5. **User restriction** — if `restrictions.userIds` is set, the
 *      user must be in that list.
 *
 * All checks are async because they hit the DB (the `User` row + active
 * `UserRole` join rows).
 *
 * ## Batch helpers
 *
 * Two helpers exist for the retrieval path:
 *
 *   - `filterAccessibleChunks(userId, chunkIds[])` — used by the
 *     retrieval pipeline to drop chunks the user can't see *before*
 *     they're sent to the LLM. Without this, the LLM could answer
 *     using a chunk the user isn't authorised to read, and the citation
 *     would leak the document title.
 *   - `filterAccessibleDocuments(userId, documentIds[])` — used by the
 *     listing endpoints to hide documents the user can't open.
 *
 * Both batch helpers load chunks/documents in a single round-trip
 * (rather than N+1), then fan out the per-item permission check.
 */
@Injectable()
export class DocumentPermissionsService {
  private readonly logger = new Logger(DocumentPermissionsService.name);

  /** Role name that bypasses per-document restrictions. Mirrors `PermissionsGuard`. */
  private static readonly SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Can `userId` read `documentId`?
   *
   * Returns `false` (rather than throwing) on every denial path so
   * callers can simply filter without try/catch. Audit-logging of denials
   * is the caller's responsibility — see `RagSecurityGuard`.
   */
  async canAccessDocument(userId: string, documentId: string): Promise<boolean> {
    const document = await this.prisma.ragDocument.findUnique({
      where: { id: documentId },
      include: { source: { select: { id: true, name: true, tenantId: true } } },
    });
    if (!document) {
      this.logger.debug(`canAccessDocument: document ${documentId} not found`);
      return false;
    }

    return this.canAccessDocumentRow(userId, document);
  }

  /**
   * Same as {@link canAccessDocument} but accepts a pre-loaded row —
   * useful in the batch helpers where we already have the row in hand
   * and want to avoid a second fetch.
   */
  async canAccessDocumentRow(
    userId: string,
    document: {
      id: string;
      tenantId: string;
      metadata?: any;
      source?: { tenantId?: string } | null;
    },
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        userRoles: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { role: { select: { name: true } } },
        },
      },
    });
    if (!user) {
      this.logger.debug(`canAccessDocumentRow: user ${userId} not found`);
      return false;
    }

    // 1. Tenant isolation — primary boundary.
    if (user.tenantId !== document.tenantId) {
      this.logger.warn(
        `Tenant mismatch: user ${userId} (tenant=${user.tenantId}) vs document ${document.id} (tenant=${document.tenantId})`,
      );
      return false;
    }

    // 2. Super-admin bypass (within the same tenant).
    const isSuperAdmin =
      user.role === DocumentPermissionsService.SUPER_ADMIN_ROLE ||
      user.userRoles.some(
        (ur) => ur.role.name === DocumentPermissionsService.SUPER_ADMIN_ROLE,
      );
    if (isSuperAdmin) return true;

    // 3. No restrictions → visible to everyone in the tenant.
    const restrictions = document.metadata?.restrictions;
    if (!restrictions) return true;

    // 4. Role restriction.
    if (Array.isArray(restrictions.roles) && restrictions.roles.length > 0) {
      const userRoleNames = new Set<string>([
        ...(user.role ? [user.role] : []),
        ...user.userRoles.map((ur) => ur.role.name),
      ]);
      const hasRole = restrictions.roles.some((r: string) => userRoleNames.has(r));
      if (!hasRole) {
        this.logger.debug(
          `Role restriction denied for ${userId} on document ${document.id}: requires [${restrictions.roles.join(', ')}], has [${Array.from(userRoleNames).join(', ')}]`,
        );
        return false;
      }
    }

    // 5. User restriction.
    if (Array.isArray(restrictions.userIds) && restrictions.userIds.length > 0) {
      if (!restrictions.userIds.includes(userId)) {
        this.logger.debug(
          `User restriction denied for ${userId} on document ${document.id}`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Can `userId` read all documents from `sourceId`? Today this is the
   * same as asking whether the user can access the *source* row itself
   * (sources are tenant-scoped; per-source restrictions live in
   * `source.configuration.restrictions` with the same shape as document
   * restrictions). When a source has no restrictions, callers should
   * still call {@link filterAccessibleDocuments} for the individual
   * documents — a source being visible doesn't imply every document in
   * it is.
   */
  async canAccessSource(userId: string, sourceId: string): Promise<boolean> {
    const source = await this.prisma.ragSource.findUnique({
      where: { id: sourceId },
    });
    if (!source) return false;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        userRoles: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { role: { select: { name: true } } },
        },
      },
    });
    if (!user) return false;

    // 1. Tenant isolation.
    if (user.tenantId !== source.tenantId) return false;

    // 2. Super-admin.
    const isSuperAdmin =
      user.role === DocumentPermissionsService.SUPER_ADMIN_ROLE ||
      user.userRoles.some(
        (ur) => ur.role.name === DocumentPermissionsService.SUPER_ADMIN_ROLE,
      );
    if (isSuperAdmin) return true;

    // 3. No restrictions on source.
    const restrictions = (source.configuration as any)?.restrictions;
    if (!restrictions) return true;

    // 4. Role restriction.
    if (Array.isArray(restrictions.roles) && restrictions.roles.length > 0) {
      const userRoleNames = new Set<string>([
        ...(user.role ? [user.role] : []),
        ...user.userRoles.map((ur) => ur.role.name),
      ]);
      const hasRole = restrictions.roles.some((r: string) => userRoleNames.has(r));
      if (!hasRole) return false;
    }

    // 5. User restriction.
    if (Array.isArray(restrictions.userIds) && restrictions.userIds.length > 0) {
      if (!restrictions.userIds.includes(userId)) return false;
    }

    return true;
  }

  /**
   * Filter a list of chunk IDs down to those the user can read.
   *
   * Used by the retrieval pipeline to drop inaccessible chunks *before*
   * they're passed to the LLM — preventing both context leakage and
   * bogus citations pointing at documents the user can't open.
   *
   * Loads all candidate chunks + their parent documents in a single
   * round-trip (rather than N+1), then fans out the per-document
   * permission check. Chunks whose document we can't resolve are
   * dropped.
   */
  async filterAccessibleChunks(
    userId: string,
    chunkIds: string[],
  ): Promise<string[]> {
    if (chunkIds.length === 0) return [];

    const chunks = await this.prisma.ragChunk.findMany({
      where: { id: { in: chunkIds } },
      select: {
        id: true,
        document: {
          select: {
            id: true,
            tenantId: true,
            metadata: true,
            source: { select: { tenantId: true } },
          },
        },
      },
    });

    // Preserve caller order — chunks that survived the filter appear in
    // the same order they did in `chunkIds`.
    const chunkById = new Map(chunks.map((c) => [c.id, c]));
    const checks = await Promise.all(
      chunkIds.map(async (id) => {
        const chunk = chunkById.get(id);
        if (!chunk) return { id, allowed: false };
        const allowed = await this.canAccessDocumentRow(userId, chunk.document);
        return { id, allowed };
      }),
    );

    return checks.filter((c) => c.allowed).map((c) => c.id);
  }

  /**
   * Filter a list of document IDs down to those the user can read.
   *
   * Used by the document listing endpoints to hide documents the user
   * isn't authorised to open. Same shape as {@link filterAccessibleChunks}
   * but operates at the document level.
   */
  async filterAccessibleDocuments(
    userId: string,
    documentIds: string[],
  ): Promise<string[]> {
    if (documentIds.length === 0) return [];

    const documents = await this.prisma.ragDocument.findMany({
      where: { id: { in: documentIds } },
      select: {
        id: true,
        tenantId: true,
        metadata: true,
        source: { select: { tenantId: true } },
      },
    });

    const docById = new Map(documents.map((d) => [d.id, d]));
    const checks = await Promise.all(
      documentIds.map(async (id) => {
        const doc = docById.get(id);
        if (!doc) return { id, allowed: false };
        const allowed = await this.canAccessDocumentRow(userId, doc);
        return { id, allowed };
      }),
    );

    return checks.filter((c) => c.allowed).map((c) => c.id);
  }
}
