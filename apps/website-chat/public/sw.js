/**
 * Dayjoy AI Admin Dashboard — Service Worker
 * -------------------------------------------
 * Provides:
 *   1. App shell caching (HTML + JS + CSS bundles)
 *   2. Static asset caching (images, fonts, icons)
 *   3. Offline fallback (serves /offline when navigation fails)
 *   4. Stale-while-revalidate for same-origin GET requests
 *
 * Strategy:
 *   - Navigation requests: network-first → cache → /offline
 *   - Static assets (script, style, font, image): cache-first
 *   - API requests: network-only (never cache user data)
 *
 * Bump CACHE_VERSION on every deploy to invalidate old caches.
 */

const CACHE_VERSION = "v1.0.0";
const APP_SHELL_CACHE = `dayjoy-admin-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `dayjoy-admin-assets-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("dayjoy-admin-") &&
              key !== APP_SHELL_CACHE &&
              key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept API or Next.js internal routes.
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/data/")) {
    // Allow stale-while-revalidate for data routes.
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Navigations: network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Static assets: cache-first.
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request));
});

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || network;
}
