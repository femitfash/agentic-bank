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
    formData.append("anonymize_keywords", "");
    formData.append("safeguard_keywords", "");
    formData.append("uploaded_file", "");
    formData.append("preserve_keywords", "");
    formData.append("response_language", "EN");

    const res = await fetch(`${GUARDRAILS_URL}/anonymize-sensitive-keywords`, {
      method: "POST",
      headers: {
        "X-Custom-Token": GUARDRAILS_TOKEN,
        "accept": "application/json, text/plain, */*",
        "origin": "https://dev.zerotrusted.ai",
        "referer": "https://dev.zerotrusted.ai/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Anonymize] ZTA API error:", res.status, errText.slice(0, 200));
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
