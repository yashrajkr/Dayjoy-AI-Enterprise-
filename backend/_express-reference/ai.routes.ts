/**
 * AI Routes
 */

import { Router } from 'express';
import { listAgentsController, listConversationsController, getConversationController, createConversationController, sendMessageController } from './ai.controller';
import { authenticate, requirePermission } from '../../middleware/authenticate';

export const aiRouter = Router();
aiRouter.use(authenticate);

aiRouter.get('/agents', requirePermission('ai_agents', 'read'), listAgentsController);
aiRouter.get('/conversations', requirePermission('conversations', 'read'), listConversationsController);
aiRouter.get('/conversations/:id', requirePermission('conversations', 'read'), getConversationController);
aiRouter.post('/conversations', requirePermission('conversations', 'create'), createConversationController);
aiRouter.post('/conversations/:id/messages', requirePermission('messages', 'create'), sendMessageController);
