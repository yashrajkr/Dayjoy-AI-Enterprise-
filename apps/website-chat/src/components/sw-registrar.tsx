"use client";

import * as React from "react";

/**
 * ServiceWorkerRegistrar — registers `/sw.js` once on the client.
 * Renders nothing. Skipped in development (NODE_ENV !== "production")
 * to avoid caching issues during local dev.
 *
 * Mount this high in the tree — typically inside `<Providers>`.
 */
export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[sw] registration failed:", err);
        });
    };

    // Defer registration until after window load to avoid competing
    // with first-paint resource fetches.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
