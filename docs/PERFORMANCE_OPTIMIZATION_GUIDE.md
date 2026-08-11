# Performance Optimization Guide — Dayjoy AI Enterprise Portals

> Applies to: `apps/admin-dashboard`, `apps/customer-portal`,
> `apps/distributor-portal`, `apps/employee-portal`, `apps/website-chat`.

This guide documents the performance budget, optimisation
techniques, and measurement strategy for every Dayjoy AI portal.
The goal: **a Tier-1 page on a mid-tier Android phone on 4G must
feel instant.**

---

## 1. Core Web Vitals targets

| Metric | Good | Needs improvement | Poor | Our target |
|--------|------|-------------------|------|------------|
| **LCP** (Largest Contentful Paint) | <2.5s | 2.5–4s | >4s | <2.0s |
| **INP** (Interaction to Next Paint) | <200ms | 200–500ms | >500ms | <150ms |
| **CLS** (Cumulative Layout Shift) | <0.1 | 0.1–0.25 | >0.25 | <0.05 |
| **FCP** (First Contentful Paint) | <1.8s | 1.8–3s | >3s | <1.2s |
| **TTFB** (Time to First Byte) | <800ms | 0.8–1.8s | >1.8s | <500ms |

These targets are enforced via Lighthouse CI on every PR (see
`MOBILE_TESTING_STRATEGY.md` §8).

---

## 2. Performance budget

Per portal, measured on production build, gzipped:

| Asset class | Budget | Notes |
|-------------|--------|-------|
| Initial JS (per route) | ≤150 KB | Excludes Next.js framework |
| Initial CSS | ≤30 KB | Tailwind purged |
| Initial JS + CSS | ≤200 KB | Total critical bytes |
| Per-page image | ≤100 KB | WebP / AVIF |
| Web font | ≤80 KB | `next/font` subset |
| Total page weight | ≤500 KB | First load, any Tier-1 route |
| Lighthouse perf | ≥90 | Mobile, Slow 4G |

When a route exceeds its budget, the PR is blocked until the
author either reduces the bundle or files an ADR explaining why
the exception is acceptable.

---

## 3. Code splitting

### 3.1 `next/dynamic` for heavy components

Charts, editors, maps, and other heavy components should be
dynamically imported so they don't bloat the initial bundle:

```tsx
import dynamic from "next/dynamic";

const LazyChart = dynamic(() => import("@/components/charts/line-chart"), {
  loading: () => <div className="h-[300px] animate-pulse rounded bg-muted" />,
  ssr: false, // Charts often need window; SSR just wastes time.
});

// Usage
<LazyChart data={...} />
```

The `loading` placeholder must reserve the same height as the
loaded component to avoid CLS.

### 3.2 What to lazy-load (per portal)

| Component | Why | Portal |
|-----------|-----|--------|
| Recharts chart wrappers | Recharts is ~95 KB gz | admin, distributor, employee |
| Three.js particle field | Three.js is ~150 KB gz | admin-dashboard |
| JSON editor (settings) | Heavy code editor | admin-dashboard |
| PDF preview | `pdf.js` is ~300 KB | admin, customer |
| Voice recorder | AudioCapture API + visualizer | customer, employee |
| DataTable with virtualization | TanStack Table is ~25 KB | all |

### 3.3 Route-level splitting

Next.js App Router automatically code-splits per route. Avoid
importing heavy server-only modules in client components —
Next.js will warn but won't always tree-shake correctly.

---

## 4. Image optimization

### 4.1 Always use `next/image`

```tsx
import Image from "next/image";
import { getImageProps } from "@/lib/performance";

<Image {...getImageProps("/hero.png", "Hero image", {
  width: 1280,
  height: 720,
  priority: true,
})} />
```

`getImageProps` centralises our default quality (75), sizes
hint, and placeholder strategy.

### 4.2 Use the right format

| Format | When | Savings |
|--------|------|---------|
| **AVIF** | Hero images, photos | ~50% vs JPEG |
| **WebP** | Fallback for AVIF | ~30% vs JPEG |
| **PNG** | UI screenshots with text | Lossless |
| **SVG** | Icons, logos, illustrations | Resolution-independent |

Next.js `<Image>` automatically serves AVIF/WebP with a JPEG
fallback based on the `Accept` header.

### 4.3 Lazy-load below the fold

`<Image>` defaults to `loading="lazy"`. Only the LCP image should
be `priority`:

```tsx
<Image src="/hero.png" alt="Hero" width={1280} height={720} priority />
```

### 4.4 Always set `width` + `height`

This reserves the box before the image loads, preventing CLS.

---

## 5. Font optimization

Use `next/font/google` exclusively. It:

1. Self-hosts the font (no third-party request).
2. Subsets to the requested `unicode-range`.
3. Adds `font-display: swap` automatically.
4. Preloads the woff2.

```tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
```

**Don't** load more than 2 fonts (1 sans + 1 mono is plenty).
**Don't** load full character sets unless needed.

---

## 6. Caching strategies

### 6.1 React Query (client-side)

Default options (set in `Providers`):

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 minute
      gcTime: 5 * 60_000,       // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: { retry: 0 },
  },
});
```

Bump `staleTime` for slow-changing data (catalog, FAQs):
`staleTime: 5 * 60_000` (5 minutes).

### 6.2 Browser cache (via Service Worker)

The service worker (`public/sw.js`) implements:

- **App shell** — cached on install, served cache-first.
- **Static assets** (JS, CSS, fonts, images) — cache-first.
- **Navigations** — network-first → cache → `/offline`.
- **API requests** — never cached (user data).

Bump `CACHE_VERSION` on every deploy to invalidate old caches.

### 6.3 CDN cache

Static assets served from Next.js `/_next/static/*` are
fingerprinted with a content hash. Cache them for 1 year
immutable:

```
Cache-Control: public, max-age=31536000, immutable
```

HTML is `no-cache` (revalidated on every request).

---

## 7. Prefetching

### 7.1 Route prefetch on hover

```tsx
import { preloadRoute } from "@/lib/performance";

<Link href="/x" onMouseEnter={() => preloadRoute("/x")}>X</Link>
```

This injects `<link rel="prefetch" href="/x">` so the Next.js
router can hydrate instantly on click.

### 7.2 Next.js Link auto-prefetch

`<Link>` from `next/link` auto-prefetches when it enters the
viewport. Disable for non-essential links:

```tsx
<Link href="/settings" prefetch={false}>Settings</Link>
```

### 7.3 Image preload

```tsx
import { preloadImage } from "@/lib/performance";

// In a component, before navigating to a gallery page:
preloadImage("/hero.png");
```

---

## 8. Debounce + throttle

### 8.1 Search inputs — debounce 250ms

```tsx
import { debounce } from "@/lib/performance";

const debouncedSearch = React.useMemo(
  () => debounce((q: string) => fetch(`/api/search?q=${q}`), 250),
  [],
);

<input onChange={(e) => debouncedSearch(e.target.value)} />
```

### 8.2 Scroll / resize — throttle 100ms

```tsx
import { throttle } from "@/lib/performance";

const onScroll = React.useMemo(
  () => throttle(() => updateProgressBar(), 100),
  [],
);

<div onScroll={onScroll} />
```

For resize, prefer the `useViewportSize` hook (already rAF-
throttled internally).

---

## 9. Virtualization

Any list longer than 100 rows must be virtualized. Use
`@tanstack/react-virtual` (already in the workspace):

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 56,
  overscan: 5,
});
```

The `<ResponsiveTable>` component doesn't virtualize by default
— wrap it in a virtualizer if your row count exceeds 100.

---

## 10. Skeleton loading (perceived performance)

Use a skeleton that matches the loaded layout's height so there's
no CLS:

```tsx
{isLoading ? (
  <div className="space-y-2">
    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
    <div className="h-8 w-full animate-pulse rounded bg-muted" />
    <div className="h-8 w-full animate-pulse rounded bg-muted" />
  </div>
) : (
  <RealContent />
)}
```

For dynamic imports:

```tsx
const LazyChart = dynamic(() => import("./chart"), {
  loading: () => <div className="h-[300px] animate-pulse rounded bg-muted" />,
});
```

---

## 11. Render performance

### 11.1 `React.memo` for expensive children

Wrap list rows, chart wrappers, and any component that re-renders
on parent state changes but whose props rarely change:

```tsx
const Row = React.memo(function Row({ item }: { item: Item }) {
  return <tr>...</tr>;
});
```

### 11.2 `useMemo` + `useCallback` for derived data

```tsx
const sorted = React.useMemo(
  () => items.slice().sort(byDate),
  [items],
);

const onSelect = React.useCallback(
  (id: string) => setSelected(id),
  [],
);
```

### 11.3 Avoid layout thrash

- Use `transform` + `opacity` for animations (GPU-accelerated).
- Avoid animating `top/left/width/height`.
- Use `will-change: transform` sparingly — only on elements
  currently animating.

---

## 12. Bundle analysis

Run on every release:

```bash
ANALYZE=true next build
# or
npx @next/bundle-analyzer
```

Inspect the treemap:

- **Vendors > 100 KB?** Lazy-load or replace.
- **Server-only code in client bundle?** Move to server
  component or `server-only` package.
- **Duplicate dependencies?** Dedupe via `pnpm` overrides.
- **Locale files** — only ship the user's locale.

---

## 13. Core Web Vitals observer

`@/lib/performance` ships `observeWebVitals()` — wire it up in
the root layout to log metrics to the console (dev) or your
analytics backend (prod):

```tsx
import { observeWebVitals } from "@/lib/performance";

useEffect(() => {
  const stop = observeWebVitals({
    onMetric: (m) => {
      if (process.env.NODE_ENV === "production") {
        // Send to Sentry / PostHog / Datadog RUM.
        navigator.sendBeacon("/api/vitals", JSON.stringify(m));
      } else {
        console.log(`[vitals] ${m.name}: ${m.value} (${m.rating})`);
      }
    },
    reportAllChanges: true,
  });
  return stop;
}, []);
```

---

## 14. Mobile-specific optimisations

| Technique | Where | Impact |
|-----------|-------|--------|
| `100dvh` instead of `100vh` | `globals.css` | No iOS URL bar jitter |
| `passive: true` on scroll listeners | `useIsMobile` etc. | Smoother scroll |
| `font-size: 16px` on inputs | `globals.css` | No iOS auto-zoom |
| `touch-action: manipulation` | `globals.css` | No 300ms tap delay |
| `overscroll-behavior: contain` | Scroll containers | No Chrome pull-to-refresh hijack |
| `content-visibility: auto` | Long lists | Skips off-screen rendering |
| `IntersectionObserver` lazy-load | `useInViewport` hook | Skips off-screen heavy work |

---

## 15. Anti-patterns (don't do this)

❌ **Don't** `await` in a Server Component body without `Suspense`
   — it blocks the whole route.

❌ **Don't** import the entire `date-fns` — use specific functions:
   `import { format } from "date-fns"`.

❌ **Don't** inline images as base64 in CSS — they bypass
   `next/image` optimisation.

❌ **Don't** use `useEffect` for derived state — use `useMemo`.

❌ **Don't** set state in a render cycle (it triggers a re-render
   loop).

❌ **Don't** use `axios` for streaming — use `fetch` + ReadableStream.

❌ **Don't** ship `moment.js` — it's 67 KB gz. Use `date-fns`.

❌ **Don't** import `lodash` wholesale — import specific fns:
   `import debounce from "lodash/debounce"`.

❌ **Don't** leave `console.log` in production code — the build
   strips them, but they slow down TS compile.

❌ **Don't** use `<img>` instead of `<Image>` (unless the image
   is from a third-party domain you can't configure).

---

## 16. Measurement cadence

| Cadence | What | Tool |
|---------|------|------|
| Every PR | Lighthouse CI mobile | GitHub Actions |
| Every PR | Bundle size | `@next/bundle-analyzer` |
| Daily | Synthetic RUM (3 scripted journeys) | Better Stack / Pingdom |
| Real user | Web Vitals from real sessions | `observeWebVitals` + analytics |
| Pre-release | Manual Lighthouse on 5 Tier-1 pages | Chrome DevTools |

---

## 17. Performance debt register

When a route is over budget but ships anyway, file an entry in
`docs/PERFORMANCE_DEBT.md`:

```markdown
### /dashboard — Initial JS 180 KB (budget 150 KB)

**Owner:** @agent-3
**Reason:** Recharts can't be lazy-loaded (server-rendered chart)
**Plan:** Replace Recharts with lightweight custom SVG chart by 2025-Q1
**Tracked:** https://github.com/.../issues/123
```

Review the register monthly.
