import { createClient } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Check users table first (admin/teller/owner)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: adminUser } = await (admin as any)
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (adminUser) {
      return Response.json({ role: "admin", userRole: adminUser.role });
    }

    // Check customers table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: customer } = await (admin as any)
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (customer) {
      return Response.json({ role: "customer", customerId: customer.id });
    }

    return Response.json({ role: "unknown" });
  } catch {
    return Response.json({ error: "Failed to resolve role" }, { status: 500 });
  }
}
