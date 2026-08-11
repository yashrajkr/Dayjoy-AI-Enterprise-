"use client";

import * as React from "react";
import { WifiOff, RefreshCw } from "lucide-react";

/**
 * Offline fallback page — shown when the service worker intercepts a
 * navigation request and the user has no network connection.
 *
 * The page is intentionally minimal: a single icon, a short message,
 * and a retry button. It must NOT depend on any external resources
 * (fonts, images, CSS bundles) beyond what the service worker has
 * already cached.
 */
export default function OfflinePage() {
  const [retrying, setRetrying] = React.useState(false);

  const handleRetry = React.useCallback(() => {
    setRetrying(true);
    // Force a reload (bypass bfcache).
    window.location.reload();
  }, []);

  return (
    <main
      role="main"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          You&apos;re Offline
        </h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          We can&apos;t reach the Dayjoy AI servers right now. Please check
          your internet connection and try again.
        </p>
      </div>

      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "Retrying…" : "Retry"}
      </button>

      <p className="text-xs text-muted-foreground">
        Tip: cached pages remain available — use the back button to
        return to your last screen.
      </p>
    </main>
  );
}
