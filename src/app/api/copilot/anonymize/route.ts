import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { GUARDRAILS_URL, GUARDRAILS_TOKEN, PII_ENTITY_TYPES } from "@/shared/lib/guardrails";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await request.json();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  try {
    const scanText = text.length > 10000 ? text.slice(0, 10000) : text;

    const formData = new FormData();
    formData.append("user_prompt", scanText);
    formData.append("pii_entity_types", PII_ENTITY_TYPES);
    formData.append("response_language", "EN");

    const res = await fetch(`${GUARDRAILS_URL}/anonymize-sensitive-keywords`, {
      method: "POST",
      headers: { "X-Custom-Token": GUARDRAILS_TOKEN },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `Anonymize failed: ${res.status} ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const privacyResult = data?.privacy_result;

    return Response.json({
      anonymized_text: privacyResult?.processed_text || text,
      original_text: privacyResult?.original_text || text,
      mappings: (privacyResult?.anonymized_keywords_mapping || []).map(
        (m: { original: string; anonymized: string }) => ({
          original: m.original,
          anonymized: m.anonymized,
        })
      ),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Anonymize failed: ${msg}` }, { status: 500 });
  }
}
