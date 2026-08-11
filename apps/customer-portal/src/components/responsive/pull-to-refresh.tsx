"use client";

import * as React from "react";
import { RefreshCw, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/mobile";

/**
 * PullToRefresh — a mobile-only gesture wrapper that triggers an
 * `onRefresh` callback when the user pulls down past a threshold
 * while at the top of the scroll container.
 *
 * Desktop users see no UI change; the wrapped content behaves
 * normally. On touch devices we attach `touchstart`/`touchmove`/
 * `touchend` handlers with `{ passive: false }` so we can prevent
 * the native overscroll bounce only when we're about to trigger.
 *
 * ```tsx
 * <PullToRefresh onRefresh={async () => await refetch()}>
 *   <ul>{items.map(...)}</ul>
 * </PullToRefresh>
 * ```
 *
 * Behaviour:
 *  - Only activates when `scrollTop === 0` of the nearest scroll container.
 *  - Pull resistance ~0.5 (you move 2px on screen per 1px of finger move).
 *  - Threshold: 70px. Past it, releasing triggers `onRefresh`.
 *  - While `onRefresh` is pending, the indicator stays open with a spinner.
 *  - Respects `prefers-reduced-motion` (snaps instead of animating).
 *
 * Accessibility:
 *  - The indicator is `aria-hidden` (purely decorative).
 *  - A status `aria-live="polite"` region announces "Refreshing…"
 *    and "Refreshed." for screen-reader users.
 */
export interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void> | void;
  /** Pull distance in px required to trigger. Default 70. */
  threshold?: number;
  /** Pull resistance (0–1). Default 0.5. */
  resistance?: number;
  /** Optional className for the wrapper. */
  className?: string;
  /** Where the indicator appears — top is the only sensible position. */
  indicatorClassName?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 70,
  resistance = 0.5,
  className,
  indicatorClassName,
}: PullToRefreshProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [status, setStatus] = React.useState("");

  const startY = React.useRef<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      const scroller = containerRef.current?.parentElement ?? containerRef.current;
      if (scroller && scroller.scrollTop > 0) return;
      startY.current = e.touches[0]?.clientY ?? null;
    },
    [refreshing],
  );

  const onTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Only preventDefault when we're actually pulling — otherwise
      // we'd block normal scroll-up.
      const next = Math.min(delta * resistance, threshold * 1.5);
      setPull(next);
      if (next > 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [refreshing, resistance, threshold],
  );

  const onTouchEnd = React.useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= threshold && !refreshing) {
      setRefreshing(true);
      setStatus("Refreshing…");
      try {
        await onRefresh();
        setStatus("Refreshed.");
      } catch (err) {
        setStatus("Refresh failed.");
      } finally {
        setRefreshing(false);
        setPull(0);
        // Clear status after a moment so it doesn't linger.
        window.setTimeout(() => setStatus(""), 1500);
      }
    } else {
      setPull(0);
    }
  }, [pull, threshold, refreshing, onRefresh]);

  const showIndicator = pull > 0 || refreshing;
  const progress = Math.min(pull / threshold, 1);
  const overThreshold = pull >= threshold;

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center",
        )}
        style={{
          height: refreshing ? threshold : pull,
          opacity: showIndicator ? 1 : 0,
          transition:
            pull === 0 && !refreshing && !reducedMotion
              ? "height 0.25s ease, opacity 0.25s ease"
              : "none",
        }}
      >
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-transform",
            indicatorClassName,
          )}
          style={{
            transform: `rotate(${progress * 360}deg) scale(${0.7 + progress * 0.3})`,
          }}
        >
          {refreshing ? (
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={cn(
                "h-4 w-4 transition-colors",
                overThreshold ? "text-primary" : "text-muted-foreground",
              )}
            />
          )}
        </div>
      </div>

      <div
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {status}
      </div>

      {children}
    </div>
  );
}
