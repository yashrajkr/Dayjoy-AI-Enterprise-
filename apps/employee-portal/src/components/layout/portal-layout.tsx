"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

/**
 * Portal shell — sidebar + topbar. Wraps every page under the
 * `(portal)` route group. Used by both Agent 5's core pages and Agent
 * 6's extras pages.
 *
 * Auth protection is handled by `src/middleware.ts` (server-side, when
 * present) and the `useAuth()` hook (client-side, for `me()` rehydration).
 * When no user is signed in, the layout still renders — pages handle
 * their own auth gate.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // NOTE: real user role comes from `useAuth()` once Agent 5 ships it.
  // Until then, default to MANAGER so the Team nav item is visible.
  const userRole = "MANAGER" as const;
  const userName = "Vivaan Gupta";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userRole={userRole}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          userName={userName}
          notificationsCount={3}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
        <footer className="mt-auto border-t border-white/[0.06] px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Dayjoy AI Enterprise — Employee Portal · v1.0.0
        </footer>
      </div>
    </div>
  );
}
