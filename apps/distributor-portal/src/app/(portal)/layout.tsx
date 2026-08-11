import type { ReactNode } from "react";
import { DistributorLayout } from "@/components/layout/distributor-layout";

/**
 * Route group layout for all authenticated distributor pages under
 * `/(portal)/*`. Wraps every page in the sidebar + header shell.
 *
 * Auth protection is handled client-side by the `DistributorLayout`
 * (which checks `useAuth().hydrated + user`) and reinforced by the
 * `useAuth()` hook (which redirects to `/login` on missing token).
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <DistributorLayout>{children}</DistributorLayout>;
}
