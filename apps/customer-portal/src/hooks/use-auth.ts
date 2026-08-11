"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/store/auth.store";
import type {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
  User,
  AuthTokens,
  LoginResponse,
  RegisterResponse,
} from "@/types/auth.types";

/**
 * `useAuth` — the single entry point for all authentication operations
 * in the customer portal.
 *
 * - `user` / `isAuthenticated` come from the persisted Zustand store
 *   (instant on first paint).
 * - `login` / `register` / `verifyOtp` mutate via React Query and
 *   hydrate the store on success.
 * - `hasRole` is a convenience guard for role-conditional UI.
 */
export function useAuth() {
  const queryClient = useQueryClient();
  const {
    user,
    tokens,
    isAuthenticated,
    isLoading,
    isHydrating,
    setSession,
    setUser,
    setLoading,
    logout: logoutStore,
  } = useAuthStore();

  // ===== Rehydrate /me on mount =====
  const meQuery = useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: () => api.get<User>("/auth/me"),
    enabled: typeof window !== "undefined" && !!window.localStorage.getItem("cp_access_token"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // ===== Login =====
  const loginMutation = useMutation({
    mutationFn: (dto: LoginDto) =>
      api.post<LoginResponse>("/auth/login", dto),
    onMutate: () => setLoading(true),
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
      queryClient.setQueryData(QUERY_KEYS.me, data.user);
    },
    onError: () => setLoading(false),
    onSettled: () => setLoading(false),
  });

  // ===== Register =====
  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) =>
      api.post<RegisterResponse>("/auth/register", dto),
    onMutate: () => setLoading(true),
    onSuccess: (data) => {
      if (data.tokens) {
        setSession(data.user, data.tokens);
        queryClient.setQueryData(QUERY_KEYS.me, data.user);
      }
    },
    onError: () => setLoading(false),
    onSettled: () => setLoading(false),
  });

  // ===== Forgot password =====
  const forgotPasswordMutation = useMutation({
    mutationFn: (dto: ForgotPasswordDto) =>
      api.post<{ message: string }>("/auth/forgot-password", dto),
  });

  // ===== Reset password =====
  const resetPasswordMutation = useMutation({
    mutationFn: (dto: ResetPasswordDto) =>
      api.post<{ message: string }>("/auth/reset-password", dto),
  });

  // ===== Verify OTP =====
  const verifyOtpMutation = useMutation({
    mutationFn: (dto: VerifyOtpDto) =>
      api.post<{
        message: string;
        tokens?: AuthTokens;
        user?: User;
      }>("/auth/verify-otp", dto),
    onSuccess: (data) => {
      if (data.tokens && data.user) {
        setSession(data.user, data.tokens);
        queryClient.setQueryData(QUERY_KEYS.me, data.user);
      }
    },
  });

  // ===== Resend OTP =====
  const resendOtpMutation = useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string }>("/auth/resend-otp", { email }),
  });

  // ===== Refresh =====
  const refreshMutation = useMutation({
    mutationFn: (refreshToken: string) =>
      api.post<{
        accessToken: string;
        refreshToken?: string;
        expiresAt?: string;
      }>("/auth/refresh", { refreshToken }),
  });

  // ===== Logout =====
  const logout = useCallback(async () => {
    try {
      if (tokens?.refreshToken) {
        await api.post("/auth/logout", { refreshToken: tokens.refreshToken });
      }
    } catch {
      // Best-effort — clear local state regardless.
    } finally {
      logoutStore();
      queryClient.clear();
      if (typeof window !== "undefined") {
        window.location.href = ROUTES.login;
      }
    }
  }, [tokens, logoutStore, queryClient]);

  const hasRole = useCallback(
    (role: string | string[]) => {
      if (!user) return false;
      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(user.role);
    },
    [user],
  );

  return {
    user,
    tokens,
    isAuthenticated,
    isLoading,
    isHydrating: isHydrating && meQuery.isLoading,
    me: meQuery.data,
    hasRole,

    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    forgotPassword: forgotPasswordMutation.mutateAsync,
    resetPassword: resetPasswordMutation.mutateAsync,
    verifyOtp: verifyOtpMutation.mutateAsync,
    resendOtp: resendOtpMutation.mutateAsync,
    refresh: refreshMutation.mutateAsync,
    logout,

    loginError: loginMutation.error,
    registerError: registerMutation.error,
    verifyOtpError: verifyOtpMutation.error,
    resetPasswordError: resetPasswordMutation.error,
    forgotPasswordError: forgotPasswordMutation.error,
  };
}
