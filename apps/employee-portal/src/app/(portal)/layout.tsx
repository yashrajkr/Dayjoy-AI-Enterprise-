import { EmployeeLayout } from "@/components/layout/employee-layout";

/**
 * Route group layout for all authenticated pages under `(portal)/*`.
 * Wraps every page in the sidebar + header shell.
 *
 * Auth protection is handled client-side: `EmployeeLayout` checks the
 * persisted `useAuthStore` after hydration and redirects to `/login`
 * if there's no access token.
 */
export default function PortalRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EmployeeLayout>{children}</EmployeeLayout>;
}
