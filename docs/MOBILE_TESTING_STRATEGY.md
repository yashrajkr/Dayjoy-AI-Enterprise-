# Mobile Testing Strategy — Dayjoy AI Enterprise Portals

> Applies to: `apps/admin-dashboard`, `apps/customer-portal`,
> `apps/distributor-portal`, `apps/employee-portal`, `apps/website-chat`.

This document defines the testing strategy for ensuring every
Dayjoy AI portal works on the real-world devices our customers,
distributors, employees, and admins actually use.

---

## 1. Goals

1. **No regressions** on top devices in India (primary market).
2. **WCAG 2.1 AA** compliance on mobile (see `ACCESSIBILITY_GUIDE.md`).
3. **Core Web Vitals** in the green on mid-tier Android (see
   `PERFORMANCE_OPTIMIZATION_GUIDE.md`).
4. **Sub-2s** first interaction on 4G.

---

## 2. Device matrix

We test on the **minimum**, **median**, and **flagship** for each
form factor. Coverage matrix is reviewed quarterly.

### 2.1 Phones (priority order)

| Device | OS | Browser | Screen | Why |
|--------|----|---------|--------|-----|
| iPhone SE (3rd gen) | iOS 17 | Safari | 375×667 | Smallest active iPhone — layout-fit canary |
| iPhone 12 | iOS 17 | Safari | 390×844 | Median iPhone in India |
| iPhone 15 | iOS 18 | Safari | 393×852 | Flagship iPhone |
| Galaxy S24 | Android 14 | Chrome | 360×780 | Flagship Android |
| Galaxy A52 | Android 13 | Chrome | 360×800 | Median Android in India |
| Redmi Note 12 | Android 13 | Chrome | 360×844 | Budget Android — perf canary |
| Pixel 6a | Android 14 | Chrome | 412×915 | Pure Android reference |
| Galaxy S24 | Android 14 | Samsung Internet | 360×780 | Samsung's browser fork |

### 2.2 Tablets

| Device | OS | Browser | Screen |
|--------|----|---------|--------|
| iPad (10th gen) | iPadOS 17 | Safari | 820×1180 |
| iPad Pro 11" | iPadOS 17 | Safari | 834×1194 |
| Galaxy Tab S9 | Android 14 | Chrome | 800×1280 |

### 2.3 Desktop (regression only)

| OS | Browser | Screen |
|----|---------|--------|
| macOS 14 | Chrome, Safari, Firefox | 1440×900 |
| Windows 11 | Chrome, Edge | 1920×1080 |

---

## 3. Browser support

**Tier 1 (must pass):** Safari iOS 16+, Chrome Android 105+,
Chrome Desktop 115+, Safari Desktop 16+.

**Tier 2 (should pass):** Firefox 115+, Samsung Internet 22+,
Edge Desktop 115+.

**Tier 3 (best-effort):** Older browsers — no effort spent, but
graceful degradation expected (no white screen of death).

Feature detection (not user-agent sniffing) drives every
progressive enhancement. Use the helpers in `@/lib/mobile.ts`.

---

## 4. Testing tools

| Tool | Purpose | Cadence |
|------|---------|---------|
| **Chrome DevTools device emulation** | Quick dev-loop checks | Every PR (manual) |
| **Playwright mobile viewports** | Automated E2E on mobile sizes | CI on every PR |
| **BrowserStack Live** | Real-device smoke test | Pre-release |
| **LambdaTest Real Device Cloud** | Alternate real-device cross-check | Pre-release |
| **Lighthouse CI** | Perf + a11y scores | CI on every PR |
| **axe DevTools** | WCAG audit | Pre-release |
| **VoiceOver (macOS / iOS)** | Screen reader test | Pre-release |
| **TalkBack (Android)** | Screen reader test | Pre-release |
| **Android Studio Emulator (Pixel 5)** | Slow-network + low-battery profiles | Pre-release |

---

## 5. Playwright mobile configuration

The existing Playwright config in `testing/e2e/playwright.config.ts`
should be extended to register mobile + tablet projects:

```ts
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-se",      use: { ...devices["iPhone SE"] } },
    { name: "iphone-12",      use: { ...devices["iPhone 12"] } },
    { name: "galaxy-s9",      use: { ...devices["Galaxy S9"] } },
    { name: "ipad-11",        use: { ...devices["iPad 11"] } },
    { name: "pixel-5",        use: { ...devices["Pixel 5"] } },
  ],
  use: {
    viewport: { width: 1280, height: 720 }, // overridden per-project
    ignoreHTTPSErrors: true,
    // Throttle network on mobile projects to spot perf regressions.
    // contextOptions: { ... } per-project.
  },
});
```

### 5.1 Example mobile test (responsive assertions)

```ts
// testing/e2e/responsive.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Responsive layout", () => {
  for (const [name, viewport] of [
    ["mobile",  { width: 375, height: 667 }],
    ["tablet",  { width: 768, height: 1024 }],
    ["desktop", { width: 1440, height: 900 }],
  ] as const) {
    test(`renders correctly at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/dashboard");
      if (name === "mobile") {
        await expect(page.locator("[aria-label='Open menu']")).toBeVisible();
        await expect(page.locator("aside")).toBeHidden();
      } else {
        await expect(page.locator("aside")).toBeVisible();
      }
    });
  }
});
```

---

## 6. Test cases (per screen)

Each screen must pass these test cases on mobile, tablet, and
desktop.

### 6.1 Navigation

- [ ] Sidebar collapses to a drawer at <1024px.
- [ ] Drawer opens via the menu trigger (`aria-label="Open menu"`).
- [ ] Drawer closes on backdrop click, Escape, and route change.
- [ ] Body scroll is locked while drawer is open.
- [ ] Bottom navigation (if present) is hidden ≥768px.
- [ ] Bottom navigation respects `safe-area-inset-bottom`.
- [ ] Active nav item has `aria-current="page"`.

### 6.2 Forms

- [ ] Inputs stack vertically <640px.
- [ ] Inputs use grid layout ≥640px.
- [ ] Every input has a visible `<label>` linked via `htmlFor`.
- [ ] Error messages are linked via `aria-describedby`.
- [ ] Required fields are marked with `*` and `aria-required`.
- [ ] Inputs are `font-size: 16px` <768px (no iOS auto-zoom).
- [ ] Submit button is ≥44×44px on touch devices.
- [ ] Form is fully keyboard-navigable (Tab order sensible).

### 6.3 Tables

- [ ] Desktop: real `<table>` with `<thead>` + `<th scope="col">`.
- [ ] Mobile: each row becomes a card with `<dl>` of label/value.
- [ ] Hidden columns on mobile (`hideOnMobile`) don't appear.
- [ ] Row click (if any) also works via Enter / Space.
- [ ] Empty state renders when `rows.length === 0`.

### 6.4 Charts

- [ ] Chart height adjusts by breakpoint (220px mobile, 320px desktop).
- [ ] Chart fills 100% width of its container.
- [ ] Legend is readable (no overflow, no truncation) on mobile.
- [ ] Chart has a non-empty `aria-label` (or `title`).

### 6.5 Modals / Dialogs

- [ ] Modal is full-screen on mobile (`inset-0`).
- [ ] Modal is centered with backdrop on desktop.
- [ ] Body scroll is locked while modal is open.
- [ ] Focus is trapped inside the modal.
- [ ] Escape closes the modal.
- [ ] First focusable element receives focus on open.
- [ ] Focus returns to trigger on close.

### 6.6 Gestures (mobile only)

- [ ] Pull-to-refresh activates only when `scrollTop === 0`.
- [ ] Pull-to-refresh announces "Refreshing…" / "Refreshed." via
      `aria-live`.
- [ ] Swipeable card reveals actions on drag.
- [ ] Swipeable card also exposes actions as keyboard-accessible
      buttons underneath.

### 6.7 PWA

- [ ] `manifest.json` is valid (Chrome DevTools → Application →
      Manifest shows no warnings).
- [ ] App is installable (Chrome shows the install prompt).
- [ ] Offline page renders when network is unavailable.
- [ ] Cached pages still load when offline.

---

## 7. Network profiles

Test under the following Chrome DevTools network profiles:

| Profile | Download | Upload | Latency | Use case |
|---------|----------|--------|---------|----------|
| Slow 3G | 400 Kbps | 400 Kbps | 400 ms | Tier-3 city 4G fallback |
| Fast 3G | 1.5 Mbps | 750 Kbps | 150 ms | Rural 4G |
| 4G | 4 Mbps | 3 Mbps | 20 ms | Urban 4G |
| Wifi | 30 Mbps | 15 Mbps | 2 ms | Office / home |

**LCP must be <2.5s on Slow 3G** for any Tier-1 page.

---

## 8. Performance gates (Lighthouse CI)

Lighthouse CI runs on every PR. **Mobile** configuration
(`formFactor: "mobile"`, throttling: simulated 4G).

| Metric | Target | Hard fail |
|--------|--------|-----------|
| LCP | <2.5s | >4s |
| FID/INP | <100ms / <200ms | >300ms / >500ms |
| CLS | <0.1 | >0.25 |
| FCP | <1.8s | >3s |
| TTFB | <800ms | >1.8s |
| Performance score | ≥90 | <70 |
| Accessibility score | ≥95 | <80 |
| Best Practices | ≥95 | <80 |
| SEO | ≥95 | <80 |

`.lighthouserc.json` example:

```json
{
  "ci": {
    "collect": {
      "settings": {
        "preset": "desktop"
      },
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/dashboard"
      ]
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
      }
    }
  }
}
```

---

## 9. Accessibility testing on mobile

- **VoiceOver (iOS):** enable via Settings → Accessibility →
  VoiceOver. Navigate every screen via swipe-right + double-tap.
  Each interactive element must announce a sensible label.
- **TalkBack (Android):** enable via Settings → Accessibility →
  TalkBack. Same navigation pattern.
- **Switch Control (iOS) / Switch Access (Android):** verify every
  interactive element is reachable via a single switch.
- **Dynamic Type (iOS) / Font Size (Android):** bump to largest
  setting; layouts must not break (text must wrap, not clip).

See `ACCESSIBILITY_GUIDE.md` for the full WCAG 2.1 AA checklist.

---

## 10. Test automation pipeline

```text
PR opened
  ├── ESLint + TypeScript type-check       (gate)
  ├── Unit tests (Vitest)                  (gate)
  ├── Playwright desktop (Chromium)        (gate)
  ├── Playwright mobile (iPhone SE + Pixel 5)  (gate)
  └── Lighthouse CI mobile                 (gate)

Pre-release
  ├── BrowserStack Live smoke test         (manual)
  ├── Real-device walkthrough (iPhone 12 + Galaxy S24)  (manual)
  ├── VoiceOver + TalkBack audit           (manual)
  └── Lighthouse CI desktop                (gate)
```

---

## 11. Bug triage — mobile vs desktop

A bug is classified as **mobile-blocking** if it:

- Renders any Tier-1 page unusable on iPhone SE / Galaxy A52.
- Causes a Core Web Vital to drop into the red on Slow 3G.
- Breaks a WCAG 2.1 AA success criterion.
- Causes a crash on the lowest-spec device (Redmi Note 12).

Mobile-blocking bugs block the release. Desktop-only bugs of the
same severity are logged but not blocking.

---

## 12. Known device-specific issues & workarounds

| Symptom | Device | Workaround |
|---------|--------|------------|
| Position: fixed jumps when keyboard opens | iOS Safari | Use `position: sticky` or `100dvh` |
| 100vh includes URL bar | iOS Safari | Use `100dvh` |
| Tap highlight visible | All Android | `-webkit-tap-highlight-color: transparent` |
| Pull-to-refresh hijacks page | Chrome Android | `overscroll-behavior-y: contain` on scroll containers |
| Date picker renders as text | iOS Safari | Use `<input type="date">` natively; don't custom-style |
| Modal scrolls body behind | iOS Safari | Lock body `overflow: hidden` while modal open |
| SVG `currentColor` not respected | Old Samsung Internet | Use explicit color in SVG |

---

## 13. Pre-release checklist

Before tagging a release, the release engineer must sign off on:

- [ ] All mobile test cases in §6 pass on iPhone SE, iPhone 12,
      Galaxy S24, Galaxy A52.
- [ ] Lighthouse mobile performance ≥90 on every Tier-1 page.
- [ ] Lighthouse mobile accessibility ≥95 on every Tier-1 page.
- [ ] VoiceOver + TalkBack audit complete (no critical issues).
- [ ] PWA installable on iOS + Android.
- [ ] Offline page renders on iOS + Android.
- [ ] No console errors on iPhone SE / Galaxy A52.
- [ ] Screenshots attached to release notes (mobile + desktop).
