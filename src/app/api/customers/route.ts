import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, createdBy, getOrganizationId } from "@/shared/lib/auth";
import { logAudit } from "@/shared/lib/audit";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ customers: [] });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const kyc_status = searchParams.get("kyc_status");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query) {
    q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`);
  }
  if (kyc_status) {
    q = q.eq("kyc_status", kyc_status);
  }

  const { data, error } = await q;
  if (error) return Response.json({ customers: [], error: error.message });

  return Response.json({ customers: data || [] });
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 400 });

  const body = await request.json();
  const { first_name, last_name, email, phone, address, kyc_status } = body;

  if (!first_name || !last_name) {
    return Response.json({ error: "first_name and last_name are required" }, { status: 400 });
  }

  const customerId = `CUST-${Date.now().toString(36).toUpperCase()}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("customers")
    .insert({
      organization_id: organizationId,
      customer_id: customerId,
      first_name,
      last_name,
      email: email || null,
      phone: phone || null,
      address: address || {},
      kyc_status: kyc_status || "pending",
      created_by: createdBy(user),
    })
    .select()
    .single();

  if (error) {
    console.error("POST /api/customers error:", JSON.stringify(error));
    return Response.json({ error: "Failed to create customer", detail: error.message }, { status: 500 });
  }

  void logAudit({
    organizationId,
    userId: user.id,
    action: "customer.created",
    entityType: "customer",
    entityId: data.id,
    newValues: { customer_id: customerId, first_name, last_name, email },
  });

  return Response.json({ success: true, customer: data }, { status: 201 });
}
