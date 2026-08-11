/**
 * Leads Controller
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { listLeads, getLeadById, createLead, updateLead, deleteLead } from './leads.service';
import { AuthRequest } from '../../middleware/authenticate';

export const listLeadsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, status } = req.query;
  const result = await listLeads(req.tenantId!, Number(page) || 1, Number(limit) || 20, status as string);
  res.json(result);
});

export const getLeadController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await getLeadById(req.params.id, req.tenantId!);
  res.json({ data: lead });
});

export const createLeadController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, email, phone, company } = req.body;
  const lead = await createLead({ firstName, lastName, email, phone, company, tenantId: req.tenantId! });
  res.status(201).json({ data: lead, message: 'Lead created' });
});

export const updateLeadController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await updateLead(req.params.id, req.tenantId!, req.body);
  res.json({ data: lead, message: 'Lead updated' });
});

export const deleteLeadController = asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteLead(req.params.id, req.tenantId!);
  res.json({ message: 'Lead deleted' });
});
