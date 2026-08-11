"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuthStore } from "@/store/auth.store";
import type {
  AuthSession,
  CurrentUser,
  Employee,
} from "@/types/employee.types";

interface LoginPayload {
  email: string;
  password: string;
  tenantId?: string;
}

/**
 * Auth hook — wraps login, profile rehydration (`GET /api/users/me`),
 * and logout around the persisted `useAuthStore`.
 */
export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const employee = useAuthStore((s) => s.employee);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const setSession = useAuthStore((s) => s.setSession);
  const setEmployee = useAuthStore((s) => s.setEmployee);
  const logoutStore = useAuthStore((s) => s.logout);

  // Rehydrate current user from `/api/users/me` if we have a token but no
  // employee yet (e.g. after a hard refresh that wiped the user slice).
  const { refetch: refetchMe } = useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: () => api.get<CurrentUser>("/users/me"),
    enabled: !!accessToken && !employee,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (accessToken && !employee) {
      refetchMe()
        .then((res) => {
          if (res.data) {
            setEmployee(res.data as Employee);
          }
        })
        .catch(() => {
          /* handled by interceptor */
        });
    }
  }, [accessToken, employee, refetchMe, setEmployee]);

  const loginMutation = useMutation({
    mutationFn: (payload: LoginPayload) =>
      api.post<AuthSession>("/auth/login", payload),
    onSuccess: (session) => {
      setSession({
        employee: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
      });
      queryClient.setQueryData(QUERY_KEYS.me, session.user);
      toast.success(`Welcome, ${session.user.firstName ?? "back"}!`);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => {
      if (!accessToken) return Promise.resolve();
      return api
        .post("/auth/logout")
        .catch(() => undefined);
    },
    onSettled: () => {
      logoutStore();
      queryClient.clear();
      router.replace("/login");
    },
  });

  const login = useCallback(
    async (email: string, password: string, _remember?: boolean) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  return {
    employee,
    accessToken,
    isAuthenticated: !!accessToken && !!employee,
    isHydrated,
    isLoading: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    login,
    logout,
    refetchMe,
  };
}
