import { redirect } from "next/navigation";

/**
 * Root route — bounce to the dashboard. Auth gating is handled by the
 * `(portal)` route group's layout (client-side) + middleware (server-side).
 */
export default function HomePage() {
  redirect("/dashboard");
}
