import { NextRequest } from "next/server";

// VULN: Open Redirect — redirects to any user-supplied URL without validation
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") || "/dashboard";

  // VULNERABLE: No domain/origin validation on redirect target
  // Attacker can use: /api/auth/redirect?next=https://evil.com/phishing
  return Response.redirect(next.startsWith("http") ? next : new URL(next, request.url));
}
