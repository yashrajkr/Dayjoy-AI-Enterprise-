/**
 * RAG Routes
 */

import { Router } from 'express';
import { listSourcesController, listDocumentsController, createSourceController, searchController, ingestController } from './rag.controller';
import { authenticate, requirePermission } from '../../middleware/authenticate';

export const ragRouter = Router();
ragRouter.use(authenticate);

ragRouter.get('/sources', requirePermission('rag_sources', 'read'), listSourcesController);
ragRouter.get('/documents', requirePermission('rag_documents', 'read'), listDocumentsController);
ragRouter.post('/sources', requirePermission('rag_sources', 'create'), createSourceController);
ragRouter.post('/search', requirePermission('rag_chunks', 'read'), searchController);
ragRouter.post('/ingest', requirePermission('rag_documents', 'create'), ingestController);
