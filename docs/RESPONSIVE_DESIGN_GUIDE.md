# Responsive Design Guide — Dayjoy AI Enterprise Portals

> Applies to: `apps/admin-dashboard`, `apps/customer-portal`,
> `apps/distributor-portal`, `apps/employee-portal`, `apps/website-chat`.

This guide documents the responsive design system shared by every
Dayjoy AI Enterprise portal. It is the canonical reference for
authors adding new screens — read it once before writing markup.

---

## 1. Philosophy — Mobile-first

Every screen is designed for **mobile first**, then progressively
enhanced for tablet and desktop. Concretely:

1. Write the mobile layout as the default (no breakpoint prefix).
2. Add `sm:` / `lg:` overrides only to spread things out on larger
   screens.
3. Test on a 360×640 viewport before testing on 1440×900.

This avoids the classic "desktop layout cramped on mobile" trap.

---

## 2. Breakpoints

We use Tailwind's default breakpoint scale. **Only three matter:**

| Token | Width | Tailwind prefix | Dayjoy tier |
|-------|-------|-----------------|-------------|
| Mobile | `<768px` | (default) | `mobile` |
| Tablet | `768–1023px` | `sm:` / `md:` | `tablet` |
| Desktop | `≥1024px` | `lg:` | `desktop` |

Notes:
- The **768px** boundary is the same boundary `useIsMobile()` uses.
- The **1024px** boundary is where the sidebar switches from drawer
  to static aside (`useBreakpoint()` returns `"desktop"`).
- Never use `xl:` or `2xl:` for layout — only for fine typography.

---

## 3. Layout primitives

### 3.1 Root shell — sticky footer

Every page must use the sticky-footer pattern so the footer never
floats above content on short screens.

```tsx
<div className="sticky-footer-wrapper">
  <Header />
  <main>{children}</main>
  <Footer />
</div>
```

The `.sticky-footer-wrapper` class (defined in every portal's
`globals.css`) handles `min-height: 100dvh` + flex column, so on
mobile the footer respects the iOS URL bar.

### 3.2 Sidebar — `<ResponsiveSidebar>`

```tsx
import { ResponsiveSidebar } from "@/components/responsive";

<ResponsiveSidebar>
  <SidebarHeader />
  <SidebarNav items={...} />
</ResponsiveSidebar>
```

Renders a static `<aside>` on desktop (default `264px` wide) and a
slide-in drawer on mobile with a backdrop + Escape-to-close + body
scroll lock. See `responsive-sidebar.tsx` for full prop docs.

### 3.3 Bottom navigation — `<BottomNavigation>`

```tsx
import { BottomNavigation } from "@/components/responsive";

<BottomNavigation
  items={[
    { label: "Home",    href: "/",         icon: Home },
    { label: "Shop",    href: "/products", icon: ShoppingBag },
    { label: "Orders",  href: "/orders",   icon: Package },
    { label: "Support", href: "/support",  icon: LifeBuoy },
    { label: "Profile", href: "/profile",  icon: User },
  ]}
/>
```

Renders a fixed bottom bar **on mobile only**. Respects
`safe-area-inset-bottom` so it never overlaps the iOS home
indicator. Cap to 5 items (Material guideline).

---

## 4. Data display

### 4.1 Tables — `<ResponsiveTable>`

Tables become cards on mobile. Each row is rendered as an
`<article>` with a `<dl>` of label/value pairs so screen readers
announce the structure.

```tsx
<ResponsiveTable
  columns={[
    { key: "name", header: "Name" },
    { key: "email", header: "Email", hideOnMobile: true },
    { key: "role", header: "Role" },
  ]}
  rows={users}
  getRowId={(u) => u.id}
  onRowClick={(u) => router.push(`/users/${u.id}`)}
  emptyState={<EmptyState title="No users" />}
/>
```

**Guideline:** always pass `hideOnMobile` for non-essential columns
so the mobile card isn't cluttered.

### 4.2 Grids — `<ResponsiveGrid>`

```tsx
<ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</ResponsiveGrid>
```

Defaults to `1 / 2 / 3`. Use `cols={{ mobile: 1, tablet: 2, desktop: 4 }}`
for dense dashboards.

### 4.3 Cards — `<ResponsiveCard>`

Padding and heading sizes scale with breakpoint automatically.
Pass `interactive` for clickable cards (adds hover lift + ring).

```tsx
<ResponsiveCard interactive>
  <ResponsiveCard.Header>
    <ResponsiveCard.Title>Revenue</ResponsiveCard.Title>
    <ResponsiveCard.Description>Last 30 days</ResponsiveCard.Description>
  </ResponsiveCard.Header>
  <ResponsiveCard.Content>...</ResponsiveCard.Content>
</ResponsiveCard>
```

### 4.4 Charts — `<ResponsiveChart>`

A library-agnostic `<figure>` wrapper that adjusts height by
breakpoint. Drop any chart inside (Recharts, Chart.js, D3, …).

```tsx
<ResponsiveChart
  title="Revenue"
  description="Last 30 days"
  mobileHeight={220}
  minHeight={320}
>
  <LineChart data={...}>...</LineChart>
</ResponsiveChart>
```

On mobile the chart shrinks to 220px; on desktop it uses 320px. The
wrapper sets `height` on its child container so the chart fills
100%.

---

## 5. Forms — `<ResponsiveForm>`

Stacks vertically on mobile, grid on desktop. Each field is a
`<ResponsiveFormField>` with proper `<label htmlFor>` + `aria-*`.

```tsx
<ResponsiveForm columns={2} onSubmit={handleSubmit}>
  <ResponsiveFormField label="First name" required span={1}>
    <Input />
  </ResponsiveFormField>
  <ResponsiveFormField label="Last name" span={1}>
    <Input />
  </ResponsiveFormField>
  <ResponsiveFormField label="Address" span={2}>
    <Textarea />
  </ResponsiveFormField>
</ResponsiveForm>
```

**iOS quirk:** inputs must be `font-size: 16px` on mobile or iOS
Safari auto-zooms on focus. The shared `globals.css` enforces this.

---

## 6. Touch optimization

### 6.1 Tap targets — minimum 44×44px

WCAG 2.1 AA + Apple/Google guidelines require **44×44px minimum**
touch targets. The shared `globals.css` enforces this for all
`<button>`, `a[role="button"]`, and `[role="button"]` on `pointer:
coarse` devices.

For buttons that don't naturally meet the minimum (icon-only
buttons), use `<TouchOptimizedButton>`:

```tsx
import { TouchOptimizedButton } from "@/components/responsive";

<TouchOptimizedButton onClick={save}>
  <SaveIcon className="h-4 w-4" />
</TouchOptimizedButton>
```

The visual size stays small but the hit area extends to 44×44 via
an absolutely-positioned overlay.

### 6.2 Touch-action

`touch-action: manipulation` is set on every interactive element
in `globals.css` to disable the iOS 300ms tap delay + double-tap
zoom.

---

## 7. Safe-area insets (notch)

iOS devices with a notch or home indicator expose the inset via
`env(safe-area-inset-*)`. The shared `globals.css` maps these to
CSS custom properties:

```css
:root {
  --safe-area-inset-top:    env(safe-area-inset-top, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left:   env(safe-area-inset-left, 0px);
  --safe-area-inset-right:  env(safe-area-inset-right, 0px);
}

body {
  padding-top:    var(--safe-area-inset-top);
  padding-bottom: var(--safe-area-inset-bottom);
  padding-left:   var(--safe-area-inset-left);
  padding-right:  var(--safe-area-inset-right);
}
```

For programmatic access (e.g. positioning a sticky bottom bar
exactly above the home indicator):

```tsx
import { useSafeAreaInsets } from "@/lib/mobile";

const insets = useSafeAreaInsets();
<div style={{ paddingBottom: insets.bottom }} />
```

For the layout's `<meta name="viewport">`, we use
`viewportFit: "cover"` in every portal's `viewport` export so the
web view extends under the notch.

---

## 8. Gestures

### 8.1 Pull-to-refresh — `<PullToRefresh>`

```tsx
import { PullToRefresh } from "@/components/responsive";

<PullToRefresh onRefresh={async () => await refetch()}>
  <ul>{items.map(...)}</ul>
</PullToRefresh>
```

Activates only on touch devices when `scrollTop === 0`. Respects
`prefers-reduced-motion` (snaps instead of animating). Announces
"Refreshing…" / "Refreshed." to screen readers via `aria-live`.

### 8.2 Swipe-to-action — `<SwipeableCard>`

```tsx
import { SwipeableCard } from "@/components/responsive";

<SwipeableCard
  leftAction={{ label: "Archive", color: "bg-blue-500", onTrigger: archive }}
  rightAction={{ label: "Delete", color: "bg-rose-500", onTrigger: remove }}
>
  {children}
</SwipeableCard>
```

Each action also renders as a real, focusable `<button>` underneath
the card for keyboard + screen-reader users — the gesture is a
power-user shortcut, not the only way.

---

## 9. iOS-specific fixes

| Problem | Fix | Where |
|---------|-----|-------|
| Auto-zoom on input focus | `font-size: 16px` on inputs at `max-width: 768px` | `globals.css` |
| 300ms tap delay | `touch-action: manipulation` on interactive elements | `globals.css` |
| URL bar resize jitter | `min-height: 100dvh` (instead of `100vh`) | `globals.css` |
| Notch / home indicator overlap | `padding: var(--safe-area-inset-*)` on `body` + `viewportFit: cover` | `globals.css` + `viewport` export |
| Double-tap-to-zoom on buttons | `touch-action: manipulation` | `globals.css` |
| Rubber-band scroll bleed | `<PullToRefresh>` calls `preventDefault()` only when actually pulling | `pull-to-refresh.tsx` |
| `position: fixed` jumps on keyboard open | Use `position: sticky` for footers; reserve space with `min-height: 100dvh` | `globals.css` |

---

## 10. Android-specific fixes

| Problem | Fix |
|---------|-----|
| Status bar color mismatch | `<meta name="theme-color">` set per theme in `viewport` export |
| Chrome pull-to-refresh hijack | Disable with `overscroll-behavior-y: contain` on scroll containers |
| Text autosize | `-webkit-text-size-adjust: 100%` on `html` |
| Tap highlight color | `-webkit-tap-highlight-color: transparent` (optional, set per-component) |

---

## 11. Mobile utilities reference (`@/lib/mobile`)

| Hook | Returns | Use case |
|------|---------|----------|
| `useIsMobile()` | `boolean` | Hide/show chrome by breakpoint |
| `useBreakpoint()` | `"mobile" \| "tablet" \| "desktop"` | Adjust chart legend, columns |
| `useOrientation()` | `"portrait" \| "landscape"` | Re-arrange video player |
| `useSafeAreaInsets()` | `{ top, bottom, left, right }` | Position sticky bottom bars |
| `usePrefersReducedMotion()` | `boolean` | Disable animations |
| `usePrefersDarkMode()` | `boolean` | Sync with OS theme |
| `useViewportSize()` | `{ width, height }` | Canvas sizing |
| `useIsTouchDevice()` | `boolean` | Disable hover-only UI |
| `useOnlineStatus()` | `boolean` | Show offline banner |

All hooks are SSR-safe (return deterministic defaults during first
paint, update on mount).

---

## 12. Do / Don't

✅ **Do** start with the mobile layout (no breakpoint prefix).
✅ **Do** use `<ResponsiveTable>` for any data table.
✅ **Do** pass `hideOnMobile` for non-essential columns.
✅ **Do** use `<TouchOptimizedButton>` for icon-only buttons.
✅ **Do** test every screen at 360×640, 768×1024, and 1440×900.
✅ **Do** respect `prefers-reduced-motion` (handled by framer-motion
   + `usePrefersReducedMotion`).

❌ **Don't** write `hidden md:block` for content that should be
   available on mobile — find a different layout.
❌ **Don't** use `position: fixed` for footers (use `sticky`).
❌ **Don't** use `100vh` (use `100dvh`).
❌ **Don't** set input `font-size` below 16px on mobile.
❌ **Don't** rely on hover-only interactions without a touch
   fallback.
❌ **Don't** use `xl:` or `2xl:` for layout — only for typography.

---

## 13. Related files

- `src/components/responsive/` — the 10 shared components.
- `src/lib/mobile.ts` — mobile detection hooks.
- `src/lib/performance.ts` — debounce / throttle / lazy helpers.
- `public/sw.js` — service worker (offline + caching).
- `public/manifest.json` — PWA manifest.
- `src/app/offline/page.tsx` — offline fallback.
- `src/components/sw-registrar.tsx` — registers `sw.js` on production.
