"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ROUTES, PUBLIC_ROUTES } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { DistributorSidebar } from "./distributor-sidebar";
import { DistributorHeader } from "./distributor-header";

/**
 * Distributor layout shell — desktop sidebar + sticky header + main
 * content area.
 *
 * Auth gate: while the auth store is rehydrating, render a quiet
 * skeleton; once hydrated, if the user is unauthenticated AND on a
 * protected route, redirect to `/login`. (The `useAuth()` hook already
 * performs this redirect — the guard here is a belt-and-braces check
 * that also avoids rendering the layout shell with `null` user data.)
 */
export function DistributorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, hydrated } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — render a minimal skeleton on first paint.
  useEffect(() => {
    if (!hydrated) return;
    if (!user && !PUBLIC_ROUTES.some((r) => window.location.pathname.startsWith(r))) {
      router.replace(ROUTES.login);
    }
  }, [hydrated, user, router]);

  if (!mounted || !hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        <DistributorSidebar />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DistributorHeader />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        <footer className="border-t border-border bg-card px-4 py-4 text-center text-xs text-muted-foreground lg:px-8">
          © {new Date().getFullYear()} Dayjoy AI Enterprise — Distributor
          Portal. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
