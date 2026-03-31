import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateScannerRequest } from "@/shared/lib/fraud-auth";

export async function GET(request: NextRequest) {
  if (!authenticateScannerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(Number(searchParams.get("batch_size")) || 50, 200);
  const cursor = searchParams.get("cursor"); // ISO timestamp — return transactions AFTER this time
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");
  const orgId = searchParams.get("org_id");

  const admin = createAdminClient();

  // Get the first organization if org_id not specified
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgs } = await (admin as any)
      .from("organizations")
      .select("id")
      .limit(1);
    if (!orgs || orgs.length === 0) {
      return Response.json({ error: "No organization found" }, { status: 404 });
    }
    resolvedOrgId = orgs[0].id;
  }

  // Query all org transactions — no customer scoping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("transactions")
    .select("transaction_id, type, amount, balance_before, balance_after, account_id, counterparty_account_id, description, status, created_at, metadata")
    .eq("organization_id", resolvedOrgId)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (cursor) {
    q = q.gt("created_at", cursor);
  } else if (fromDate) {
    q = q.gte("created_at", fromDate);
  }
  if (toDate) q = q.lte("created_at", toDate);

  const { data: transactions, error } = await q;
  if (error) {
    return Response.json({ error: "Failed to fetch transactions", detail: error.message }, { status: 500 });
  }

  if (!transactions || transactions.length === 0) {
    return Response.json({
      batch_id: null,
      transaction_count: 0,
      transactions: [],
      has_more: false,
      next_cursor: null,
      webhook_url: new URL("/api/v1/fraud-detection/webhook", request.url).toString(),
      created_at: new Date().toISOString(),
    });
  }

  const lastTxn = transactions[transactions.length - 1];
  const nextCursor = lastTxn.created_at;

  // Check if there are more
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: remainingCount } = await (admin as any)
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", resolvedOrgId)
    .gt("created_at", nextCursor);

  const hasMore = (remainingCount || 0) > 0;

  // Create batch record
  const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  const firstTxn = transactions[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: batchError } = await (admin as any)
    .from("fraud_scan_batches")
    .insert({
      batch_id: batchId,
      organization_id: resolvedOrgId,
      transaction_count: transactions.length,
      first_txn_at: firstTxn.created_at,
      last_txn_at: lastTxn.created_at,
      status: "pending",
    });

  if (batchError) {
    return Response.json({ error: "Failed to create batch", detail: batchError.message }, { status: 500 });
  }

  // Return transactions directly — no anonymization for demo
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
    batch_id: batchId,
    transaction_count: cleaned.length,
    transactions: cleaned,
    has_more: hasMore,
    next_cursor: nextCursor,
    webhook_url: webhookUrl,
    created_at: new Date().toISOString(),
  });
}
