"use client";

import * as React from "react";

/**
 * Mobile detection + responsive utilities.
 *
 * All hooks in this file are client-only and SSR-safe: they return
 * deterministic defaults during the first render and update on the
 * client after mount, so they can be used freely inside any React
 * Server Component boundary that re-renders into a Client Component.
 */

export const MOBILE_BREAKPOINT = 768; // px — Tailwind `md`
export const TABLET_BREAKPOINT = 1024; // px — Tailwind `lg`

export type Breakpoint = "mobile" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";
export type EffectiveTouch = "coarse" | "fine";

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * useIsMobile — true when viewport < 768px.
 * SSR-safe: returns `false` on the server and during first paint.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check, { passive: true });
    window.addEventListener("orientationchange", check, { passive: true });
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, [breakpoint]);

  return isMobile;
}

/**
 * useBreakpoint — coarse-grained breakpoint tracker.
 * - mobile    : width < 768
 * - tablet    : 768 ≤ width < 1024
 * - desktop   : width ≥ 1024
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = React.useState<Breakpoint>("desktop");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      const w = window.innerWidth;
      if (w < MOBILE_BREAKPOINT) setBp("mobile");
      else if (w < TABLET_BREAKPOINT) setBp("tablet");
      else setBp("desktop");
    };
    check();
    window.addEventListener("resize", check, { passive: true });
    window.addEventListener("orientationchange", check, { passive: true });
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return bp;
}

/**
 * useOrientation — "portrait" or "landscape", updated on resize.
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = React.useState<Orientation>("portrait");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      setOrientation(window.innerHeight > window.innerWidth ? "portrait" : "landscape");
    };
    check();
    window.addEventListener("resize", check, { passive: true });
    window.addEventListener("orientationchange", check, { passive: true });
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return orientation;
}

/**
 * useSafeAreaInsets — exposes the iOS/Android notch + home-indicator
 * insets. Reads from CSS env() variables via getComputedStyle on
 * document.documentElement. Returns 0,0,0,0 on devices without a
 * notch or before mount.
 */
export function useSafeAreaInsets(): SafeAreaInsets {
  const [insets, setInsets] = React.useState<SafeAreaInsets>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const parse = (v: string) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
      };
      setInsets({
        top: parse(style.getPropertyValue("--safe-area-inset-top") || "0"),
        bottom: parse(style.getPropertyValue("--safe-area-inset-bottom") || "0"),
        left: parse(style.getPropertyValue("--safe-area-inset-left") || "0"),
        right: parse(style.getPropertyValue("--safe-area-inset-right") || "0"),
      });
    };
    read();
    window.addEventListener("resize", read, { passive: true });
    window.addEventListener("orientationchange", read, { passive: true });
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);

  return insets;
}

/**
 * usePrefersReducedMotion — mirrors `prefers-reduced-motion: reduce`.
 * Use this to disable animations for users who request reduced motion.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

/**
 * usePrefersDarkMode — mirrors `prefers-color-scheme: dark`.
 */
export function usePrefersDarkMode(): boolean {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return dark;
}

/**
 * useViewportSize — returns the current `{ width, height }` of the
 * viewport, throttled via rAF to avoid layout thrash.
 */
export function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return size;
}

/**
 * useIsTouchDevice — true when the primary input is "coarse" (touch).
 */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return touch;
}

/**
 * useOnlineStatus — navigator.onLine + window online/offline events.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
