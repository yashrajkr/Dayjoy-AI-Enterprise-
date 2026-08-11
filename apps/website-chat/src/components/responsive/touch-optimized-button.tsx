"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * TouchOptimizedButton — a button that guarantees a ≥44×44px touch
 * target on touch devices (WCAG 2.1 AA + Apple/Google guidelines).
 *
 * It renders as a normal-sized button on desktop (looks identical to
 * the default `<Button>`) but expands its hit area on touch devices
 * without changing the visual size — using an absolutely-positioned
 * overlay span (we use a wrapping span for cross-browser reliability).
 *
 * ```tsx
 * <TouchOptimizedButton onClick={...}>Save</TouchOptimizedButton>
 * <TouchOptimizedButton asChild>
 *   <Link href="/x">Go</Link>
 * </TouchOptimizedButton>
 * ```
 *
 * The `touchOnly` prop forces the larger target only on touch devices
 * (default `false` — always ≥44px since it's harmless on desktop).
 */
export interface TouchOptimizedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  /** Visual size class — does NOT affect touch target. */
  sizeClassName?: string;
  /** Force minimum 44×44 only on coarse pointers. Default false. */
  touchOnly?: boolean;
}

export const TouchOptimizedButton = React.forwardRef<
  HTMLButtonElement,
  TouchOptimizedButtonProps
>(
  (
    {
      className,
      children,
      asChild = false,
      sizeClassName = "h-10 px-4 py-2",
      touchOnly = false,
      ...rest
    },
    ref,
  ) => {
    const base = cn(
      "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-40",
      sizeClassName,
      className,
    );

    // Touch-target wrapper — an absolutely-positioned layer that
    // extends the click area to 44×44 minimum.
    const touchTarget = (
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          touchOnly ? "min-h-[44px] min-w-[44px] [@media(pointer:coarse)]:block" : "min-h-[44px] min-w-[44px]",
        )}
      />
    );

    if (asChild) {
      // When `asChild`, we clone the single child element with our
      // className merged in. The CSS in globals.css enforces 44×44
      // touch targets on `pointer: coarse` devices, so we don't need
      // the absolute overlay here — the child element itself becomes
      // the touch target.
      const child = React.Children.only(children) as React.ReactElement<{
        className?: string;
      }>;
      // eslint-disable-next-line react-hooks/refs
      return React.cloneElement(child, {
        ...rest,
        className: cn(base, "touch-manipulation", child.props.className),
        ref,
      } as React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> });
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn(base, "touch-manipulation")}
        {...rest}
      >
        {touchTarget}
        <span className="relative z-10 inline-flex items-center gap-2">
          {children}
        </span>
      </button>
    );
  },
);

TouchOptimizedButton.displayName = "TouchOptimizedButton";
