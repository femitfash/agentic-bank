import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

const GUARDRAILS_URL = "https://dev-guardrails.zerotrusted.ai/api/v3";
const GUARDRAILS_TOKEN = "zt-0368d82c8af54483b61441e3e142825c";
const PII_ENTITY_TYPES = "email, email address, gmail, person, organization, phone number, address, passport number, credit card number, social security number";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });

  const body = await request.json();
  const { mode, content } = body as { mode: "detect" | "anonymize"; content: string };

  if (!mode || !content) {
    return Response.json({ error: "mode and content are required" }, { status: 400 });
  }

  const endpoint = mode === "anonymize"
    ? `${GUARDRAILS_URL}/anonymize-sensitive-keywords`
    : `${GUARDRAILS_URL}/detect-sensitive-keywords`;

  try {
    const formData = new FormData();
    formData.append("user_prompt", content);
    formData.append("pii_entity_types", PII_ENTITY_TYPES);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Custom-Token": GUARDRAILS_TOKEN,
      },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `Guardrails API error: ${res.status} ${text}` }, { status: 502 });
    }

    const data = await res.json();
    return Response.json({ mode, result: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `PII check failed: ${msg}` }, { status: 500 });
  }
}
