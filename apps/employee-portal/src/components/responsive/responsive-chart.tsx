"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useBreakpoint } from "@/lib/mobile";

/**
 * ResponsiveChart — a `<figure>` wrapper that adjusts its height by
 * breakpoint and provides a consistent title / description / action
 * header. Drop any chart library's `<Chart>` element inside as a
 * child; the wrapper sets a sensible height via CSS and lets the
 * child fill 100% of it.
 *
 * Why not wrap Recharts' `<ResponsiveContainer>` directly?
 *   - Not every portal ships Recharts.
 *   - The wrapper is library-agnostic: pass Recharts, Chart.js,
 *     Visx, D3, or even a plain `<canvas>`.
 *
 * ```tsx
 * <ResponsiveChart
 *   title="Revenue"
 *   description="Last 30 days"
 *   minHeight={320}
 *   mobileHeight={220}
 * >
 *   <LineChart data={...}>...</LineChart>
 * </ResponsiveChart>
 * ```
 *
 * On mobile we set a shorter height so the chart doesn't dominate
 * the small viewport. On desktop, the full `minHeight` is used.
 */
export interface ResponsiveChartProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Container height at desktop (px). Default 320. */
  minHeight?: number;
  /** Container height at mobile (px). Default 220. */
  mobileHeight?: number;
  /** Container height at tablet (px). Defaults to `minHeight`. */
  tabletHeight?: number;
  /** Optional className for the outer card wrapper. */
  className?: string;
  /** Optional action node rendered top-right (e.g. a time-range selector). */
  action?: React.ReactNode;
  /** Hide the legend entirely on mobile. */
  hideLegendOnMobile?: boolean;
  /** Optional aria-label fallback when `title` isn't a string. */
  ariaLabel?: string;
}

export function ResponsiveChart({
  children,
  title,
  description,
  minHeight = 320,
  mobileHeight = 220,
  tabletHeight,
  className,
  action,
  ariaLabel,
}: ResponsiveChartProps) {
  const bp = useBreakpoint();
  const tablet = tabletHeight ?? minHeight;
  const height =
    bp === "mobile" ? mobileHeight : bp === "tablet" ? tablet : minHeight;

  return (
    <figure
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6",
        className,
      )}
      role="figure"
      aria-label={
        (typeof title === "string" ? title : ariaLabel) || "Chart"
      }
    >
      {(title || action) && (
        <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </figcaption>
      )}

      <div
        className="relative w-full"
        style={{ height }}
        // Hint to children that they should fill the wrapper.
        data-chart-container="true"
        data-breakpoint={bp}
      >
        {children}
      </div>
    </figure>
  );
}
