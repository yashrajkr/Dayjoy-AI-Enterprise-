/**
 * Performance utilities — code splitting, image props, debounce /
 * throttle helpers, prefetch hints, and Core Web Vitals observers.
 *
 * These helpers are framework-agnostic TypeScript: pure functions and
 * React-friendly lazy wrappers. They can be imported from any client
 * or server component without side effects.
 */

import * as React from "react";

// ============================================================================
// 1. Lazy component wrappers
// ============================================================================

/**
 * `lazy` — Next.js `dynamic()` re-export with sensible defaults.
 *
 * ```ts
 * const LazyChart = lazy(() => import("./charts/line-chart"), {
 *   loading: () => <div className="h-[300px] animate-pulse rounded bg-muted" />,
 * });
 * ```
 *
 * NOTE: we use Next's `next/dynamic` directly in consumer apps so this
 * helper here just keeps the import surface stable.
 */
export function lazy<
  T extends React.ComponentType<unknown>,
>(loader: () => Promise<{ default: T }>): React.LazyExoticComponent<T> {
  return React.lazy(loader);
}

/**
 * Build a skeleton loading placeholder matching the natural height
 * of the to-be-loaded component.
 */
export function makeSkeleton(heightClass = "h-[300px]") {
  return function Skeleton() {
    return (
      <div
        className={`${heightClass} w-full animate-pulse rounded-lg bg-muted`}
        aria-hidden="true"
      />
    );
  };
}

// ============================================================================
// 2. Image helpers
// ============================================================================

export interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  sizes?: string;
  priority?: boolean;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
}

/**
 * `getImageProps` — returns the standard props object for a Next.js
 * `<Image>` component. Centralises our default quality, sizes, and
 * placeholder strategy so every image across every portal renders
 * consistently.
 *
 * @example
 *   <Image {...getImageProps("/hero.png", "Hero")} />
 */
export function getImageProps(
  src: string,
  alt: string,
  overrides: Partial<OptimizedImageProps> = {},
): OptimizedImageProps {
  return {
    src,
    alt,
    width: 800,
    height: 600,
    quality: 75,
    placeholder: "empty",
    sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
    ...overrides,
  };
}

// A 1×1 transparent PNG used as a generic blur placeholder.
export const BLANK_BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ============================================================================
// 3. Debounce + throttle
// ============================================================================

/**
 * `debounce` — delay invocation until `delay`ms have elapsed since
 * the last call. Use for search inputs, autosave, etc.
 *
 * The returned function has a `.cancel()` method to clear any
 * pending call.
 *
 * @example
 *   const debouncedSearch = debounce((q) => fetch(`/api/search?q=${q}`), 250);
 *   <input onChange={(e) => debouncedSearch(e.target.value)} />
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T & { cancel: () => void };
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return debounced;
}

/**
 * `throttle` — invoke at most once per `limit`ms. Use for scroll,
 * resize, mousemove.
 *
 * The leading edge fires immediately; the trailing edge fires the
 * last call. Returns a function with `.cancel()`.
 */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  limit: number,
): T & { cancel: () => void } {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  const throttled = ((...args: Parameters<T>) => {
    if (inThrottle) {
      lastArgs = args;
      return;
    }
    fn(...args);
    inThrottle = true;
    setTimeout(() => {
      inThrottle = false;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, limit);
  }) as T & { cancel: () => void };
  throttled.cancel = () => {
    inThrottle = false;
    lastArgs = null;
  };
  return throttled;
}

// ============================================================================
// 4. Prefetch hints
// ============================================================================

/**
 * `preloadRoute` — inject a `<link rel="prefetch">` for a route so
 * the Next.js router can hydrate it instantly on click. Safe to call
 * on hover or focus.
 *
 * Duplicate links are de-duplicated by `href`.
 *
 * @example
 *   <Link href="/x" onMouseEnter={() => preloadRoute("/x")}>X</Link>
 */
export function preloadRoute(href: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  link.as = "document";
  document.head.appendChild(link);
}

/**
 * `preloadImage` — warm the browser cache for an image URL.
 */
export function preloadImage(src: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[rel="preload"][href="${src}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.href = src;
  link.as = "image";
  document.head.appendChild(link);
}

// ============================================================================
// 5. Core Web Vitals observer
// ============================================================================

export interface WebVitalMetric {
  name: "LCP" | "FID" | "CLS" | "INP" | "FCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  id: string;
}

export interface WebVitalsOptions {
  onMetric?: (metric: WebVitalMetric) => void;
  /** Report immediately vs batched. Default: per-metric. */
  reportAllChanges?: boolean;
}

/**
 * `observeWebVitals` — lightweight Core Web Vitals observer.
 *
 * Uses the browser-native `PerformanceObserver` API for LCP, CLS,
 * FCP, TTFB, and INP. FID is reported as INP on browsers that
 * support it (Chrome 89+). Falls back to no-op on unsupported
 * browsers.
 *
 * Returns a `disconnect()` function to stop observing.
 *
 * @example
 *   const stop = observeWebVitals({
 *     onMetric: (m) => console.log(`${m.name}: ${m.value} (${m.rating})`),
 *   });
 */
export function observeWebVitals(
  options: WebVitalsOptions = {},
): () => void {
  if (typeof window === "undefined" || !("PerformanceObserver" in window)) {
    return () => {};
  }

  const { onMetric, reportAllChanges = false } = options;
  const observers: PerformanceObserver[] = [];
  const clsEntries: PerformanceEntry[] = [];

  const ratingFor = (name: WebVitalMetric["name"], value: number): WebVitalMetric["rating"] => {
    const thresholds: Record<WebVitalMetric["name"], [number, number]> = {
      LCP: [2500, 4000],
      FID: [100, 300],
      CLS: [0.1, 0.25],
      INP: [200, 500],
      FCP: [1800, 3000],
      TTFB: [800, 1800],
    };
    const [good, poor] = thresholds[name];
    if (value <= good) return "good";
    if (value <= poor) return "needs-improvement";
    return "poor";
  };

  const emit = (name: WebVitalMetric["name"], value: number, delta = 0) => {
    onMetric?.({
      name,
      value: Math.round(value * 100) / 100,
      rating: ratingFor(name, value),
      delta,
      id: `${name}-${Date.now()}`,
    });
  };

  // LCP
  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) emit("LCP", last.startTime);
    });
    lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(lcpObs);
  } catch {
    /* unsupported */
  }

  // CLS
  try {
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        clsEntries.push(entry);
        if (!reportAllChanges) continue;
        const value = clsEntries.reduce((sum, e) => {
          const layoutShift = e as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          return !layoutShift.hadRecentInput ? sum + (layoutShift.value ?? 0) : sum;
        }, 0);
        emit("CLS", value);
      }
    });
    clsObs.observe({ type: "layout-shift", buffered: true });
    observers.push(clsObs);
  } catch {
    /* unsupported */
  }

  // FID / INP
  try {
    const fidObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const processing = entry as PerformanceEntry & { processingStart?: number };
        if (entry.entryType === "first-input" && processing.processingStart) {
          emit("FID", processing.processingStart - entry.startTime);
        } else if (entry.entryType === "event") {
          const duration = entry.duration;
          emit("INP", duration, duration);
        }
      }
    });
    fidObs.observe({ type: "first-input", buffered: true });
    fidObs.observe({ type: "event", buffered: true });
    observers.push(fidObs);
  } catch {
    /* unsupported */
  }

  // FCP
  try {
    const fcpObs = new PerformanceObserver((list) => {
      const entry = list.getEntries().find((e) => e.name === "first-contentful-paint");
      if (entry) emit("FCP", entry.startTime);
    });
    fcpObs.observe({ type: "paint", buffered: true });
    observers.push(fcpObs);
  } catch {
    /* unsupported */
  }

  // TTFB
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) emit("TTFB", nav.responseStart - nav.requestStart);
  } catch {
    /* unsupported */
  }

  return () => observers.forEach((o) => o.disconnect());
}

// ============================================================================
// 6. Routed list virtualization helper
// ============================================================================

/**
 * `useInViewport` — observe whether an element is in the viewport.
 * Useful for lazy-loading list rows or images.
 *
 * @example
 *   const { ref, inView } = useInViewport();
 *   <div ref={ref}>{inView ? <HeavyRow /> : null}</div>
 */
export function useInViewport<T extends Element = HTMLDivElement>(
  options: IntersectionObserverInit = { rootMargin: "200px" },
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      options,
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [options]);

  return { ref, inView };
}
