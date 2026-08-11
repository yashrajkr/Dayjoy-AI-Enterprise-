"use client";

import * as React from "react";

/**
 * Minimal Providers wrapper for the Website Chat app.
 *
 * NOTE: The full chat widget (with React Query, theme provider, etc.)
 * is documented in the website-chat docs. This stub exists so the
 * layout compiles and the Service Worker registrar mounts.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
