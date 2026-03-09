import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

// VULN: Authentication Bypass — debug header skips auth entirely
export async function GET(request: NextRequest) {
  const debugHeader = request.headers.get("x-debug");

  // VULNERABLE: Debug backdoor bypasses authentication
  if (debugHeader !== "true") {
    // In "production" this would check auth, but the bypass exists
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  // VULN: Exposing all users including sensitive fields
  const { data, error } = await admin
    .from("users")
    .select("id, email, full_name, role, organization_id, created_at");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // VULN: Also listing auth users with metadata
  const { data: authUsers } = await admin.auth.admin.listUsers();

  return Response.json({
    users: data,
    auth_users: authUsers?.users?.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
      metadata: u.user_metadata,
    })),
  });
}
