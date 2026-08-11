/**
 * Shared API envelope + pagination types — mirror the NestJS backend
 * `ApiResponse` wrapper in `backend/_shared/api/api-response.ts`.
 */

export interface ApiMeta {
  requestId?: string;
  timestamp?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  /** Cursor for cursor-based pagination (optional). */
  cursor?: string;
  [key: string]: unknown;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  /** Optional structured field-level validation details. */
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: ApiErrorDetail;
  meta?: ApiMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    requestId?: string;
    timestamp?: string;
    cursor?: string;
  };
}

/**
 * Normalised error shape thrown by the API client (after the response
 * interceptor). Pages and forms can `instanceof`/narrow on this.
 */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  raw?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}
