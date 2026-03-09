import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { logAudit } from "@/shared/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 404 });

  // Fetch account with customer info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error } = await (admin as any)
    .from("accounts")
    .select("*, customers(first_name, last_name, customer_id, email)")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();

  if (error || !account) return Response.json({ error: "Account not found" }, { status: 404 });

  // Fetch recent transactions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transactions } = await (admin as any)
    .from("transactions")
    .select("id, transaction_id, type, amount, balance_after, reference, description, status, created_at")
    .eq("account_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return Response.json({ account, transactions: transactions || [] });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();

  if (!existing) return Response.json({ error: "Account not found" }, { status: 404 });

  const body = await request.json();
  const { status } = body;

  if (!status || !["active", "frozen", "closed"].includes(status)) {
    return Response.json({ error: "status must be 'active', 'frozen', or 'closed'" }, { status: 400 });
  }

  // Cannot close an account with a non-zero balance
  if (status === "closed" && Number(existing.balance) !== 0) {
    return Response.json({ error: "Cannot close an account with a non-zero balance" }, { status: 400 });
  }

  // Cannot reopen a closed account
  if (existing.status === "closed") {
    return Response.json({ error: "Cannot modify a closed account" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("accounts")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to update account", detail: error.message }, { status: 500 });

  void logAudit({
    organizationId,
    userId: user.id,
    action: `account.${status === "frozen" ? "frozen" : status === "active" ? "unfrozen" : "closed"}`,
    entityType: "account",
    entityId: id,
    oldValues: { status: existing.status },
    newValues: { status },
  });

  return Response.json({ success: true, account: data });
}
