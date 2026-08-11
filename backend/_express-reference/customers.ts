/**
 * Customer Routes
 * 
 * Customer management endpoints.
 */

import { Router } from 'express';

export const customersRouter = Router();

// TODO: Implement customer routes
// GET /api/customers - List customers
// GET /api/customers/:id - Get customer by ID
// POST /api/customers - Create customer
// PUT /api/customers/:id - Update customer
// DELETE /api/customers/:id - Delete customer

customersRouter.get('/', (req, res) => {
  res.json({ message: 'Customer routes - Coming soon' });
});
