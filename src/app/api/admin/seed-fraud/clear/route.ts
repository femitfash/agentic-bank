import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

/**
 * DELETE /api/admin/seed-fraud/clear
 *
 * Deletes ALL seeded transactions, scan results, scan batches,
 * accounts, and customer for the current org.
 * Query params:
 *   keep_customer=true  — keep the customer/accounts, only delete transactions + scan data
 */
export async function DELETE(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization found" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const keepCustomer = searchParams.get("keep_customer") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // 1. Delete scan results and batches for this org
  const { data: batches } = await db
    .from("fraud_scan_batches")
    .select("batch_id")
    .eq("organization_id", orgId);

  if (batches && batches.length > 0) {
    const batchIds = batches.map((b: any) => b.batch_id);
    await db.from("fraud_scan_results").delete().in("batch_id", batchIds);
    await db.from("fraud_scan_batches").delete().eq("organization_id", orgId);
  }

  // Clear ground truth
  await db.from("fraud_ground_truth").delete().eq("organization_id", orgId);

  // 2. Get all accounts for this org
  const { data: accounts } = await db
    .from("accounts")
    .select("id")
    .eq("organization_id", orgId);

  const accountIds = (accounts || []).map((a: any) => a.id);

  // 3. Delete all transactions for these accounts
  let deletedTxns = 0;
  if (accountIds.length > 0) {
    const { count } = await db
      .from("transactions")
      .delete({ count: "exact" })
      .in("account_id", accountIds);
    deletedTxns = count || 0;
  }

  // 4. Optionally delete accounts and customers
  let deletedAccounts = 0;
  let deletedCustomers = 0;
  if (!keepCustomer) {
    if (accountIds.length > 0) {
      const { count } = await db
        .from("accounts")
        .delete({ count: "exact" })
        .eq("organization_id", orgId);
      deletedAccounts = count || 0;
    }

    const { count } = await db
      .from("customers")
      .delete({ count: "exact" })
      .eq("organization_id", orgId);
    deletedCustomers = count || 0;
  } else {
    // Reset account balances to 0
    if (accountIds.length > 0) {
      await db.from("accounts").update({ balance: 0 }).in("id", accountIds);
    }
  }

  return Response.json({
    success: true,
    message: `Deleted ${deletedTxns} transactions, ${batches?.length || 0} scan batches${!keepCustomer ? `, ${deletedAccounts} accounts, ${deletedCustomers} customers` : " (customers/accounts kept, balances reset)"}`,
    deleted: {
      transactions: deletedTxns,
      scan_batches: batches?.length || 0,
      accounts: deletedAccounts,
      customers: deletedCustomers,
    },
  });
}
