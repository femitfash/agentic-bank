import { NextRequest } from "next/server";

/**
 * Authenticates fraud scanner API requests via x-scanner-api-key header.
 * Returns true if authenticated, false otherwise.
 */
export function authenticateScannerRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-scanner-api-key");
  const expectedKey = process.env.FRAUD_SCANNER_API_KEY;

  // In development without a configured key, allow all requests
  if (!expectedKey && process.env.NODE_ENV === "development") {
    return true;
  }

  if (!expectedKey || !apiKey) return false;
  return apiKey === expectedKey;
}
