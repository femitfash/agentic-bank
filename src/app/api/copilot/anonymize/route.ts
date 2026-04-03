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

    const formData = new FormData();
    formData.append("pii_entity_types", ANONYMIZE_PII_TYPES);
    formData.append("user_prompt", scanText);
    formData.append("anonymize_keywords", "");
    formData.append("safeguard_keywords", "hacking");
    formData.append("uploaded_file", "");
    formData.append("preserve_keywords", "");
    formData.append("response_language", "EN");

    const res = await fetch(`${GUARDRAILS_URL}/anonymize-sensitive-keywords`, {
      method: "POST",
      headers: {
        "X-Custom-Token": token,
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
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
      body: formData,
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
