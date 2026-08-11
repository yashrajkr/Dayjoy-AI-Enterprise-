import { DashboardLayout } from "@/components/layout/dashboard-layout";

/**
 * Route group layout for all authenticated pages under
 * `/(dashboard)/*`. Wraps every page in the sidebar + header shell.
 *
 * Auth protection is handled by `src/middleware.ts` (server-side) and
 * by the `useAuth()` hook (client-side, for `me()` rehydration).
 */
export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
