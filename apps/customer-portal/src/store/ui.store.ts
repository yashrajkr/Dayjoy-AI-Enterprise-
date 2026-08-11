"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * UI store — controls the mobile sidebar drawer visibility and the
 * desktop sidebar collapsed state. Persisted so the customer's
 * preference survives refreshes.
 */
interface UIState {
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  setMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      mobileNavOpen: false,
      sidebarCollapsed: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      toggleMobileNav: () =>
        set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: STORAGE_KEYS.SIDEBAR_COLLAPSED,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
