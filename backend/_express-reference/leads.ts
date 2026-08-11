/**
 * Lead Routes
 * 
 * Lead management endpoints.
 */

import { Router } from 'express';

export const leadsRouter = Router();

// TODO: Implement lead routes
// GET /api/leads - List leads
// GET /api/leads/:id - Get lead by ID
// POST /api/leads - Create lead
// PUT /api/leads/:id - Update lead
// DELETE /api/leads/:id - Delete lead

leadsRouter.get('/', (req, res) => {
  res.json({ message: 'Lead routes - Coming soon' });
});
