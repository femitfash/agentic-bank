import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { GUARDRAILS_URL, GUARDRAILS_TOKEN, PII_ENTITY_TYPES } from "@/shared/lib/guardrails";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, api_key } = await request.json();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  try {
    // Truncate to avoid overwhelming the API (scan first ~10KB)
    const scanText = text.length > 10000 ? text.slice(0, 10000) : text;
    const token = api_key || GUARDRAILS_TOKEN;

    const formData = new FormData();
    formData.append("user_prompt", scanText);
    formData.append("pii_entity_types", PII_ENTITY_TYPES);

    const res = await fetch(`${GUARDRAILS_URL}/detect-sensitive-keywords`, {
      method: "POST",
      headers: { "X-Custom-Token": token },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[PII Check] ZeroTrusted API error:", res.status, errText);
      return Response.json({ error: `PII check failed: ${res.status} ${errText}` }, { status: 502 });
    }

    const data = await res.json();

    // ZeroTrusted response format:
    // data.privacy_result.pii_entities = [["john.doe@example.com", "EMAIL_ADDRESS"], ["John Doe", "PERSON"], ...]
    // data.privacy_result.processing_stats.entities_detected = 3
    const privacyResult = data?.privacy_result;
    const piiEntities: [string, string][] = privacyResult?.pii_entities || [];

    return Response.json({
      has_pii: piiEntities.length > 0,
      detections: piiEntities.map(([text, entityType]: [string, string]) => ({
        entity_type: entityType,
        text,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `PII check failed: ${msg}` }, { status: 500 });
  }
}
