import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { HALLUCINATION_URL, HALLUCINATION_TOKEN } from "@/shared/lib/guardrails";

const ENCRYPTED_PROVIDER_KEY = process.env.ZT_ENCRYPTED_PROVIDER_KEY || "";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { user_prompt, ai_response, model } = await request.json();
  if (!user_prompt || !ai_response) {
    return Response.json({ error: "user_prompt and ai_response are required" }, { status: 400 });
  }

  if (!ENCRYPTED_PROVIDER_KEY) {
    return Response.json({ error: "Hallucination check not configured (ZT_ENCRYPTED_PROVIDER_KEY missing)" }, { status: 501 });
  }

  try {
    const res = await fetch(`${HALLUCINATION_URL}?service=openai`, {
      method: "POST",
      headers: {
        "X-Custom-Token": HALLUCINATION_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider_api_key: ENCRYPTED_PROVIDER_KEY,
        evaluator_model: "gpt-4.1",
        candidate_responses: [
          { model: model || "claude-sonnet-4-20250514", response: ai_response },
        ],
        user_prompt,
        is_provider_api_key_encrypted: true,
        response_language: "EN",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `Reliability check failed: ${res.status} ${errText}` }, { status: 502 });
    }

    const data = await res.json();

    // Extract reliability score from response
    const score = data?.overall_score ?? data?.reliability_score ?? data?.score ?? 50;
    const reliable = score >= 70;

    return Response.json({
      reliable,
      score: Math.round(score),
      details: data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Reliability check failed: ${msg}` }, { status: 500 });
  }
}
