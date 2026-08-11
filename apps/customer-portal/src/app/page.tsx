"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/lib/constants";
import { Loader2 } from "lucide-react";

/**
 * Root route — redirects to `/dashboard` if authenticated, otherwise
 * to `/login`. Shows a brief spinner while the auth store rehydrates.
 */
export default function RootRedirectPage() {
  const router = useRouter();
  const { isAuthenticated, isHydrating } = useAuth();

  useEffect(() => {
    if (isHydrating) return;
    router.replace(isAuthenticated ? ROUTES.dashboard : ROUTES.login);
  }, [isAuthenticated, isHydrating, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
