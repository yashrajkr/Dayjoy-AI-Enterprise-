import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthUser } from "@/types/auth.types";
import type { DistributorWithStats } from "@/types/distributor.types";
import { STORAGE_KEYS } from "@/lib/constants";

interface AuthState {
  user: AuthUser | null;
  distributor: DistributorWithStats | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  hydrated: boolean;

  setAuth: (payload: {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
  }) => void;
  setUser: (user: AuthUser) => void;
  setDistributor: (distributor: DistributorWithStats) => void;
  updateDistributor: (
    patch: Partial<DistributorWithStats>,
  ) => void;
  clearAuth: () => void;
  setHydrated: (v: boolean) => void;
}

/**
 * Auth store — holds the JWT pair + the current user + their distributor
 * profile. Persisted to localStorage so a refresh restores the session
 * without an immediate re-fetch (the `useAuth()` hook then re-validates
 * by calling `GET /api/auth/me`).
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      distributor: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isAuthenticated: false,
      hydrated: false,

      setAuth: ({ user, accessToken, refreshToken, expiresIn }) => {
        const expiresAt = expiresIn
          ? Date.now() + expiresIn * 1000
          : Date.now() + 60 * 60 * 1000; // fallback: 1h
        set({
          user,
          accessToken,
          refreshToken,
          expiresAt,
          isAuthenticated: true,
        });

        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
          window.localStorage.setItem(
            STORAGE_KEYS.REFRESH_TOKEN,
            refreshToken,
          );
          window.localStorage.setItem(
            STORAGE_KEYS.TOKEN_EXPIRY,
            String(expiresAt),
          );
          window.localStorage.setItem(
            STORAGE_KEYS.USER,
            JSON.stringify(user),
          );
          // Mirror the access token to a cookie so the server-side
          // middleware (which can't read localStorage) can gate routes.
          const cookieExpiry = new Date(expiresAt).toUTCString();
          window.document.cookie = `dp_access_token=${accessToken}; path=/; expires=${cookieExpiry}; SameSite=Lax`;
        }
      },

      setUser: (user) => {
        set({ user });
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            STORAGE_KEYS.USER,
            JSON.stringify(user),
          );
        }
      },

      setDistributor: (distributor) => {
        set({ distributor });
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            STORAGE_KEYS.DISTRIBUTOR,
            JSON.stringify(distributor),
          );
        }
      },

      updateDistributor: (patch) => {
        const current = get().distributor;
        if (!current) return;
        const next = { ...current, ...patch };
        set({ distributor: next });
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            STORAGE_KEYS.DISTRIBUTOR,
            JSON.stringify(next),
          );
        }
      },

      clearAuth: () => {
        set({
          user: null,
          distributor: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          isAuthenticated: false,
        });
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
          window.localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
          window.localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
          window.localStorage.removeItem(STORAGE_KEYS.USER);
          window.localStorage.removeItem(STORAGE_KEYS.DISTRIBUTOR);
          // Clear the cookie too.
          window.document.cookie =
            "dp_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      },

      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "dp-auth-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        distributor: state.distributor,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
