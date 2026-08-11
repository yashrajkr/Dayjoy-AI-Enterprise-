"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmployeeSidebar } from "./employee-sidebar";
import { EmployeeHeader } from "./employee-header";
import { useAuthStore } from "@/store/auth.store";
import { FullPageLoading } from "@/components/ui/page-loading";

/**
 * Layout shell for the authenticated employee portal — sidebar + header
 * + content area. Auth-guards the route group; redirects to /login if no
 * token after store hydration.
 */
export function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (isHydrated && !accessToken) {
      const redirect = encodeURIComponent(
        window.location.pathname + window.location.search,
      );
      router.replace(`/login?redirect=${redirect}`);
    }
  }, [isHydrated, accessToken, router]);

  if (!isHydrated) {
    return <FullPageLoading />;
  }

  if (!accessToken) {
    return <FullPageLoading />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <EmployeeSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <EmployeeHeader />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
