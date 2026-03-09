import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transaction, error } = await (admin as any)
    .from("transactions")
    .select("*, accounts(account_number, account_type, customers(first_name, last_name))")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();

  if (error || !transaction) return Response.json({ error: "Transaction not found" }, { status: 404 });

  return Response.json({ transaction });
}
