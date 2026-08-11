"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CustomerLayout } from "@/components/layout/customer-layout";
import { useAuth } from "@/hooks/use-auth";
import { ROUTES, isPublicRoute } from "@/lib/constants";
import { Loader2 } from "lucide-react";

/**
 * Authenticated route group layout — wraps every page under
 * `/(portal)/*` in the `CustomerLayout` shell.
 *
 * Auth protection is client-side here: if the user isn't
 * authenticated (and the auth store has finished hydrating), redirect
 * to `/login` with a `redirect` param pointing back here.
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isHydrating } = useAuth();

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated && !isPublicRoute(pathname)) {
      const redirect = encodeURIComponent(pathname + window.location.search);
      router.replace(`${ROUTES.login}?redirect=${redirect}`);
    }
  }, [isAuthenticated, isHydrating, pathname, router]);

  if (isHydrating || (!isAuthenticated && !isPublicRoute(pathname))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Loading your account…</span>
      </div>
    );
  }

  return <CustomerLayout>{children}</CustomerLayout>;
}
