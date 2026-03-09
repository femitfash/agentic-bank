import { NextRequest } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// VULN: Command Injection — user input passed directly to shell command
export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host") || "localhost";

  try {
    // VULNERABLE: Direct string concatenation in shell command
    const { stdout, stderr } = await execAsync(`ping -c 1 ${host}`);

    return Response.json({
      status: "ok",
      host,
      output: stdout,
      errors: stderr || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({
      status: "error",
      host,
      error: message,
    }, { status: 500 });
  }
}
