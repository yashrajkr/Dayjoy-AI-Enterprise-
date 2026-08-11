/**
 * Leads Routes
 */

import { Router } from 'express';
import { listLeadsController, getLeadController, createLeadController, updateLeadController, deleteLeadController } from './leads.controller';
import { authenticate, requirePermission } from '../../middleware/authenticate';

export const leadsRouter = Router();
leadsRouter.use(authenticate);

leadsRouter.get('/', requirePermission('leads', 'read'), listLeadsController);
leadsRouter.get('/:id', requirePermission('leads', 'read'), getLeadController);
leadsRouter.post('/', requirePermission('leads', 'create'), createLeadController);
leadsRouter.put('/:id', requirePermission('leads', 'update'), updateLeadController);
leadsRouter.delete('/:id', requirePermission('leads', 'delete'), deleteLeadController);
