/**
 * AI Controller
 */

import { Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler';
import { listAgents, listConversations, getConversationById, createConversation, sendMessage } from './ai.service';
import { AuthRequest } from '../../middleware/authenticate';

export const listAgentsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const agents = await listAgents(req.tenantId!);
  res.json({ data: agents });
});

export const listConversationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit } = req.query;
  const result = await listConversations(req.tenantId!, Number(page) || 1, Number(limit) || 20);
  res.json(result);
});

export const getConversationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const conv = await getConversationById(req.params.id, req.tenantId!);
  res.json({ data: conv });
});

export const createConversationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { agentId, channel, userId, customerId } = req.body;
  if (!agentId || !channel) throw new ValidationError('Agent ID and channel required');
  const conv = await createConversation({ agentId, channel, userId, customerId, tenantId: req.tenantId! });
  res.status(201).json({ data: conv, message: 'Conversation created' });
});

export const sendMessageController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { conversationId, role, content } = req.body;
  if (!conversationId || !role || !content) throw new ValidationError('Conversation ID, role, and content required');
  const result = await sendMessage({ conversationId, role, content, tenantId: req.tenantId! });
  res.json({ data: result });
});
