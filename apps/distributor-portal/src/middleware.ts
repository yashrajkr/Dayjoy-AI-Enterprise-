import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_ROUTES, ROUTES } from "@/lib/constants";

/**
 * Server-side auth gate — redirects to /login when an unauthenticated
 * user visits a protected route.
 *
 * This is the first line of defence (the client-side `useAuth()` hook is
 * the second). We only check for the presence of an access token in
 * localStorage — the actual token validity is verified by the
 * `/auth/me` revalidation in `useAuth()` and by the backend JWT guard.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes.
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Allow Next.js internals + static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for the access token cookie/localStorage. Note: middleware
  // runs server-side so it can only read cookies, not localStorage. We
  // therefore sync the token to a cookie on login (see `auth.store.ts`
  // — the persist middleware writes to localStorage; we also set a
  // cookie via a `document.cookie` write in the auth hook). For
  // simplicity here we read the cookie; if missing, redirect.
  const token = request.cookies.get("dp_access_token")?.value;

  if (!token) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set(
      "redirect",
      encodeURIComponent(pathname + request.nextUrl.search),
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
