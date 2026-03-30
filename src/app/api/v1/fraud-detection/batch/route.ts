import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateScannerRequest } from "@/shared/lib/fraud-auth";
import { pseudonymizeId, anonymizeTransaction } from "@/shared/lib/fraud-anonymize";

export async function GET(request: NextRequest) {
  if (!authenticateScannerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const batchSize = Math.min(Number(searchParams.get("batch_size")) || 50, 200);
  const cursor = searchParams.get("cursor"); // ISO timestamp — return transactions AFTER this time
  const fromDate = searchParams.get("from_date"); // legacy: inclusive lower bound
  const toDate = searchParams.get("to_date"); // inclusive upper bound

  if (!userId) {
    return Response.json({ error: "user_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve real customer by hashing all customer IDs and finding a match
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customers } = await (admin as any)
    .from("customers")
    .select("id, organization_id");

  if (!customers || customers.length === 0) {
    return Response.json({ error: "No customers found" }, { status: 404 });
  }

  const matched = customers.find((c: { id: string }) => pseudonymizeId(c.id) === userId);
  if (!matched) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Get accounts for this customer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (admin as any)
    .from("accounts")
    .select("id")
    .eq("customer_id", matched.id);

  if (!accounts || accounts.length === 0) {
    return Response.json({ error: "No accounts found for user" }, { status: 404 });
  }

  const accountIds = accounts.map((a: { id: string }) => a.id);

  // Query transactions — cursor-based pagination
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("transactions")
    .select("transaction_id, type, amount, balance_before, balance_after, account_id, counterparty_account_id, description, status, created_at, metadata")
    .in("account_id", accountIds)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  // cursor takes priority over from_date — it means "give me transactions AFTER this timestamp"
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
      user_id: userId,
      transaction_count: 0,
      transactions: [],
      has_more: false,
      next_cursor: null,
      webhook_url: new URL("/api/v1/fraud-detection/webhook", request.url).toString(),
      created_at: new Date().toISOString(),
    });
  }

  // Determine cursor for next page — the created_at of the last transaction in this batch
  const lastTxn = transactions[transactions.length - 1];
  const nextCursor = lastTxn.created_at;

  // Check if there are more transactions beyond this batch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: remainingCount } = await (admin as any)
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .in("account_id", accountIds)
    .gt("created_at", nextCursor);

  const hasMore = (remainingCount || 0) > 0;

  // Create batch record with time range for accurate scope reconstruction
  const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  const firstTxn = transactions[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: batchError } = await (admin as any)
    .from("fraud_scan_batches")
    .insert({
      batch_id: batchId,
      organization_id: matched.organization_id,
      user_id: userId,
      transaction_count: transactions.length,
      first_txn_at: firstTxn.created_at,
      last_txn_at: lastTxn.created_at,
      status: "pending",
    });

  if (batchError) {
    return Response.json({ error: "Failed to create batch", detail: batchError.message }, { status: 500 });
  }

  // Anonymize transactions
  const anonymized = transactions.map(anonymizeTransaction);

  // Build webhook URL from request origin
  const webhookUrl = new URL("/api/v1/fraud-detection/webhook", request.url).toString();

  return Response.json({
    batch_id: batchId,
    user_id: userId,
    transaction_count: anonymized.length,
    transactions: anonymized,
    has_more: hasMore,
    next_cursor: nextCursor,
    webhook_url: webhookUrl,
    created_at: new Date().toISOString(),
  });
}
