import { NextRequest } from "next/server";

// VULN: Reflected XSS — user input rendered in HTML response without escaping
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  const page = request.nextUrl.searchParams.get("page") || "1";

  // VULNERABLE: Directly embedding user input in HTML response
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Search Results</title></head>
    <body>
      <h1>Search Results for: ${query}</h1>
      <p>Page ${page} — No results found for "${query}"</p>
      <form action="/api/search" method="GET">
        <input type="text" name="q" value="${query}" />
        <button type="submit">Search</button>
      </form>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
