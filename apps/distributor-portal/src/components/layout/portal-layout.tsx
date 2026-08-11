"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

/**
 * Portal shell — sidebar + topbar + main content.
 *
 * Used by the `(portal)` route group layout so every authenticated page
 * gets the same chrome.
 */
export function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
        <footer className="mt-auto border-t border-border bg-card px-4 py-4 text-center text-xs text-muted-foreground md:px-6">
          <span>© {new Date().getFullYear()} Dayjoy AI Enterprise · Distributor Portal</span>
          <span className="mx-2">·</span>
          <a href="/knowledge" className="hover:text-foreground">Help</a>
          <span className="mx-2">·</span>
          <a href="/settings" className="hover:text-foreground">Settings</a>
        </footer>
      </div>
    </div>
  );
}
