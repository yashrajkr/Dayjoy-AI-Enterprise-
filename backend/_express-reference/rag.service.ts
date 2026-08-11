/**
 * RAG Service
 */

import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../middleware/errorHandler';

export interface CreateRagSourceInput {
  name: string;
  type: string;
  description?: string;
  tenantId: string;
}

export async function listSources(tenantId: string) {
  return prisma.ragSource.findMany({ where: { tenant_id: tenantId, status: 'active' } });
}

export async function listDocuments(tenantId: string, sourceId?: string) {
  const where: any = { tenant_id: tenantId, status: 'processed' };
  if (sourceId) where.source_id = sourceId;
  return prisma.ragDocument.findMany({ where, include: { source: true }, orderBy: { created_at: 'desc' } });
}

export async function createSource(input: CreateRagSourceInput) {
  return prisma.ragSource.create({ data: { tenant_id: input.tenantId, name: input.name, type: input.type, description: input.description, status: 'active' } });
}

export async function searchKnowledge(tenantId: string, query: string, limit = 5) {
  // Simple text search (for production, use pgvector similarity search)
  const chunks = await prisma.ragChunk.findMany({
    where: { tenant_id: tenantId, content: { contains: query, mode: 'insensitive' } },
    include: { document: { include: { source: true } } },
    take: limit,
  });
  return chunks;
}

export async function ingestDocument(tenantId: string, sourceId: string, title: string, content: string) {
  const doc = await prisma.ragDocument.create({
    data: { tenant_id: tenantId, source_id: sourceId, title, content, word_count: content.split(' ').length, status: 'processed' },
  });

  // Create chunks (simple chunking - for production use proper text splitting)
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push({
      tenant_id: tenantId,
      document_id: doc.id,
      chunk_index: chunks.length,
      content: content.slice(i, i + chunkSize),
    });
  }

  if (chunks.length > 0) {
    await prisma.ragChunk.createMany({ data: chunks });
  }

  return { document: doc, chunks: chunks.length };
}
