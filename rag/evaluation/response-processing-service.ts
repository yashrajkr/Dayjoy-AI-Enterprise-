/**
 * @deprecated MOVED to `rag/response-pipeline/response-processing-service.ts`.
 *
 * Response processing is part of the response pipeline, not the
 * evaluation framework. This file re-exports the moved service for
 * backward compatibility — existing imports
 * (`from '../evaluation/response-processing-service'`) keep working.
 * Update imports to point at the new path when convenient.
 */
export {
  ResponseProcessingService,
} from '../response-pipeline/response-processing-service';
