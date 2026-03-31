import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { GUARDRAILS_URL, GUARDRAILS_TOKEN, PII_ENTITY_TYPES } from "@/shared/lib/guardrails";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await request.json();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  try {
    // Truncate to avoid overwhelming the API (scan first ~10KB)
    const scanText = text.length > 10000 ? text.slice(0, 10000) : text;

    const formData = new FormData();
    formData.append("user_prompt", scanText);
    formData.append("pii_entity_types", PII_ENTITY_TYPES);

    const res = await fetch(`${GUARDRAILS_URL}/detect-sensitive-keywords`, {
      method: "POST",
      headers: { "X-Custom-Token": GUARDRAILS_TOKEN },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `PII check failed: ${res.status} ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const detections = data?.detected_entities || data?.entities || data?.results || [];

    return Response.json({
      has_pii: detections.length > 0,
      detections: detections.map((d: Record<string, unknown>) => ({
        entity_type: d.entity_type || d.type || "PII",
        text: d.text || d.value || "",
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `PII check failed: ${msg}` }, { status: 500 });
  }
}
