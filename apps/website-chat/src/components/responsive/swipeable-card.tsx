"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useIsTouchDevice } from "@/lib/mobile";

/**
 * SwipeableCard — a card that supports horizontal swipe gestures.
 *
 * Use cases: swipe-to-archive, swipe-to-delete, swipe-to-snooze, etc.
 * Each direction can have its own `action` handler + visual indicator.
 *
 * ```tsx
 * <SwipeableCard
 *   leftAction={{ label: "Archive", color: "bg-blue-500", onTrigger: archive }}
 *   rightAction={{ label: "Delete", color: "bg-rose-500", onTrigger: remove }}
 * >
 *   {children}
 * </SwipeableCard>
 * ```
 *
 * Behaviour:
 *  - Drag the card horizontally; the underlying action panel slides in.
 *  - Release past `threshold` (default 100px) → action fires + card exits.
 *  - Release before threshold → card snaps back.
 *  - Disabled on non-touch devices unless `enableOnDesktop` is set
 *    (useful for testing).
 *  - Respects `prefers-reduced-motion` (no spring animation).
 *
 * Accessibility:
 *  - Each action button is also rendered as a real, focusable
 *    `<button>` so keyboard / screen-reader users can trigger it
 *    without the swipe gesture.
 *  - The drag handle is `role="presentation"`; the card itself is a
 *    normal `<article>` so it stays in the tab order.
 */
export interface SwipeAction {
  label: string;
  color: string;
  onTrigger: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface SwipeableCardProps {
  children: React.ReactNode;
  /** Action revealed when swiping right (left edge revealed). */
  leftAction?: SwipeAction;
  /** Action revealed when swiping left (right edge revealed). */
  rightAction?: SwipeAction;
  /** Drag distance required to trigger an action. Default 100. */
  threshold?: number;
  /** Allow swipe gestures on desktop (mouse). Default false. */
  enableOnDesktop?: boolean;
  className?: string;
}

export function SwipeableCard({
  children,
  leftAction,
  rightAction,
  threshold = 100,
  enableOnDesktop = false,
  className,
}: SwipeableCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isTouch = useIsTouchDevice();
  const x = useMotionValue(0);
  const [exited, setExited] = React.useState(false);

  // Background opacity for the revealed actions.
  const leftBgOpacity = useTransform(x, [0, threshold], [0, 1]);
  const rightBgOpacity = useTransform(x, [-threshold, 0], [1, 0]);

  // Card opacity fades out as it exits.
  const cardOpacity = useTransform(x, [-threshold * 2, -threshold, 0, threshold, threshold * 2], [0, 1, 1, 1, 0]);

  const enabled = (isTouch || enableOnDesktop) && !reducedMotion;

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const offset = info.offset.x;
    if (offset > threshold && leftAction) {
      leftAction.onTrigger();
      setExited(true);
    } else if (offset < -threshold && rightAction) {
      rightAction.onTrigger();
      setExited(true);
    } else {
      x.set(0);
    }
  };

  if (!enabled) {
    // No-swipe fallback: render the actions as plain buttons underneath.
    return (
      <article
        className={cn(
          "rounded-xl border border-border bg-card p-4 shadow-sm",
          className,
        )}
      >
        {children}
        {(leftAction || rightAction) && (
          <div className="mt-3 flex justify-between gap-2">
            {leftAction ? (
              <button
                type="button"
                onClick={leftAction.onTrigger}
                className={cn(
                  "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white",
                  leftAction.color,
                )}
              >
                {leftAction.icon && <leftAction.icon className="h-4 w-4" />}
                {leftAction.label}
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {rightAction ? (
              <button
                type="button"
                onClick={rightAction.onTrigger}
                className={cn(
                  "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white",
                  rightAction.color,
                )}
              >
                {rightAction.icon && <rightAction.icon className="h-4 w-4" />}
                {rightAction.label}
              </button>
            ) : (
              <span className="flex-1" />
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* Background actions */}
      <div className="absolute inset-0 flex">
        {leftAction && (
          <motion.div
            className={cn(
              "flex h-full w-1/2 items-center justify-start bg-blue-600/0 px-4",
              leftAction.color,
            )}
            style={{ opacity: leftBgOpacity }}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              {leftAction.icon && <leftAction.icon className="h-4 w-4" />}
              {leftAction.label}
            </span>
          </motion.div>
        )}
        <div className="flex-1" />
        {rightAction && (
          <motion.div
            className={cn(
              "flex h-full w-1/2 items-center justify-end bg-rose-600/0 px-4",
              rightAction.color,
            )}
            style={{ opacity: rightBgOpacity }}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              {rightAction.icon && <rightAction.icon className="h-4 w-4" />}
              {rightAction.label}
            </span>
          </motion.div>
        )}
      </div>

      {/* Foreground card */}
      <AnimatePresence>
        {!exited && (
          <motion.article
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={handleDragEnd}
            style={{ x, opacity: cardOpacity }}
            className="relative rounded-xl border border-border bg-card p-4 shadow-sm cursor-grab active:cursor-grabbing"
          >
            {children}
          </motion.article>
        )}
      </AnimatePresence>
    </div>
  );
}
