import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// VULN: Path Traversal — reads arbitrary files via unsanitized filename
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file") || "app.log";

  // VULNERABLE: No path sanitization — ../../.env.local works
  const logDir = path.join(process.cwd(), "logs");
  const filePath = path.join(logDir, file);

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return Response.json({ file: filePath, content });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Read failed";
    // VULN: Leaking full file path in error response
    return Response.json({
      error: message,
      attempted_path: filePath,
    }, { status: 404 });
  }
}
