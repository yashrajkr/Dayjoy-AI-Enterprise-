"use client";

import * as React from "react";

/**
 * Tiny utility — Radix's `Sheet` requires a visible `SheetTitle` for
 * accessibility, but the mobile drawer's brand block is the visual
 * title. We render an sr-only title with this helper to satisfy the
 * accessibility check without changing the visual layout.
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
