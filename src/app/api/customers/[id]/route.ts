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

  // Fetch customer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer, error } = await (admin as any)
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();

  if (error || !customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  // Fetch their accounts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (admin as any)
    .from("accounts")
    .select("id, account_id, account_number, account_type, balance, currency, status, created_at")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  return Response.json({ customer, accounts: accounts || [] });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 400 });

  // Fetch existing customer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();

  if (!existing) return Response.json({ error: "Customer not found" }, { status: 404 });

  const body = await request.json();
  const allowedFields = ["first_name", "last_name", "email", "phone", "address", "kyc_status"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("customers")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to update customer", detail: error.message }, { status: 500 });

  void logAudit({
    organizationId,
    userId: user.id,
    action: "customer.updated",
    entityType: "customer",
    entityId: id,
    oldValues: existing,
    newValues: updates,
  });

  return Response.json({ success: true, customer: data });
}
