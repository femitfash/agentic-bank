import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateScannerRequest } from "@/shared/lib/fraud-auth";
import { z } from "zod";

const WebhookSchema = z.object({
  batch_id: z.string().min(1),
  flagged_transactions: z.array(
    z.object({
      transaction_id: z.string().min(1),
      risk_score: z.number().min(0).max(100),
      reason: z.string().min(1),
    })
  ),
  scanner_id: z.string().min(1),
  scanned_at: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  if (!authenticateScannerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", detail: parsed.error.issues },
      { status: 400 }
    );
  }

  const { batch_id, flagged_transactions, scanner_id, scanned_at } = parsed.data;
  const admin = createAdminClient();

  // Verify the batch exists and is pending
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batch } = await (admin as any)
    .from("fraud_scan_batches")
    .select("batch_id, status")
    .eq("batch_id", batch_id)
    .single();

  if (!batch) {
    return Response.json({ error: "Batch not found" }, { status: 404 });
  }

  if (batch.status !== "pending") {
    return Response.json(
      { error: `Batch already processed (status: ${batch.status})` },
      { status: 409 }
    );
  }

  // Insert flagged transactions
  if (flagged_transactions.length > 0) {
    const rows = flagged_transactions.map((ft) => ({
      batch_id,
      transaction_id: ft.transaction_id,
      risk_score: ft.risk_score,
      reason: ft.reason,
      scanner_id,
      scanned_at,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (admin as any)
      .from("fraud_scan_results")
      .insert(rows);

    if (insertError) {
      return Response.json(
        { error: "Failed to store results", detail: insertError.message },
        { status: 500 }
      );
    }
  }

  // Update batch status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("fraud_scan_batches")
    .update({ status: "scanned" })
    .eq("batch_id", batch_id);

  return Response.json({
    success: true,
    batch_id,
    received: flagged_transactions.length,
  });
}
