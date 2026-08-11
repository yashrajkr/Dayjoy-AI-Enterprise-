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
} from "@/types";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * Typed Axios client for the Dayjoy AI Enterprise backend.
 * Same envelope contract as admin-dashboard (see backend
 * `_shared/api/api-response.ts`): `{ success, data, meta }`.
 */
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

function clearAuthStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  window.localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  window.localStorage.removeItem(STORAGE_KEYS.USER);
}

function isApiResponseEnvelope(payload: unknown): payload is ApiResponse<unknown> {
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
  (error: AxiosError<ApiResponse<unknown>>) => {
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
      if (!pathname.startsWith("/login")) {
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
      } else if (status !== 422 && status !== 404) {
        toast.error(apiError.code === "UNKNOWN" ? "Request failed" : apiError.code, {
          description: apiError.message,
        });
      }
    }

    return Promise.reject(apiError);
  },
);

// ===== API Methods =====

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
    params?: Record<string, unknown>,
    config?: AxiosRequestConfig,
  ): Promise<PaginatedResponse<T>> => {
    const res = await apiClient.get<T[] | { items: T[] } | unknown>(url, {
      params,
      ...config,
    });
    const meta =
      (res as unknown as { _meta?: ApiResponse<unknown>["meta"] })._meta ?? {};
    let data: T[];
    if (Array.isArray(res.data)) {
      data = res.data as T[];
    } else if (
      res.data &&
      typeof res.data === "object" &&
      Array.isArray((res.data as { items?: T[] }).items)
    ) {
      data = (res.data as { items: T[] }).items;
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
        cursor: meta.cursor,
      },
    };
  },

  /** Raw axios instance (escape hatch for streaming, FormData, etc.). */
  raw: apiClient,
};

export type { AxiosRequestConfig, AxiosError };

/**
 * Extract a human-readable message from any thrown value — handles
 * the `ApiError` envelope, native `Error`, Axios errors, and unknown
 * shapes. Used by forms and toast handlers across the portal.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || fallback;
  const maybeApiError = err as Partial<ApiError>;
  if (typeof maybeApiError.message === "string" && maybeApiError.message) {
    return maybeApiError.message;
  }
  return fallback;
}
