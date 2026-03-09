import { NextRequest } from "next/server";

// VULN: Sensitive Data Exposure — dumps environment variables
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");

  if (key) {
    // VULNERABLE: Exposing individual env vars by name
    return Response.json({
      key,
      value: process.env[key] || null,
    });
  }

  // VULNERABLE: Dumping ALL environment variables including secrets
  return Response.json({
    node_env: process.env.NODE_ENV,
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
    node_version: process.version,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
}
