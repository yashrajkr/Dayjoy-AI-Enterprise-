"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Employee } from "@/types/employee.types";
import { STORAGE_KEYS } from "@/lib/constants";
import { clearAuthStorage } from "@/lib/api";

interface AuthState {
  employee: Employee | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isHydrated: boolean;

  setSession: (payload: {
    employee: Employee;
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }) => void;
  setEmployee: (employee: Employee) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      employee: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isAuthenticated: false,
      isHydrated: false,

      setSession: ({ employee, accessToken, refreshToken, expiresIn }) =>
        set({
          employee,
          accessToken,
          refreshToken: refreshToken ?? null,
          expiresAt: expiresIn
            ? Date.now() + expiresIn * 1000
            : null,
          isAuthenticated: true,
        }),

      setEmployee: (employee) => set({ employee }),

      logout: () => {
        clearAuthStorage();
        set({
          employee: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          isAuthenticated: false,
        });
      },

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: STORAGE_KEYS.USER,
      storage: createJSONStorage(() => localStorage),
      // Persist only the employee + tokens. `isHydrated` is transient.
      partialize: (state) => ({
        employee: state.employee,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
