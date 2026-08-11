import { Module } from '@nestjs/common';

/**
 * Marker module for the API envelope helpers.
 *
 * The helpers themselves ({@link ApiResponse}, {@link PaginatedResponse},
 * {@link PaginationDto}) are pure classes / DTOs with no NestJS providers,
 * so this module intentionally declares no providers or exports — it exists
 * only so the folder is importable as a Nest module in case a future
 * addition (e.g. an `ApiConfigService`) needs DI.
 *
 * Importing it is optional; consumers can also import the types directly:
 *
 * ```ts
 * import { ApiResponse, PaginatedResponse } from '../_shared/api';
 * ```
 */
@Module({})
export class ApiModule {}
