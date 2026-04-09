import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { GUARDRAILS_URL, GUARDRAILS_TOKEN } from "@/shared/lib/guardrails";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, mappings, api_key } = await request.json();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return Response.json({ error: "mappings array is required" }, { status: 400 });
  }

  try {
    const token = api_key || GUARDRAILS_TOKEN;

    const formData = new FormData();
    formData.append("user_prompt", text);
    formData.append("anonymized_keywords_mapping", JSON.stringify(mappings));

    const res = await fetch(`${GUARDRAILS_URL}/deanonymize-sensitive-keywords`, {
      method: "POST",
      headers: { "X-API-Key": token },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Deanonymize] ZTA API error:", res.status, errText.slice(0, 300));
      return Response.json({ error: `Deanonymize failed: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const privacyResult = data?.privacy_result;

    return Response.json({
      deanonymized_text: privacyResult?.processed_text || text,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Deanonymize failed: ${msg}` }, { status: 500 });
  }
}
