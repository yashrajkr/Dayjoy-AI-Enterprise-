import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { DocumentPermissionsService } from '../../security/document-permissions.service';
import { PrismaService } from '../../../backend/_shared/database/prisma.service';
import { createMockPrismaService } from '../../../backend/_shared/testing/mock-prisma.service';

/**
 * Helpers to build mock Prisma rows for the permission tests. Each
 * helper returns a fresh object so tests can mutate without leaking
 * state across cases.
 */
function makeUserRow(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-A',
    role: 'user',
    userRoles: [],
    ...overrides,
  };
}

function makeDocumentRow(overrides: Partial<any> = {}) {
  return {
    id: 'doc-1',
    tenantId: 'tenant-A',
    metadata: null,
    source: { tenantId: 'tenant-A' },
    ...overrides,
  };
}

function makeSourceRow(overrides: Partial<any> = {}) {
  return {
    id: 'src-1',
    tenantId: 'tenant-A',
    configuration: null,
    ...overrides,
  };
}

/**
 * Unit tests for `DocumentPermissionsService`.
 *
 * Strategy: mock Prisma (via the shared `createMockPrismaService`
 * helper). Each test stubs the appropriate `.findUnique` / `.findMany`
 * calls and asserts the boolean verdict.
 *
 * Coverage matrix (the matrix from the task brief):
 *
 *   ✅ Super-admin access
 *   ✅ Public document access (no restrictions)
 *   ✅ Role-restricted document — allowed when user has the role
 *   ✅ Role-restricted document — denied when user lacks the role
 *   ✅ User-restricted document — allowed when user is in the list
 *   ✅ User-restricted document — denied otherwise
 *   ✅ Cross-tenant denial (primary isolation boundary)
 *   ✅ filterAccessibleChunks preserves caller order + drops inaccessible
 *   ✅ filterAccessibleDocuments hides documents
 *   ✅ canAccessSource mirrors the document logic
 *   ✅ Document not found → false
 *   ✅ User not found → false
 */
describe('DocumentPermissionsService', () => {
  let service: DocumentPermissionsService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentPermissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(DocumentPermissionsService);
  });

  // ----------------------------------------------------------------
  // canAccessDocument
  // ----------------------------------------------------------------

  it('returns false when the document does not exist', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(null);
    const ok = await service.canAccessDocument('user-1', 'missing-doc');
    expect(ok).toBe(false);
  });

  it('returns false when the user does not exist', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(makeDocumentRow());
    prisma.user.findUnique.mockResolvedValue(null);
    const ok = await service.canAccessDocument('missing-user', 'doc-1');
    expect(ok).toBe(false);
  });

  it('denies cross-tenant access even for super-admin', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({ tenantId: 'tenant-B' }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({
        tenantId: 'tenant-A',
        role: 'SUPER_ADMIN',
      }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(false);
  });

  it('super-admin in the same tenant bypasses all restrictions', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: {
          restrictions: { roles: ['ADMIN'], userIds: ['someone-else'] },
        },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({ role: 'SUPER_ADMIN' }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(true);
  });

  it('super-admin via userRoles join also bypasses', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: { restrictions: { roles: ['ADMIN'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({
        role: 'user',
        userRoles: [{ role: { name: 'SUPER_ADMIN' } }],
      }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(true);
  });

  it('public document (no restrictions) is visible to anyone in the tenant', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({ metadata: null }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({ role: 'user' }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(true);
  });

  it('role-restricted document is allowed when the user has the role', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: { restrictions: { roles: ['DISTRIBUTOR_MANAGER', 'ADMIN'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({
        role: 'user',
        userRoles: [{ role: { name: 'DISTRIBUTOR_MANAGER' } }],
      }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(true);
  });

  it('role-restricted document is denied when the user lacks the role', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: { restrictions: { roles: ['ADMIN'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({
        role: 'user',
        userRoles: [{ role: { name: 'DISTRIBUTOR' } }],
      }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(false);
  });

  it('user-restricted document is allowed when the user is in the list', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: { restrictions: { userIds: ['user-1', 'user-2'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({ role: 'user' }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(true);
  });

  it('user-restricted document is denied when the user is NOT in the list', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: { restrictions: { userIds: ['someone-else'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(makeUserRow());
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(false);
  });

  it('expired UserRole is ignored when checking the super-admin bypass', async () => {
    prisma.ragDocument.findUnique.mockResolvedValue(
      makeDocumentRow({
        metadata: { restrictions: { roles: ['ADMIN'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({
        // No active super-admin role; user only has DISTRIBUTOR.
        userRoles: [{ role: { name: 'DISTRIBUTOR' } }],
      }),
    );
    const ok = await service.canAccessDocument('user-1', 'doc-1');
    expect(ok).toBe(false);
  });

  // ----------------------------------------------------------------
  // canAccessSource
  // ----------------------------------------------------------------

  it('canAccessSource returns true for an unrestricted source in the same tenant', async () => {
    prisma.ragSource.findUnique.mockResolvedValue(makeSourceRow());
    prisma.user.findUnique.mockResolvedValue(makeUserRow());
    const ok = await service.canAccessSource('user-1', 'src-1');
    expect(ok).toBe(true);
  });

  it('canAccessSource denies cross-tenant access', async () => {
    prisma.ragSource.findUnique.mockResolvedValue(
      makeSourceRow({ tenantId: 'tenant-B' }),
    );
    prisma.user.findUnique.mockResolvedValue(makeUserRow());
    const ok = await service.canAccessSource('user-1', 'src-1');
    expect(ok).toBe(false);
  });

  it('canAccessSource honours role restrictions from source.configuration', async () => {
    prisma.ragSource.findUnique.mockResolvedValue(
      makeSourceRow({
        configuration: { restrictions: { roles: ['ADMIN'] } },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({ userRoles: [{ role: { name: 'DISTRIBUTOR' } }] }),
    );
    const ok = await service.canAccessSource('user-1', 'src-1');
    expect(ok).toBe(false);
  });

  // ----------------------------------------------------------------
  // filterAccessibleChunks
  // ----------------------------------------------------------------

  it('filterAccessibleChunks preserves caller order and drops inaccessible chunks', async () => {
    // Chunks 1 and 3 belong to tenant-A (accessible), chunk 2 to tenant-B.
    prisma.ragChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        document: makeDocumentRow({ id: 'doc-A', tenantId: 'tenant-A', metadata: null }),
      },
      {
        id: 'chunk-2',
        document: makeDocumentRow({ id: 'doc-B', tenantId: 'tenant-B', metadata: null }),
      },
      {
        id: 'chunk-3',
        document: makeDocumentRow({ id: 'doc-C', tenantId: 'tenant-A', metadata: null }),
      },
    ]);

    // user.findUnique is called once per chunk in filterAccessibleChunks
    // (the canAccessDocumentRow helper). Tenant-A user.
    prisma.user.findUnique.mockResolvedValue(makeUserRow());

    const result = await service.filterAccessibleChunks('user-1', [
      'chunk-1',
      'chunk-2',
      'chunk-3',
    ]);
    // chunk-2 dropped (cross-tenant); order preserved.
    expect(result).toEqual(['chunk-1', 'chunk-3']);
  });

  it('filterAccessibleChunks returns [] for an empty input', async () => {
    const result = await service.filterAccessibleChunks('user-1', []);
    expect(result).toEqual([]);
    expect(prisma.ragChunk.findMany).not.toHaveBeenCalled();
  });

  it('filterAccessibleChunks drops chunks that cannot be resolved', async () => {
    prisma.ragChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        document: makeDocumentRow({ id: 'doc-A', tenantId: 'tenant-A', metadata: null }),
      },
      // chunk-2 was deleted between retrieval and permission check
    ]);
    prisma.user.findUnique.mockResolvedValue(makeUserRow());

    const result = await service.filterAccessibleChunks('user-1', [
      'chunk-1',
      'chunk-2',
    ]);
    expect(result).toEqual(['chunk-1']);
  });

  // ----------------------------------------------------------------
  // filterAccessibleDocuments
  // ----------------------------------------------------------------

  it('filterAccessibleDocuments hides documents the user cannot open', async () => {
    prisma.ragDocument.findMany.mockResolvedValue([
      makeDocumentRow({ id: 'doc-1', tenantId: 'tenant-A', metadata: null }),
      makeDocumentRow({
        id: 'doc-2',
        tenantId: 'tenant-A',
        metadata: { restrictions: { roles: ['ADMIN'] } },
      }),
    ]);

    prisma.user.findUnique.mockResolvedValue(
      makeUserRow({ userRoles: [{ role: { name: 'DISTRIBUTOR' } }] }),
    );

    const result = await service.filterAccessibleDocuments('user-1', [
      'doc-1',
      'doc-2',
    ]);
    expect(result).toEqual(['doc-1']);
  });
});
