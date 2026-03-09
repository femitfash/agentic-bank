import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, createdBy, getOrganizationId } from "@/shared/lib/auth";
import { logAudit } from "@/shared/lib/audit";

function generateAccountNumber(): string {
  // Generate a 10-digit account number
  const base = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return base + random;
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ accounts: [] });

  const { searchParams } = new URL(request.url);
  const customer_id = searchParams.get("customer_id");
  const account_type = searchParams.get("account_type");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("accounts")
    .select("*, customers(first_name, last_name, customer_id)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (customer_id) q = q.eq("customer_id", customer_id);
  if (account_type) q = q.eq("account_type", account_type);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return Response.json({ accounts: [], error: error.message });

  return Response.json({ accounts: data || [] });
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 400 });

  const body = await request.json();
  const { customer_id, account_type, currency } = body;

  if (!customer_id) return Response.json({ error: "customer_id is required" }, { status: 400 });
  if (!account_type || !["checking", "savings"].includes(account_type)) {
    return Response.json({ error: "account_type must be 'checking' or 'savings'" }, { status: 400 });
  }

  // Verify customer belongs to this org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (admin as any)
    .from("customers")
    .select("id")
    .eq("id", customer_id)
    .eq("organization_id", organizationId)
    .single();

  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  const accountId = `ACCT-${Date.now().toString(36).toUpperCase()}`;
  const accountNumber = generateAccountNumber();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("accounts")
    .insert({
      organization_id: organizationId,
      account_id: accountId,
      customer_id,
      account_number: accountNumber,
      account_type,
      balance: 0,
      currency: currency || "USD",
      status: "active",
      created_by: createdBy(user),
    })
    .select()
    .single();

  if (error) {
    console.error("POST /api/accounts error:", JSON.stringify(error));
    return Response.json({ error: "Failed to create account", detail: error.message }, { status: 500 });
  }

  void logAudit({
    organizationId,
    userId: user.id,
    action: "account.created",
    entityType: "account",
    entityId: data.id,
    newValues: { account_id: accountId, account_number: accountNumber, account_type, customer_id },
  });

  return Response.json({ success: true, account: data }, { status: 201 });
}
