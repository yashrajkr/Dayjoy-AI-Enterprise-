/**
 * @deprecated MOVED to `rag/response-pipeline/llm-gateway-service.ts`.
 *
 * The LLM gateway is part of the response pipeline, not the evaluation
 * framework. This file re-exports the moved service for backward
 * compatibility — existing imports (`from '../evaluation/llm-gateway-service'`)
 * keep working. Update imports to point at the new path when convenient.
 */
export {
  LLMGatewayService,
} from '../response-pipeline/llm-gateway-service';
