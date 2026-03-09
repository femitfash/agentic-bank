import { NextRequest } from "next/server";

// VULN: Server-Side Request Forgery (SSRF) — fetches any user-supplied URL
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url } = body;

  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  try {
    // VULNERABLE: No URL validation, allows internal network access
    // Attacker can access http://169.254.169.254/latest/meta-data/ (cloud metadata)
    // or http://localhost:5432 (internal services)
    const response = await fetch(url, {
      headers: { "User-Agent": "AgenticBank/1.0" },
    });

    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return Response.json({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
