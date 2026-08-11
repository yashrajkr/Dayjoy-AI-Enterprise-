"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveGrid — a CSS Grid wrapper that adjusts its column count
 * by breakpoint. 1 column on mobile, 2 on tablet, 3-4 on desktop.
 *
 * ```tsx
 * <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
 *   <Card>...</Card>
 *   <Card>...</Card>
 *   <Card>...</Card>
 * </ResponsiveGrid>
 * ```
 *
 * For more granular control (e.g. 1 → 2 → 4), pass `cols` as a
 * partial — unspecified breakpoints fall back to the previous tier.
 */
export type ResponsiveGridCols = {
  mobile?: 1 | 2;
  tablet?: 1 | 2 | 3;
  desktop?: 1 | 2 | 3 | 4 | 5 | 6;
};

export interface ResponsiveGridProps {
  children: React.ReactNode;
  cols?: ResponsiveGridCols;
  /** Gap between cells — Tailwind class. Default `gap-4`. */
  gapClassName?: string;
  className?: string;
  /** Equalise row heights (default true). */
  equalRows?: boolean;
}

const COLS_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const SM_COLS_CLASS: Record<1 | 2 | 3, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

const LG_COLS_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

export function ResponsiveGrid({
  children,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gapClassName = "gap-4",
  className,
  equalRows = true,
}: ResponsiveGridProps) {
  const mobile = cols.mobile ?? 1;
  const tablet = cols.tablet ?? mobile;
  const desktop = cols.desktop ?? (tablet as 1 | 2 | 3 | 4 | 5 | 6);

  return (
    <div
      className={cn(
        "grid",
        COLS_CLASS[mobile],
        SM_COLS_CLASS[(tablet <= 3 ? tablet : 3) as 1 | 2 | 3],
        LG_COLS_CLASS[desktop],
        gapClassName,
        equalRows && "auto-rows-fr",
        className,
      )}
    >
      {children}
    </div>
  );
}
