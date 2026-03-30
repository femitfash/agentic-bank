import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { pseudonymizeId, anonymizeTransaction } from "@/shared/lib/fraud-anonymize";

/**
 * Admin-only endpoint that returns the exact payload a scanner would receive
 * from GET /api/v1/fraud-detection/batch — but using the real customer UUID
 * directly, bypassing the hash lookup.
 */
export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization found" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const customerUuid = searchParams.get("customer_uuid");
  const batchSize = Math.min(Number(searchParams.get("batch_size")) || 50, 200);

  if (!customerUuid) {
    return Response.json({ error: "customer_uuid is required" }, { status: 400 });
  }

  // Get accounts for this customer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (admin as any)
    .from("accounts")
    .select("id")
    .eq("customer_id", customerUuid);

  if (!accounts || accounts.length === 0) {
    return Response.json({ error: "No accounts found for customer" }, { status: 404 });
  }

  const accountIds = accounts.map((a: { id: string }) => a.id);

  // Query transactions — same as batch endpoint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transactions, error } = await (admin as any)
    .from("transactions")
    .select("transaction_id, type, amount, balance_before, balance_after, account_id, counterparty_account_id, description, status, created_at, metadata")
    .in("account_id", accountIds)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    return Response.json({ error: "Failed to fetch transactions", detail: error.message }, { status: 500 });
  }

  if (!transactions || transactions.length === 0) {
    return Response.json({ error: "No transactions found" }, { status: 404 });
  }

  // Anonymize exactly like the batch endpoint
  const anonymized = transactions.map(anonymizeTransaction);
  const anonUserId = pseudonymizeId(customerUuid);

  // Build the same response shape as GET /batch
  const webhookUrl = new URL("/api/v1/fraud-detection/webhook", request.url).toString();

  return Response.json({
    _preview: true,
    _note: "This is a preview of what the scanner receives from GET /api/v1/fraud-detection/batch. The batch_id shown is for preview only and is not persisted.",
    batch_id: `PREVIEW-${Date.now().toString(36).toUpperCase()}`,
    user_id: anonUserId,
    transaction_count: anonymized.length,
    transactions: anonymized,
    webhook_url: webhookUrl,
    created_at: new Date().toISOString(),
  });
}
