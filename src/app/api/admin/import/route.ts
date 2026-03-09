import { NextRequest } from "next/server";

// VULN: Insecure Deserialization — uses eval() on user-supplied data
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { data, format } = body;

  if (!data) {
    return Response.json({ error: "data is required" }, { status: 400 });
  }

  try {
    let parsed;

    if (format === "json") {
      parsed = JSON.parse(data);
    } else {
      // VULNERABLE: Using eval() to parse "flexible" data formats
      // Attacker can send: { "data": "require('child_process').execSync('whoami').toString()" }
      parsed = eval(`(${data})`);
    }

    return Response.json({
      success: true,
      records: Array.isArray(parsed) ? parsed.length : 1,
      preview: parsed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Parse failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
