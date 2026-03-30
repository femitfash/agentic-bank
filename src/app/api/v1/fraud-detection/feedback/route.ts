import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateScannerRequest } from "@/shared/lib/fraud-auth";

/**
 * GET /api/v1/fraud-detection/feedback
 *
 * Returns validation feedback for the scanner: which transactions were correctly
 * detected, which were missed, and which were false positives.
 * Includes ground truth for reinforcement learning.
 *
 * Query params:
 *   batch_id    - filter to a specific scanner batch (required)
 *   status      - filter: "detected", "missed", "false_positive" (optional)
 *   fraud_ids   - (optional) comma-separated ground truth fraud IDs — overrides DB
 *   fraud_notes - (optional) JSON { txn_id: note } — overrides DB
 *
 * Auth: x-scanner-api-key header
 */
export async function GET(request: NextRequest) {
  if (!authenticateScannerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fraudIdsRaw = searchParams.get("fraud_ids") || "";
  const fraudNotesRaw = searchParams.get("fraud_notes") || "";
  const batchId = searchParams.get("batch_id");
  const statusFilter = searchParams.get("status");

  const admin = createAdminClient();

  // Load ground truth — from query params or from DB
  let groundTruthIds: Set<string>;
  let groundTruthNotes: Record<string, string> = {};

  if (fraudIdsRaw) {
    // Legacy: caller provides fraud IDs directly
    groundTruthIds = new Set(fraudIdsRaw.split(",").map(s => s.trim()).filter(Boolean));
    if (fraudNotesRaw) {
      try { groundTruthNotes = JSON.parse(fraudNotesRaw); } catch { /* ignore */ }
    }
  } else {
    // Load from fraud_ground_truth table — resolve org from batch
    if (!batchId) {
      return Response.json({
        error: "batch_id is required (or provide fraud_ids for legacy mode)",
      }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch } = await (admin as any)
      .from("fraud_scan_batches")
      .select("organization_id")
      .eq("batch_id", batchId)
      .single();

    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: gtRows } = await (admin as any)
      .from("fraud_ground_truth")
      .select("transaction_id, note")
      .eq("organization_id", batch.organization_id)
      .eq("is_fraud", true);

    groundTruthIds = new Set((gtRows || []).map((r: { transaction_id: string }) => r.transaction_id));
    for (const r of gtRows || []) {
      if (r.note) groundTruthNotes[r.transaction_id] = r.note;
    }
  }

  if (groundTruthIds.size === 0) {
    return Response.json({
      error: "No ground truth data found. Generate seed data in the bank admin first.",
    }, { status: 404 });
  }

  // Get scanner results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scanQ = (admin as any)
    .from("fraud_scan_results")
    .select("transaction_id, risk_score, reason, scanner_id, batch_id");

  if (batchId) scanQ = scanQ.eq("batch_id", batchId);

  const { data: scanResults } = await scanQ;
  const scannerMap = new Map<string, { risk_score: number; reason: string; batch_id: string }>();
  for (const r of scanResults || []) {
    const existing = scannerMap.get(r.transaction_id);
    if (!existing || Number(r.risk_score) > existing.risk_score) {
      scannerMap.set(r.transaction_id, {
        risk_score: Number(r.risk_score),
        reason: r.reason,
        batch_id: r.batch_id,
      });
    }
  }

  // Fetch transaction details for all relevant IDs
  const allTxnIds = new Set([...groundTruthIds, ...scannerMap.keys()]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: txnData } = await (admin as any)
    .from("transactions")
    .select("transaction_id, type, amount, description, created_at")
    .in("transaction_id", [...allTxnIds])
    .order("created_at", { ascending: true });

  // Build feedback rows with ground truth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feedback = (txnData || []).map((t: any) => {
    const isGroundTruth = groundTruthIds.has(t.transaction_id);
    const scan = scannerMap.get(t.transaction_id);

    let status: string;
    if (isGroundTruth && scan) status = "detected";
    else if (isGroundTruth && !scan) status = "missed";
    else if (!isGroundTruth && scan) status = "false_positive";
    else return null;

    return {
      transaction_id: t.transaction_id,
      status,
      type: t.type,
      amount: Number(t.amount),
      description: t.description,
      created_at: t.created_at,
      // Ground truth for reinforcement learning
      is_ground_truth_fraud: isGroundTruth,
      ground_truth_note: isGroundTruth ? (groundTruthNotes[t.transaction_id] || null) : null,
      // Scanner results
      scanner_flagged: !!scan,
      scanner_risk_score: scan?.risk_score ?? null,
      scanner_reason: scan?.reason ?? null,
      scanner_batch_id: scan?.batch_id ?? null,
    };
  }).filter(Boolean);

  // Apply status filter
  const filtered = statusFilter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? feedback.filter((r: any) => r.status === statusFilter)
    : feedback;

  // Summary stats
  const detected = feedback.filter((r: any) => r.status === "detected").length;
  const missed = feedback.filter((r: any) => r.status === "missed").length;
  const falsePositives = feedback.filter((r: any) => r.status === "false_positive").length;

  return Response.json({
    feedback: filtered,
    total: filtered.length,
    summary: {
      ground_truth_count: groundTruthIds.size,
      detected,
      missed,
      false_positives: falsePositives,
      detection_rate: (detected + missed) > 0 ? Math.round((detected / (detected + missed)) * 100) : 0,
      precision: (detected + falsePositives) > 0 ? Math.round((detected / (detected + falsePositives)) * 100) : 0,
    },
  });
}
