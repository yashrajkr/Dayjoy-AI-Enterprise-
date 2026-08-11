"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STORAGE_KEYS } from "@/lib/constants";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

/**
 * Theme store — mirrors `next-themes`'s resolved theme on the Zustand
 * side so non-component code (e.g. hooks that need the *current* theme
 * synchronously) can read it. `next-themes` is still the source of
 * truth for the actual `<html class>` attribute.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const current = get().theme;
        const next: ThemeMode =
          current === "light" ? "dark" : current === "dark" ? "system" : "light";
        set({ theme: next });
      },
    }),
    {
      name: STORAGE_KEYS.THEME,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
