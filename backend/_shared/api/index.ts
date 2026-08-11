/**
 * Barrel for the shared API envelope helpers.
 *
 * Everything a controller / service needs to produce a standardised response
 * (or to assert against one in tests) is re-exported from here.
 */
export {
  ApiResponse,
  PaginatedResponse,
  type ApiResponseMeta,
  type ApiErrorPayload,
} from './api-response';
export { PaginationDto } from './pagination.dto';
export { ApiModule } from './api.module';
