import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { GUARDRAILS_URL, GUARDRAILS_TOKEN, PII_ENTITY_TYPES } from "@/shared/lib/guardrails";

// Extend Vercel function timeout (default is 10s on hobby, 60s on pro)
export const maxDuration = 30;

async function callAnonymize(scanText: string, token: string): Promise<Response> {
  const formData = new FormData();
  formData.append("user_prompt", scanText);
  formData.append("pii_entity_types", PII_ENTITY_TYPES);
  formData.append("response_language", "EN");

  return fetch(`${GUARDRAILS_URL}/anonymize-sensitive-keywords`, {
    method: "POST",
    headers: { "X-API-Key": token },
    body: formData,
  });
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, api_key } = await request.json();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  try {
    const scanText = text.length > 10000 ? text.slice(0, 10000) : text;
    const token = api_key || GUARDRAILS_TOKEN;

    // Try up to 2 times (ZTA endpoint can be intermittent)
    let res = await callAnonymize(scanText, token);
    if (!res.ok) {
      console.error("[Anonymize] First attempt failed:", res.status, "— retrying...");
      res = await callAnonymize(scanText, token);
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Anonymize] ZTA API error after retry:", res.status, errText.slice(0, 300));
      return Response.json({ error: `Anonymize failed: ${res.status}` }, { status: 502 });
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
