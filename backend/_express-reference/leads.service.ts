/**
 * Leads Service
 */

import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../middleware/errorHandler';

export interface CreateLeadInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  tenantId: string;
}

export async function listLeads(tenantId: string, page = 1, limit = 20, status?: string) {
  const skip = (page - 1) * limit;
  const where: any = { tenant_id: tenantId };
  if (status) where.status = status;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.lead.count({ where }),
  ]);
  return { data: leads, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getLeadById(id: string, tenantId: string) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.tenant_id !== tenantId) throw new NotFoundError('Lead');
  return lead;
}

export async function createLead(input: CreateLeadInput) {
  return prisma.lead.create({ data: { tenant_id: input.tenantId, first_name: input.firstName, last_name: input.lastName, email: input.email, phone: input.phone, company: input.company, status: 'NEW' } });
}

export async function updateLead(id: string, tenantId: string, input: Partial<CreateLeadInput> & { status?: string }) {
  await getLeadById(id, tenantId);
  return prisma.lead.update({ where: { id }, data: input });
}

export async function deleteLead(id: string, tenantId: string) {
  await getLeadById(id, tenantId);
  await prisma.lead.update({ where: { id }, data: { status: 'DELETED' } });
  return { success: true };
}
