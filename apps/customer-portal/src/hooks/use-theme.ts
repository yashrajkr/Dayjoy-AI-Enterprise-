"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useThemeStore, type ThemeMode } from "@/store/theme.store";

/**
 * `useTheme` (wrapped) — bridges `next-themes` (which owns the actual
 * `<html class>` attribute) with our Zustand theme store (which gives
 * non-component code synchronous access to the *intended* theme).
 *
 * Returns:
 *  - `theme` — the user's chosen mode ("light" | "dark" | "system")
 *  - `resolvedTheme` — the actual rendered theme after system resolution
 *  - `setTheme` / `toggleTheme` — mutations that update both layers
 *  - `mounted` — whether the component has hydrated (avoids SSR mismatch)
 */
export function useAppTheme() {
  const nextTheme = useTheme();
  const storeTheme = useThemeStore((s) => s.theme);
  const setStoreTheme = useThemeStore((s) => s.setTheme);
  const toggleStoreTheme = useThemeStore((s) => s.toggleTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const setTheme = (theme: ThemeMode) => {
    setStoreTheme(theme);
    nextTheme.setTheme(theme);
  };

  const toggleTheme = () => {
    toggleStoreTheme();
    const current = storeTheme;
    const next: ThemeMode =
      current === "light" ? "dark" : current === "dark" ? "system" : "light";
    nextTheme.setTheme(next);
  };

  return {
    theme: nextTheme.theme ?? storeTheme,
    resolvedTheme: nextTheme.resolvedTheme,
    setTheme,
    toggleTheme,
    mounted,
  };
}
