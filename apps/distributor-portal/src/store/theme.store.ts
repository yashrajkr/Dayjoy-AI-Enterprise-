import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Theme store — light/dark/system. Mirrored to the DOM via
 * `next-themes` (which is the actual driver); this store exists so
 * non-component code (middleware, utils) can read the preference.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
      },
    }),
    {
      name: "dp-theme-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
