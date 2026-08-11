# PWA Guide — Dayjoy AI Enterprise Portals

> Applies to: `apps/admin-dashboard`, `apps/customer-portal`,
> `apps/distributor-portal`, `apps/employee-portal`, `apps/website-chat`.

This guide documents how Progressive Web App (PWA) support is
configured in every Dayjoy AI portal, how to install the app,
how the offline experience works, and how to extend it (push
notifications, background sync, etc.).

---

## 1. What's a PWA?

A PWA is a web app that, after a one-tap install, behaves like a
native app:

- **Installable** — appears on the home screen, in the app
  switcher, and in the OS app list.
- **Offline-capable** — loads instantly from cache when the
  network is unavailable.
- **Standalone** — runs without browser chrome (no URL bar).
- **Push-notifiable** — can receive push notifications (TODO).
- **Integrable** — can register as a share target, file handler,
  or protocol handler (TODO).

The three pillars every PWA needs:

1. A **web app manifest** (`/manifest.json`) describing the app.
2. A **service worker** (`/sw.js`) handling caching + offline.
3. A **secure context** (HTTPS — already required by Next.js).

---

## 2. Files shipped per portal

| File | Purpose |
|------|---------|
| `public/manifest.json` | App name, icons, theme color, shortcuts |
| `public/sw.js` | Service worker (caching + offline fallback) |
| `public/icons/icon-192.png` | App icon — 192×192 (TODO: generate) |
| `public/icons/icon-512.png` | App icon — 512×512 (TODO: generate) |
| `public/screenshots/desktop.png` | Install-prompt wide screenshot (TODO) |
| `public/screenshots/mobile.png` | Install-prompt narrow screenshot (TODO) |
| `src/app/offline/page.tsx` | Offline fallback page |
| `src/components/sw-registrar.tsx` | Registers `/sw.js` on production |
| `src/app/layout.tsx` | Links the manifest + meta tags |

---

## 3. Manifest reference

Each portal ships its own `manifest.json`. The schema is
[W3C Web App Manifest](https://www.w3.org/TR/appmanifest/).

Key fields:

```json
{
  "name": "Dayjoy AI — Customer Portal",   // full name
  "short_name": "Dayjoy Customer",          // ≤12 chars for home screen
  "description": "Dayjoy AI customer self-service portal — products, orders, AI assistance, and support.",
  "start_url": "/",                          // where the app opens
  "scope": "/",                              // URLs considered "inside" the app
  "display": "standalone",                   // no browser chrome
  "display_override": ["standalone", "minimal-ui"],  // graceful fallback
  "background_color": "#fffbf5",             // splash screen background
  "theme_color": "#f97316",                  // status bar / window chrome
  "orientation": "any",                      // allow portrait + landscape
  "lang": "en",
  "dir": "ltr",
  "categories": ["shopping", "lifestyle", "business"],  // App Store categories
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"              // adaptive icon on Android
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/desktop.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",                 // desktop install prompt
      "label": "Customer portal desktop view"
    },
    {
      "src": "/screenshots/mobile.png",
      "sizes": "375x812",
      "type": "image/png",
      "form_factor": "narrow",               // mobile install prompt
      "label": "Customer portal mobile view"
    }
  ],
  "shortcuts": [
    {
      "name": "Products",
      "short_name": "Shop",
      "description": "Browse the product catalog",
      "url": "/products",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    }
  ],
  "prefer_related_applications": false
}
```

### 3.1 Field gotchas

- `short_name` should be ≤12 characters; Android clips longer
  names on the home screen.
- `theme_color` is what colors the Android status bar and
  Chrome toolbar. Use the brand color (`#f97316`).
- `background_color` shows during the splash screen before
  React hydrates. Match your `body` background.
- `purpose: "any maskable"` lets Android crop the icon into a
  circle/squircle. Design your icon with safe padding.
- `display: "standalone"` is what every portal wants. Use
  `"minimal-ui"` as a fallback via `display_override`.
- `shortcuts` appear in the long-press menu on Android.
  Cap to 4.

---

## 4. Service worker (`/sw.js`)

The service worker is a JavaScript file that runs in a separate
thread, intercepts network requests, and decides whether to
serve from cache or network.

### 4.1 Strategy

Our service worker uses three strategies:

| Request type | Strategy | Why |
|--------------|----------|-----|
| Navigation (`mode: "navigate"`) | Network-first → cache → `/offline` | Always serve fresh HTML when online; fall back to cache; show offline page when both fail |
| Static assets (JS, CSS, fonts, images) | Cache-first | Immutable (fingerprinted), so cache is always safe |
| `_next/data/*` (RSC payload) | Stale-while-revalidate | Fast paint, refresh in background |
| API requests | Network-only | Never cache user data |
| Everything else | Stale-while-revalidate | Sensible default |

### 4.2 Cache versioning

```js
const CACHE_VERSION = "v1.0.0";
const APP_SHELL_CACHE = `dayjoy-admin-shell-${CACHE_VERSION}`;
```

**Bump `CACHE_VERSION` on every deploy.** The `activate` handler
deletes any cache that doesn't match the current version,
forcing users onto the latest app shell.

### 4.3 Lifecycle

1. **Install** — pre-cache the app shell (`/`, `/offline`,
   `/manifest.json`, icons). Skip waiting so the new SW activates
   immediately.
2. **Activate** — delete old caches, claim all clients.
3. **Fetch** — intercept every request, route to the right
   strategy.

### 4.4 What we don't cache

- `POST`, `PUT`, `DELETE` — mutations are never cached.
- `/api/*` — user data, always network-only.
- Cross-origin requests — let the browser handle them.

### 4.5 Update flow

When you deploy a new version:

1. The new `sw.js` is served (browser polls on navigation).
2. New SW installs in parallel with the old one.
3. New SW calls `skipWaiting()` — activates immediately.
4. New SW's `activate` deletes old caches.
5. Next navigation, the user gets the new app shell.

The SW itself never auto-reloads already-open tabs. Add a
"refresh to update" toast if you want to prompt users:

```tsx
// TODO: implement update-available toast
navigator.serviceWorker.addEventListener("controllerchange", () => {
  // The SW changed; prompt user to reload.
});
```

---

## 5. Installation

### 5.1 Install criteria

For the browser to show the install prompt, the app must:

1. Be served over HTTPS.
2. Have a `manifest.json` with `name`, `icons` (192 + 512),
   `start_url`, `display: standalone`.
3. Have a registered service worker that handles `fetch`.

### 5.2 Chrome / Edge (Android)

- Visit the portal URL.
- Chrome shows an "Install" prompt in the address bar (or via
  ⋮ menu → "Install app").
- Confirm → app appears on the home screen.

### 5.3 Safari (iOS)

- Visit the portal URL.
- Tap the Share button → "Add to Home Screen".
- Confirm → app appears on the home screen.
- Note: iOS doesn't support the `beforeinstallprompt` event —
  users must manually use Share → Add to Home Screen.

### 5.4 Chrome (Desktop)

- Visit the portal URL.
- Click the install icon (⊕) in the address bar.
- Confirm → app opens in a standalone window.

### 5.5 Custom install button (optional)

To add a custom "Install app" button:

```tsx
import { useEffect, useState } from "react";

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();  // don't show the mini-infobar
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setShow(false);
        }
        setDeferredPrompt(null);
      }}
    >
      Install app
    </button>
  );
}
```

---

## 6. Offline experience

### 6.1 What works offline

- The app shell (`/`).
- Any page the user has visited (cached on first visit).
- Static assets (JS, CSS, fonts, images).
- The `/offline` fallback page.

### 6.2 What doesn't work offline

- API requests (network-only by design).
- Real-time data (websockets, SSE).
- Authentication (we don't cache auth tokens offline).

### 6.3 Offline fallback page

When the user navigates to a URL that isn't cached AND the
network is unavailable, the service worker serves `/offline`:

```tsx
// src/app/offline/page.tsx
export default function OfflinePage() {
  return (
    <main>
      <WifiOff />
      <h1>You're Offline</h1>
      <p>Check your connection and try again.</p>
      <button onClick={() => window.location.reload()}>Retry</button>
    </main>
  );
}
```

The page is intentionally minimal — it must not depend on any
external resources beyond what's already cached.

### 6.4 Detecting offline in the UI

```tsx
import { useOnlineStatus } from "@/lib/mobile";

const online = useOnlineStatus();
{!online && (
  <div role="status" className="bg-warning/15 px-4 py-2 text-warning">
    You're offline — showing cached content.
  </div>
)}
```

---

## 7. App shortcuts

The manifest's `shortcuts` array defines quick actions accessible
via long-press on the home screen icon (Android) or
right-click on the taskbar (Desktop).

Each portal ships 4 portal-specific shortcuts. Example (customer):

```json
"shortcuts": [
  { "name": "Products", "url": "/products" },
  { "name": "Orders",   "url": "/orders" },
  { "name": "AI Assistant", "url": "/assistant" },
  { "name": "Support",  "url": "/support" }
]
```

Keep shortcuts to **4 max** — Android only shows 4 in the
long-press menu.

---

## 8. Push notifications (TODO)

Not yet implemented. When you add it:

1. **Server side:** generate VAPID keys, store them in env vars,
   subscribe via the Web Push API.
2. **Client side:** request permission via
   `Notification.requestPermission()`, subscribe via
   `serviceWorkerRegistration.pushManager.subscribe()`, send the
   subscription to your backend.
3. **Service worker:** add a `push` event listener that calls
   `self.registration.showNotification(...)`.
4. **Manifest:** add `"gcm_sender_id": "..."` (only for legacy
   GCM, usually not needed).

Reference implementation sketch:

```js
// sw.js
self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Dayjoy", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: payload.data ?? {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
```

---

## 9. Background sync (TODO)

Not yet implemented. When you add it:

1. Register a sync tag from the client:
   `serviceWorkerRegistration.sync.register("send-pending-messages")`.
2. Listen in `sw.js`:
   `self.addEventListener("sync", (event) => { if (event.tag === "send-pending-messages") ... })`.
3. Store pending operations in IndexedDB while offline.
4. When the SW fires `sync`, replay them.

Use case: customer composes a support ticket while offline;
background sync sends it when the connection returns.

---

## 10. Icon generation

We need 4 icon files per portal:

| File | Size | Use |
|------|------|-----|
| `public/icons/icon-192.png` | 192×192 | Standard PWA icon |
| `public/icons/icon-512.png` | 512×512 | High-res PWA icon |
| `public/icons/icon-maskable-192.png` | 192×192 | Maskable icon (Android adaptive) |
| `public/icons/icon-maskable-512.png` | 512×512 | Maskable icon (Android adaptive) |
| `public/icons/apple-touch-icon.png` | 180×180 | iOS home screen icon |
| `public/icons/favicon.ico` | 32×32 | Browser tab icon |

Generate from a single SVG source:

```bash
# Using realfavicongenerator.net (manual upload) or sharp-cli:
npx sharp-cli -i source.svg -o public/icons/icon-192.png resize 192 192
npx sharp-cli -i source.svg -o public/icons/icon-512.png resize 512 512
npx sharp-cli -i source.svg -o public/icons/apple-touch-icon.png resize 180 180
```

**Maskable icon design:** keep the logo inside a 80%-diameter
circle (the "safe zone"); the outer 20% may be cropped by
Android's adaptive icon system.

---

## 11. Screenshots for install prompt

Chrome 88+ shows screenshots in the install prompt. Two per
portal:

| File | Size | Form factor |
|------|------|-------------|
| `public/screenshots/desktop.png` | 1280×720 | wide |
| `public/screenshots/mobile.png` | 375×812 | narrow |

Take the screenshots on a real device or via Chrome DevTools
device emulation. Save as PNG (not JPEG — text rendering is
crisper).

---

## 12. Testing the PWA

### 12.1 Chrome DevTools → Application tab

- **Manifest** — shows the parsed manifest + any warnings.
- **Service Workers** — shows registered SWs, lets you
  unregister, update, or bypass.
- **Cache Storage** — inspect cached entries.
- **Install** button to simulate install.

### 12.2 Lighthouse PWA audit

Lighthouse's PWA audit checks all three pillars (manifest, SW,
HTTPS). Run on every release.

### 12.3 Workbox

If the service worker grows complex, consider migrating to
[Workbox](https://developer.chrome.com/docs/workbox/) — it
provides battle-tested recipes for caching strategies. Not
currently a dependency.

### 12.4 Testing offline

1. Open Chrome DevTools → Application → Service Workers.
2. Check "Offline".
3. Reload the page — `/offline` should render.
4. Uncheck "Offline" — the page should load normally.
5. Visit a few pages, then go offline again — those pages
   should load from cache.

### 12.5 Testing install

1. Open the portal in Chrome / Edge (Android or Desktop).
2. Use the address bar install icon, or `⋮` → Install.
3. Confirm the app launches in a standalone window.
4. On Android: long-press the icon → shortcuts appear.
5. On iOS: use Share → Add to Home Screen.

---

## 13. Per-portal theme colors

| Portal | `theme_color` | `background_color` | `short_name` |
|--------|---------------|--------------------|--------------|
| admin-dashboard | `#f97316` | `#0a0e1a` (dark) | Dayjoy Admin |
| customer-portal | `#f97316` | `#fffbf5` (light) | Dayjoy Customer |
| distributor-portal | `#f97316` | `#fffbf5` (light) | Dayjoy Distributor |
| employee-portal | `#f97316` | `#0a0e1a` (dark) | Dayjoy Employee |
| website-chat | `#f97316` | `#fffbf5` (light) | Dayjoy Chat |

All portals share the Dayjoy orange (`#f97316`) as the brand
theme color. Background colors differ to match each portal's
default theme (admin/employee = dark, customer/distributor/
chat = light).

---

## 14. Production checklist

- [ ] `manifest.json` validates (Chrome DevTools → Application →
      Manifest shows no warnings).
- [ ] `sw.js` registered (Application → Service Workers shows it).
- [ ] Both `icon-192.png` and `icon-512.png` exist and are
      referenced by the manifest.
- [ ] `apple-touch-icon.png` exists and is referenced by the
      layout.
- [ ] `<meta name="theme-color">` set per theme.
- [ ] `<meta name="apple-mobile-web-app-capable" content="yes">`.
- [ ] `<meta name="apple-mobile-web-app-status-bar-style">`.
- [ ] `viewport` export includes `viewportFit: "cover"` for notch.
- [ ] `/offline` renders correctly when service worker is
      bypassed (Next.js routing).
- [ ] App installs on Android (Chrome).
- [ ] App installs on iOS (Safari → Share → Add to Home Screen).
- [ ] App launches in standalone mode (no URL bar).
- [ ] Lighthouse PWA audit passes.
- [ ] No mixed content (no `http://` URLs in production).
- [ ] `CACHE_VERSION` bumped on every deploy.

---

## 15. Related files

- `public/manifest.json` — portal-specific manifest.
- `public/sw.js` — service worker.
- `src/app/offline/page.tsx` — offline fallback.
- `src/components/sw-registrar.tsx` — registers SW on production.
- `src/app/layout.tsx` — manifest + meta tags.
- `src/lib/mobile.ts` — `useOnlineStatus` hook.
- `docs/RESPONSIVE_DESIGN_GUIDE.md` — safe-area insets.
- `docs/PERFORMANCE_OPTIMIZATION_GUIDE.md` — caching strategy.
