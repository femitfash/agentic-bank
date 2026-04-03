import { NextRequest } from "next/server";
import { authenticateRequest } from "@/shared/lib/auth";
import { GUARDRAILS_URL } from "@/shared/lib/guardrails";

const ANONYMIZE_TOKEN = "zt-a2cbc48179784f43bca1e853d5fd307e";
const ANONYMIZE_PII_TYPES = "email, email address, gmail, person, organization, phone number, address, passport number, credit card number, social security number, health insurance id number, itin, date time, us passport_number, date, time, crypto currency number, url, date of birth, mobile phone number, bank account number, medication, cpf, driver's license number, tax identification number, medical condition, identity card number, national id number, ip address, iban, credit card expiration date, username, health insurance number, registration number, student id number, insurance number, flight number, landline phone number, blood type, cvv, reservation number, digital signature, social media handle, license plate number, cnpj, postal code, serial number, vehicle registration number, credit card brand, fax number, visa number, insurance company, identity document number, transaction number, national health insurance number, cvc, birth certificate number, train ticket number, passport expiration date, social_security_number, medical license";

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, api_key } = await request.json();
  console.log("[Anonymize] Request received, textLen:", text?.length, "hasApiKey:", !!api_key);
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  try {
    const scanText = text.length > 10000 ? text.slice(0, 10000) : text;
    const token = api_key || ANONYMIZE_TOKEN;

    // Use URLSearchParams instead of FormData for Vercel serverless compatibility
    const params = new URLSearchParams();
    params.append("pii_entity_types", ANONYMIZE_PII_TYPES);
    params.append("user_prompt", scanText);
    params.append("anonymize_keywords", "");
    params.append("safeguard_keywords", "hacking");
    params.append("preserve_keywords", "");
    params.append("response_language", "EN");

    const res = await fetch(`${GUARDRAILS_URL}/anonymize-sensitive-keywords`, {
      method: "POST",
      headers: {
        "X-Custom-Token": token,
        "content-type": "application/x-www-form-urlencoded",
        "accept": "application/json",
        "origin": "https://dev.zerotrusted.ai",
        "referer": "https://dev.zerotrusted.ai/",
      },
      body: params.toString(),
    });

    console.log("[Anonymize] ZTA response status:", res.status);

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Anonymize] ZTA API error:", res.status, errText.slice(0, 300));
      return Response.json({ error: `Anonymize failed: ${res.status} - ${errText.slice(0, 100)}` }, { status: 502 });
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
