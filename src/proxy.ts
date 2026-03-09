import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/shared/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/signup"];

const PASSTHROUGH_PREFIXES = ["/api/", "/_next/", "/favicon.ico"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, Next.js internals, and static assets
  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // In development, skip auth enforcement unless explicitly enabled
  if (process.env.NODE_ENV === "development" && !process.env.ENFORCE_AUTH) {
    return NextResponse.next();
  }

  // Refresh Supabase session cookies
  const { user, supabaseResponse } = await updateSession(request);

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route);

  // Authenticated user on a public route → redirect to app
  if (user && isPublicRoute) {
    const role = user.user_metadata?.role;
    const redirectTo = role === "customer" ? "/portal/dashboard" : "/dashboard";
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  // Unauthenticated user on a protected route → redirect to login
  if (!user && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Customer trying to access admin routes → redirect to portal
  if (user && user.user_metadata?.role === "customer") {
    const isPortalOrPublic = pathname.startsWith("/portal") || isPublicRoute;
    if (!isPortalOrPublic) {
      return NextResponse.redirect(new URL("/portal/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
