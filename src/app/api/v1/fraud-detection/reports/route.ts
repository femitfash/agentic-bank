import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateScannerRequest } from "@/shared/lib/fraud-auth";

export async function GET(request: NextRequest) {
  if (!authenticateScannerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const batchId = searchParams.get("batch_id");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const admin = createAdminClient();

  // Detail mode: single batch with full results
  if (batchId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch } = await (admin as any)
      .from("fraud_scan_batches")
      .select("*")
      .eq("batch_id", batchId)
      .single();

    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: results } = await (admin as any)
      .from("fraud_scan_results")
      .select("transaction_id, risk_score, reason, scanner_id, scanned_at, created_at")
      .eq("batch_id", batchId)
      .order("risk_score", { ascending: false });

    return Response.json({
      batch: {
        ...batch,
        flagged_count: results?.length || 0,
        results: results || [],
      },
    });
  }

  // Summary mode: list batches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("fraud_scan_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) q = q.eq("user_id", userId);
  if (status) q = q.eq("status", status);

  const { data: batches, error } = await q;
  if (error) {
    return Response.json({ error: "Failed to fetch batches", detail: error.message }, { status: 500 });
  }

  // Attach flagged_count to each batch
  const batchIds = (batches || []).map((b: { batch_id: string }) => b.batch_id);

  let flagCounts: Record<string, number> = {};
  if (batchIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: results } = await (admin as any)
      .from("fraud_scan_results")
      .select("batch_id")
      .in("batch_id", batchIds);

    if (results) {
      flagCounts = results.reduce(
        (acc: Record<string, number>, r: { batch_id: string }) => {
          acc[r.batch_id] = (acc[r.batch_id] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
    }
  }

  const enriched = (batches || []).map((b: { batch_id: string }) => ({
    ...b,
    flagged_count: flagCounts[b.batch_id] || 0,
  }));

  return Response.json({ batches: enriched });
}
