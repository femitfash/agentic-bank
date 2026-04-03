import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { HALLUCINATION_URL, HALLUCINATION_TOKEN } from "@/shared/lib/guardrails";

const ENCRYPTED_PROVIDER_KEY = process.env.ZT_ENCRYPTED_PROVIDER_KEY || "";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { user_prompt, ai_response, model, api_key } = body;

  console.log("[Hallucination Check] Request received:", {
    hasUserPrompt: !!user_prompt,
    promptLength: user_prompt?.length,
    hasAiResponse: !!ai_response,
    responseLength: ai_response?.length,
    model,
    hasApiKey: !!api_key,
    hasEncryptedKey: !!ENCRYPTED_PROVIDER_KEY,
  });

  if (!user_prompt || !ai_response) {
    console.error("[Hallucination Check] Missing fields:", { user_prompt: !!user_prompt, ai_response: !!ai_response });
    return Response.json({ error: "user_prompt and ai_response are required" }, { status: 400 });
  }

  // Truncate to avoid 502 from Azure gateway on large payloads
  const truncatedResponse = ai_response.length > 3000 ? ai_response.slice(0, 3000) + "..." : ai_response;
  const truncatedPrompt = user_prompt.length > 1000 ? user_prompt.slice(0, 1000) + "..." : user_prompt;

  if (!ENCRYPTED_PROVIDER_KEY) {
    console.error("[Hallucination Check] ZT_ENCRYPTED_PROVIDER_KEY is not set in env");
    return Response.json({ error: "Hallucination check not configured (ZT_ENCRYPTED_PROVIDER_KEY missing)" }, { status: 501 });
  }

  try {
    const requestUrl = `${HALLUCINATION_URL}?service=openai`;
    const requestBody = {
      provider_api_key: ENCRYPTED_PROVIDER_KEY,
      evaluator_model: "gpt-4.1",
      candidate_responses: [
        { model: model || "claude-sonnet-4-20250514", response: truncatedResponse },
      ],
      user_prompt: truncatedPrompt,
      is_provider_api_key_encrypted: true,
      response_language: "EN",
    };
    const token = api_key || HALLUCINATION_TOKEN;

    console.log("[Hallucination Check] Sending to ZTA:", {
      url: requestUrl,
      token: token.slice(0, 10) + "...",
      bodySize: JSON.stringify(requestBody).length,
      promptLength: truncatedPrompt.length,
      responseLength: truncatedResponse.length,
    });

    const res = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "accept-language": "en-US,en;q=0.9",
        "X-Custom-Token": token,
        "content-type": "application/json",
        "origin": "https://dev.zerotrusted.ai",
        "priority": "u=1, i",
        "referer": "https://dev.zerotrusted.ai/",
        "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[Hallucination Check] ZTA response status:", res.status);

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Hallucination Check] ZTA API error:", res.status, errText.slice(0, 300));
      return Response.json({ error: `Reliability check failed: ${res.status} ${errText.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    console.log("[Hallucination Check] ZTA response data:", JSON.stringify(data).slice(0, 300));

    // ZTA response format:
    // { success: true, data: "{ \"model\": { \"rank\": \"1\", \"score\": \"99\", \"explanation\": \"...\" }, ... }" }
    let score = 50;
    let explanation = "";
    const modelName = model || "claude-sonnet-4-20250514";

    if (data.success && data.data) {
      try {
        const parsed = typeof data.data === "string" ? JSON.parse(data.data) : data.data;
        // Find the score for our model, or take the first model's score
        const modelResult = parsed[modelName] || Object.values(parsed).find(
          (v: unknown) => typeof v === "object" && v !== null && "score" in (v as Record<string, unknown>)
        );
        if (modelResult && typeof modelResult === "object" && "score" in modelResult) {
          const m = modelResult as { score: string; explanation?: string };
          score = parseInt(m.score, 10) || 50;
          explanation = m.explanation || "";
        }
      } catch {
        // Failed to parse nested JSON — use default score
      }
    }

    const reliable = score >= 70;

    return Response.json({
      reliable,
      score,
      explanation,
      details: data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Reliability check failed: ${msg}` }, { status: 500 });
  }
}
