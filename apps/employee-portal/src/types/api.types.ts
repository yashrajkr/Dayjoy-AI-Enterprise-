/** Shared API types — matches the NestJS backend envelope shape. */

export interface ApiResponseMeta {
  requestId?: string;
  timestamp?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  cursor?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
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

/** Date range filter used by reports / analytics endpoints. */
export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}
