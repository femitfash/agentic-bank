import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

/**
 * Admin-only endpoint that returns a preview of what the scanner receives
 * from GET /api/v1/fraud-detection/batch.
 */
export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization found" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(Number(searchParams.get("batch_size")) || 50, 200);

  // Query all org transactions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transactions, error } = await (admin as any)
    .from("transactions")
    .select("transaction_id, type, amount, balance_before, balance_after, account_id, counterparty_account_id, description, status, created_at, metadata")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    return Response.json({ error: "Failed to fetch transactions", detail: error.message }, { status: 500 });
  }

  if (!transactions || transactions.length === 0) {
    return Response.json({ error: "No transactions found" }, { status: 404 });
  }

  const cleaned = transactions.map((txn: Record<string, unknown>) => ({
    transaction_id: txn.transaction_id,
    type: txn.type,
    amount: Number(txn.amount),
    balance_before: Number(txn.balance_before),
    balance_after: Number(txn.balance_after),
    account_id: txn.account_id,
    counterparty_account_id: txn.counterparty_account_id || null,
    description: txn.description,
    status: txn.status,
    created_at: txn.created_at,
    metadata: txn.metadata || null,
  }));

  const webhookUrl = new URL("/api/v1/fraud-detection/webhook", request.url).toString();

  return Response.json({
    _preview: true,
    _note: "This is a preview of what the scanner receives from GET /api/v1/fraud-detection/batch. The batch_id is for preview only.",
    batch_id: `PREVIEW-${Date.now().toString(36).toUpperCase()}`,
    transaction_count: cleaned.length,
    transactions: cleaned,
    webhook_url: webhookUrl,
    created_at: new Date().toISOString(),
  });
}
