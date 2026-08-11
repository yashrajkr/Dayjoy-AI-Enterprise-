"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, AuthTokens } from "@/types/auth.types";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * Auth store — owns the current user, JWT tokens, and the
 * `isAuthenticated` flag. Persisted to `localStorage` so a refresh
 * doesn't log the customer out (the API client's 401 interceptor
 * handles expired tokens).
 *
 * The actual login / register / refresh network calls live in
 * `src/lib/auth-service.ts` (called by `useAuth()`); this store only
 * holds the *result*.
 */

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Set on app boot while we rehydrate the session (me() call). */
  isHydrating: boolean;

  setSession: (user: User, tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  setTokens: (tokens: AuthTokens) => void;
  setLoading: (loading: boolean) => void;
  setHydrating: (hydrating: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrating: true,

      setSession: (user, tokens) =>
        set({ user, tokens, isAuthenticated: true, isHydrating: false }),

      setUser: (user) => set({ user }),

      setTokens: (tokens) => set({ tokens, isAuthenticated: true }),

      setLoading: (isLoading) => set({ isLoading }),

      setHydrating: (isHydrating) => set({ isHydrating }),

      logout: () =>
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          isLoading: false,
          isHydrating: false,
        }),
    }),
    {
      name: STORAGE_KEYS.USER,
      storage: createJSONStorage(() => localStorage),
      // Only persist the user + tokens; transient flags reset on reload.
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
