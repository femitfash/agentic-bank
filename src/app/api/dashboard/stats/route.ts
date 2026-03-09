import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

export async function GET() {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ stats: null });

  const today = new Date().toISOString().split("T")[0];

  // Run all queries in parallel
  const [customersResult, accountsResult, todayTxnsResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("customers").select("id, kyc_status").eq("organization_id", organizationId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("accounts").select("id, account_type, balance, status").eq("organization_id", organizationId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("transactions").select("id, type, amount").eq("organization_id", organizationId).gte("created_at", today),
  ]);

  const customers = customersResult.data || [];
  const accounts = accountsResult.data || [];
  const todayTxns = todayTxnsResult.data || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalBalance = accounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayVolume = todayTxns.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  return Response.json({
    stats: {
      customers: {
        total: customers.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        verified: customers.filter((c: any) => c.kyc_status === "verified").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pending: customers.filter((c: any) => c.kyc_status === "pending").length,
      },
      accounts: {
        total: accounts.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checking: accounts.filter((a: any) => a.account_type === "checking").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        savings: accounts.filter((a: any) => a.account_type === "savings").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        active: accounts.filter((a: any) => a.status === "active").length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frozen: accounts.filter((a: any) => a.status === "frozen").length,
        totalBalance,
      },
      transactions: {
        todayCount: todayTxns.length,
        todayVolume,
      },
    },
  });
}
