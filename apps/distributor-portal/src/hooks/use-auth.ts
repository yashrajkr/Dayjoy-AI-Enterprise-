"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS, ROUTES, PUBLIC_ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/store/auth.store";
import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  AuthUser,
} from "@/types/auth.types";
import type { Distributor } from "@/types/distributor.types";

/**
 * Auth hook — login, register, logout, and current-user rehydration.
 *
 * The hook rehydrates the persisted store on mount and, if a token is
 * present, calls `GET /api/auth/me` to confirm the session is still
 * valid. Authenticated pages live under the `(portal)` route group;
 * unauthenticated visits are bounced to `/login`.
 */
export function useAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const {
    user,
    distributor,
    accessToken,
    isAuthenticated,
    hydrated,
    setAuth,
    setUser,
    setDistributor,
    clearAuth,
  } = useAuthStore();

  const [authLoading, setAuthLoading] = useState(false);

  // Re-validate the session once on mount.
  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      // No token → bounce to login if on a protected route.
      if (
        pathname &&
        !PUBLIC_ROUTES.some((r) => pathname.startsWith(r))
      ) {
        const redirect = encodeURIComponent(pathname + window.location.search);
        router.replace(`${ROUTES.login}?redirect=${redirect}`);
      }
      return;
    }

    // Validate token by fetching /auth/me.
    api
      .get<{ user: AuthUser } | AuthUser>("/auth/me")
      .then((res) => {
        const u = (res as { user?: AuthUser }).user ?? (res as AuthUser);
        if (u) setUser(u);
      })
      .catch(() => {
        // Token invalid/expired — clear + redirect.
        clearAuth();
        if (pathname && !PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
          router.replace(ROUTES.login);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, accessToken, pathname]);

  /** Login with email + password. */
  async function login(payload: LoginPayload): Promise<AuthUser> {
    setAuthLoading(true);
    try {
      const res = await api.post<AuthResponse>("/auth/login", payload);
      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
      });

      // Fetch the distributor profile (best-effort — the user may not yet
      // be linked to a distributor record).
      try {
        const dist = await api.get<Distributor>(`/distributors/by-user/${res.user.id}`);
        if (dist) {
          setDistributor(dist as never);
        }
      } catch {
        // Not a distributor yet — that's OK, the UI handles the null case.
      }

      return res.user;
    } finally {
      setAuthLoading(false);
    }
  }

  /** Register a new account (optionally with a sponsor code). */
  async function register(payload: RegisterPayload): Promise<AuthUser> {
    setAuthLoading(true);
    try {
      const res = await api.post<AuthResponse>("/auth/register", payload);
      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
      });
      return res.user;
    } finally {
      setAuthLoading(false);
    }
  }

  /** Logout — invalidate caches, clear store, redirect. */
  async function logout() {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // Best-effort — even if the server call fails we still clear locally.
    }
    queryClient.clear();
    clearAuth();
    router.replace(ROUTES.login);
  }

  return {
    user,
    distributor,
    accessToken,
    isAuthenticated,
    hydrated,
    authLoading,
    login,
    register,
    logout,
    setUser,
    setDistributor,
  };
}

/**
 * Re-export of `useQuery` for the current user — useful for components
 * that need to refetch the user (e.g. after profile edits).
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: () => api.get<AuthUser>("/auth/me"),
    enabled: false, // manually triggered
  });
}
