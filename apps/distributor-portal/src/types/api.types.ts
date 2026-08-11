/**
 * Shared API envelope + pagination types — matches the NestJS backend
 * `ApiResponse<T>` wrapper (`backend/_shared/api/api-response.ts`).
 */

export interface ApiResponseMeta {
  requestId?: string;
  timestamp?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
  meta?: ApiResponseMeta;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  raw?: unknown;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: ApiResponseMeta;
}

export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}
