/**
 * AI Routes
 * 
 * AI agent and conversation management endpoints.
 */

import { Router } from 'express';

export const aiRouter = Router();

// TODO: Implement AI routes
// GET /api/ai/agents - List AI agents
// POST /api/ai/conversations - Create conversation
// GET /api/ai/conversations/:id - Get conversation
// POST /api/ai/conversations/:id/messages - Send message

aiRouter.get('/', (req, res) => {
  res.json({ message: 'AI routes - Coming soon' });
});
