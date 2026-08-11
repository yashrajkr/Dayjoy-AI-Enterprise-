import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "sonner";
import type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  PaginationParams,
} from "@/types/api.types";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * Typed Axios client for the Dayjoy AI Enterprise backend.
 *
 * Wire format (NestJS backend envelope — see
 * `backend/_shared/api/api-response.ts`):
 *
 *   {
 *     "success": true,
 *     "data": <T>,
 *     "meta": { "requestId": "...", "timestamp": "...", "page": 1, ... }
 *   }
 *
 *   — on error —
 *   {
 *     "success": false,
 *     "error": { "code": "NOT_FOUND", "message": "...", "details": null },
 *     "meta": { ... }
 *   }
 *
 * The response interceptor auto-detects the envelope (by checking for a
 * `success` boolean) and unwraps `data`, so callers receive `T`
 * directly. Non-envelope responses are passed through unchanged.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/** Helper — read the access token from localStorage (client only). */
function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/** Helper — clear all auth-related storage (used on 401). */
function clearAuthStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  window.localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  window.localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  window.localStorage.removeItem(STORAGE_KEYS.USER);
  window.localStorage.removeItem(STORAGE_KEYS.DISTRIBUTOR);
}

/** Detect the standard NestJS response envelope. */
function isApiResponseEnvelope(payload: unknown): payload is ApiResponse {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate["success"] === "boolean" &&
    ("data" in candidate || "error" in candidate || "meta" in candidate)
  );
}

// ===== Request Interceptor =====
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (!config.headers["X-Request-ID"]) {
      config.headers["X-Request-ID"] =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    if (typeof window !== "undefined") {
      const tenantId = window.localStorage.getItem("active_tenant_id");
      if (tenantId && !config.headers["X-Tenant-Id"]) {
        config.headers["X-Tenant-Id"] = tenantId;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ===== Response Interceptor =====
apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data;

    if (isApiResponseEnvelope(payload)) {
      if (!payload.success) {
        const apiErr: ApiError = {
          status: response.status,
          code: payload.error?.code ?? "UNKNOWN",
          message: payload.error?.message ?? "Request failed",
          details: payload.error?.details,
        };
        return Promise.reject(apiErr);
      }
      (response as unknown as { _meta?: unknown })._meta = payload.meta;
      response.data = payload.data;
    }
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status ?? 0;
    const envelope = error.response?.data;
    const apiError: ApiError = {
      status,
      code: envelope?.error?.code ?? error.code ?? "UNKNOWN",
      message:
        envelope?.error?.message ??
        error.message ??
        "An unexpected error occurred",
      details: envelope?.error?.details,
      raw: error,
    };

    if (status === 401 && typeof window !== "undefined") {
      clearAuthStorage();
      const pathname = window.location.pathname;
      if (!pathname.startsWith("/login") && !pathname.startsWith("/register")) {
        const redirect = encodeURIComponent(
          pathname + window.location.search,
        );
        window.location.href = `/login?redirect=${redirect}`;
      }
      return Promise.reject(apiError);
    }

    if (typeof window !== "undefined") {
      if (status === 0) {
        toast.error("Network error", {
          description:
            "Could not reach the server. Please check your connection.",
        });
      } else if (status >= 500) {
        toast.error("Server error", { description: apiError.message });
      } else if (status === 429) {
        toast.error("Too many requests", {
          description: "Please slow down and try again in a moment.",
        });
      } else if (status !== 422 && status !== 404 && status !== 403) {
        toast.error(apiError.code === "UNKNOWN" ? "Request failed" : apiError.code, {
          description: apiError.message,
        });
      }
    }

    return Promise.reject(apiError);
  },
);

// ===== API Methods =====

export interface PaginatedRequestConfig extends AxiosRequestConfig {
  params?: PaginationParams & Record<string, unknown>;
}

export const api = {
  get: <T>(url: string, params?: object, config?: AxiosRequestConfig) =>
    apiClient.get<T>(url, { params, ...config }).then((res) => res.data as T),

  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.post<T>(url, data, config).then((res) => res.data as T),

  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.put<T>(url, data, config).then((res) => res.data as T),

  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.patch<T>(url, data, config).then((res) => res.data as T),

  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    apiClient.delete<T>(url, config).then((res) => res.data as T),

  paginated: async <T>(
    url: string,
    params?: PaginationParams & Record<string, unknown>,
    config?: AxiosRequestConfig,
  ): Promise<PaginatedResponse<T>> => {
    const res = await apiClient.get<T[] | { items: T[] } | unknown>(url, {
      params,
      ...config,
    });
    const meta =
      (res as unknown as { _meta?: ApiResponse["meta"] })._meta ?? {};
    let data: T[];
    if (Array.isArray(res.data)) {
      data = res.data as T[];
    } else if (
      res.data &&
      typeof res.data === "object" &&
      Array.isArray((res.data as { items?: T[] }).items)
    ) {
      data = (res.data as { items: T[] }).items;
    } else if (res.data && typeof res.data === "object") {
      const maybeData = (res.data as { data?: T[] }).data;
      data = Array.isArray(maybeData) ? maybeData : [];
    } else {
      data = [];
    }
    return {
      data,
      meta: {
        page: meta.page ?? Number(params?.page ?? 1),
        limit: meta.limit ?? Number(params?.limit ?? 20),
        total: meta.total ?? data.length,
        totalPages: meta.totalPages ?? 1,
        requestId: meta.requestId,
        timestamp: meta.timestamp,
      },
    };
  },

  raw: apiClient,
};

export type { AxiosRequestConfig, AxiosError };
