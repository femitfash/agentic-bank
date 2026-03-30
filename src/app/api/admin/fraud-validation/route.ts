import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization found" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const fraudIdsRaw = searchParams.get("fraud_ids") || "";
  const fraudNotesRaw = searchParams.get("fraud_notes") || "{}";
  const batchId = searchParams.get("batch_id");
  const accountId = searchParams.get("account_id");
  const customerId = searchParams.get("customer_id");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(Number(searchParams.get("page_size")) || 100, 500);

  // Parse ground truth
  const allGroundTruthIds = new Set(
    fraudIdsRaw.split(",").map(s => s.trim()).filter(Boolean)
  );
  let groundTruthNotes: Record<string, string> = {};
  try { groundTruthNotes = JSON.parse(fraudNotesRaw); } catch { /* ignore */ }

  // Get ALL scanner results (override Supabase default 1000-row limit)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scanQ = (admin as any)
    .from("fraud_scan_results")
    .select("transaction_id, risk_score, reason, scanner_id, batch_id, scanned_at")
    .limit(10000);

  if (batchId) scanQ = scanQ.eq("batch_id", batchId);

  const { data: scanResults } = await scanQ;
  const scannerMap = new Map<string, { risk_score: number; reason: string; batch_id: string; scanner_id: string }>();
  for (const r of scanResults || []) {
    const existing = scannerMap.get(r.transaction_id);
    if (!existing || Number(r.risk_score) > existing.risk_score) {
      scannerMap.set(r.transaction_id, {
        risk_score: Number(r.risk_score),
        reason: r.reason,
        batch_id: r.batch_id,
        scanner_id: r.scanner_id,
      });
    }
  }

  // Find which transaction IDs were actually sent to scanners.
  // This is needed both for single-batch and all-batches views — the scanner
  // can't detect what it never received, so unsent fraud = "not_in_batch", not "missed".
  let batchTxnIds: Set<string> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgAccounts } = await (admin as any)
    .from("accounts")
    .select("id")
    .eq("organization_id", orgId);

  const acctIds = (orgAccounts || []).map((a: { id: string }) => a.id);

  if (acctIds.length > 0) {
    if (batchId) {
      // Single batch — use its time range
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: batch } = await (admin as any)
        .from("fraud_scan_batches")
        .select("transaction_count, first_txn_at, last_txn_at")
        .eq("batch_id", batchId)
        .single();

      if (batch) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let batchQ = (admin as any)
          .from("transactions")
          .select("transaction_id")
          .in("account_id", acctIds)
          .order("created_at", { ascending: true });

        if (batch.first_txn_at && batch.last_txn_at) {
          batchQ = batchQ
            .gte("created_at", batch.first_txn_at)
            .lte("created_at", batch.last_txn_at);
        } else {
          batchQ = batchQ.limit(batch.transaction_count || 200);
        }

        const { data: batchTxns } = await batchQ;
        if (batchTxns) {
          batchTxnIds = new Set(batchTxns.map((t: { transaction_id: string }) => t.transaction_id));
        }
      }
    } else {
      // All Batches view — no scoping. Show the aggregate:
      // every unflagged fraud txn = "missed", every flagged fraud txn = "detected".
      // Users drill into specific batches for batch-scoped accuracy.
      batchTxnIds = null;
    }
  }

  // Scope ground truth to batch if we know which txns were in the batch
  const groundTruthIds = batchTxnIds
    ? new Set([...allGroundTruthIds].filter(id => batchTxnIds!.has(id)))
    : allGroundTruthIds;

  // Determine which transactions to fetch
  const isAllBatches = !batchId;
  let txnIdsToFetch: Set<string> | null = null; // null = fetch all org txns (paginated)

  if (batchTxnIds) {
    // Single batch — fetch all transactions in the batch + any scanner flagged
    txnIdsToFetch = new Set([...batchTxnIds, ...scannerMap.keys()]);
  }
  // else: All Batches — txnIdsToFetch stays null, we fetch ALL org transactions

  const emptyResult = {
    transactions: [],
    summary: { total_ground_truth: 0, total_scanner_flagged: 0, detected: 0, missed: 0, false_positives: 0, detection_rate: 0, precision: 0 },
    batches: [],
    customers: [],
    accounts: [],
    pagination: { page, page_size: pageSize, total: 0, total_pages: 0 },
  };

  // Fetch transaction details
  const txnSelect = "transaction_id, type, amount, description, created_at, account_id, accounts!account_id(account_number, account_type, customer_id, customers(id, first_name, last_name, customer_id))";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txnQ: any;
  let totalCount = 0;

  if (txnIdsToFetch) {
    if (txnIdsToFetch.size === 0) return Response.json(emptyResult);

    // Single batch — fetch by ID list (no pagination needed, batch is bounded)
    txnQ = (admin as any)
      .from("transactions")
      .select(txnSelect)
      .eq("organization_id", orgId)
      .in("transaction_id", [...txnIdsToFetch])
      .order("created_at", { ascending: true });

    if (accountId) txnQ = txnQ.eq("account_id", accountId);
    totalCount = txnIdsToFetch.size;
  } else {
    // All Batches — fetch ALL org transactions with pagination
    // First get total count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let countQ = (admin as any)
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if (accountId) countQ = countQ.eq("account_id", accountId);
    const { count } = await countQ;
    totalCount = count || 0;

    if (totalCount === 0) return Response.json(emptyResult);

    const offset = (page - 1) * pageSize;
    txnQ = (admin as any)
      .from("transactions")
      .select(txnSelect)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (accountId) txnQ = txnQ.eq("account_id", accountId);
  }

  const { data: txnData, error: txnError } = await txnQ;
  if (txnError) {
    return Response.json({ error: "Failed to fetch transactions", detail: txnError.message }, { status: 500 });
  }

  // If filtering by customer, filter in memory
  let transactions = txnData || [];
  if (customerId) {
    transactions = transactions.filter((t: any) =>
      t.accounts?.customers?.id === customerId
    );
  }

  // Track which ground truth fraud IDs were NOT in the batch (for info)
  const outOfBatchFraudIds = batchTxnIds
    ? [...allGroundTruthIds].filter(id => !batchTxnIds!.has(id))
    : [];

  // Build comparison rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = transactions.map((t: any) => {
    const isGroundTruth = allGroundTruthIds.has(t.transaction_id);
    const scanResult = scannerMap.get(t.transaction_id);
    const scannerFlagged = !!scanResult;
    // A txn is in batch scope if: no batch filter, OR it's in the reconstructed set,
    // OR the scanner flagged it in this batch (scanner result is proof it was in the batch)
    const isInBatchScope = !batchTxnIds || batchTxnIds.has(t.transaction_id) || scannerFlagged;

    let status: string;
    if (isGroundTruth && scannerFlagged) status = "detected";
    else if (isGroundTruth && isInBatchScope && !scannerFlagged) status = "missed";
    else if (isGroundTruth && !isInBatchScope) status = "not_in_batch";
    else if (!isGroundTruth && scannerFlagged) status = "false_positive";
    else status = "clean";

    return {
      transaction_id: t.transaction_id,
      type: t.type,
      amount: Number(t.amount),
      description: t.description,
      created_at: t.created_at,
      account_id: t.account_id,
      account_number: t.accounts?.account_number || "",
      account_type: t.accounts?.account_type || "",
      customer_name: t.accounts?.customers
        ? `${t.accounts.customers.first_name} ${t.accounts.customers.last_name}`
        : "",
      customer_id: t.accounts?.customers?.id || "",
      is_ground_truth_fraud: isGroundTruth,
      ground_truth_note: isGroundTruth ? (groundTruthNotes[t.transaction_id] || "Fraudulent") : null,
      scanner_flagged: scannerFlagged,
      scanner_risk_score: scanResult?.risk_score ?? null,
      scanner_reason: scanResult?.reason ?? null,
      scanner_batch_id: scanResult?.batch_id ?? null,
      status,
    };
  });

  // Compute summary — must reflect ALL data, not just current page
  let detected: number, missed: number, falsePositives: number;

  if (isAllBatches) {
    // For "All Batches", compute globally from ground truth + scanner maps.
    // Only count fraud IDs that actually exist in the DB (some may have been deleted).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingFraudTxns } = await (admin as any)
      .from("transactions")
      .select("transaction_id")
      .eq("organization_id", orgId)
      .in("transaction_id", [...allGroundTruthIds]);

    const existingFraudIds = new Set<string>(
      (existingFraudTxns || []).map((t: { transaction_id: string }) => t.transaction_id)
    );

    detected = [...existingFraudIds].filter(id => scannerMap.has(id)).length;
    missed = [...existingFraudIds].filter(id => !scannerMap.has(id)).length;
    falsePositives = [...scannerMap.keys()].filter(id => !existingFraudIds.has(id)).length;
  } else {
    // Single batch — compute from rows (already contains all batch txns)
    detected = rows.filter((r: any) => r.status === "detected").length;
    missed = rows.filter((r: any) => r.status === "missed").length;
    falsePositives = rows.filter((r: any) => r.status === "false_positive").length;
  }

  const totalGroundTruth = detected + missed;
  const totalScannerFlagged = detected + falsePositives;

  const summary = {
    total_ground_truth: totalGroundTruth,
    total_scanner_flagged: totalScannerFlagged,
    detected,
    missed,
    false_positives: falsePositives,
    // Detection rate = detected / (detected + missed) — what % of in-scope fraud was caught
    detection_rate: totalGroundTruth > 0 ? Math.round((detected / totalGroundTruth) * 1000) / 10 : 0,
    // Precision = detected / (detected + false_positives) — what % of flags were correct
    precision: totalScannerFlagged > 0 ? Math.round((detected / totalScannerFlagged) * 1000) / 10 : 0,
    out_of_batch_fraud: outOfBatchFraudIds.length,
    batch_scoped: !!batchTxnIds,
    total_in_batch: batchTxnIds?.size || null,
  };

  // Fetch filter options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batches } = await (admin as any)
    .from("fraud_scan_batches")
    .select("batch_id, status, transaction_count, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customers } = await (admin as any)
    .from("customers")
    .select("id, first_name, last_name, customer_id")
    .eq("organization_id", orgId)
    .order("last_name");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (admin as any)
    .from("accounts")
    .select("id, account_number, account_type, customer_id")
    .eq("organization_id", orgId)
    .order("account_number");

  const totalPages = isAllBatches ? Math.ceil(totalCount / pageSize) : 1;

  return Response.json({
    transactions: rows,
    summary,
    batches: batches || [],
    customers: customers || [],
    accounts: accounts || [],
    pagination: {
      page,
      page_size: pageSize,
      total: totalCount,
      total_pages: totalPages,
    },
  });
}
