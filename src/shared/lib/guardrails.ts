export const GUARDRAILS_URL = "https://dev-guardrails.zerotrusted.ai/api/v3";
export const GUARDRAILS_TOKEN = "zt-0368d82c8af54483b61441e3e142825c";
export const HALLUCINATION_URL = "https://dev-agents.zerotrusted.ai/api/v1/responses/evaluate-reliability";
export const HALLUCINATION_TOKEN = "zt-a2cbc48179784f43bca1e853d5fd307e";
export const PII_ENTITY_TYPES = "email, email address, gmail, person, organization, phone number, address, passport number, credit card number, social security number";

export interface PiiDetection {
  entity_type: string;
  text: string;
  start?: number;
  end?: number;
  score?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
