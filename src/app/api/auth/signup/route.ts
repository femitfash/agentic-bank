import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role, email, password } = body;

    if (!email || !password || !role) {
      return Response.json({ error: "email, password, and role are required" }, { status: 400 });
    }
    if (!["admin", "customer"].includes(role)) {
      return Response.json({ error: "role must be 'admin' or 'customer'" }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Create Supabase auth user
    const userMetadata =
      role === "admin"
        ? { full_name: body.full_name || "User", role: "admin" }
        : { first_name: body.first_name, last_name: body.last_name, role: "customer" };

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("exists")) {
        return Response.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      return Response.json({ error: authError.message }, { status: 400 });
    }

    const authUserId = authData.user.id;

    // 2. Resolve organization (find first existing or create)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingOrg } = await (admin as any)
      .from("organizations")
      .select("id")
      .limit(1)
      .single();

    let organizationId: string;

    if (existingOrg) {
      organizationId = existingOrg.id;
    } else if (role === "admin") {
      const slug = `org-${Date.now().toString(36)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newOrg, error: orgError } = await (admin as any)
        .from("organizations")
        .insert({ name: "My Bank", slug })
        .select("id")
        .single();
      if (orgError || !newOrg) {
        await admin.auth.admin.deleteUser(authUserId);
        return Response.json({ error: "Failed to create organization" }, { status: 500 });
      }
      organizationId = newOrg.id;
    } else {
      await admin.auth.admin.deleteUser(authUserId);
      return Response.json({ error: "No organization exists. An admin must sign up first." }, { status: 400 });
    }

    // 3. Create the corresponding DB row
    if (role === "admin") {
      const { full_name } = body;
      if (!full_name) {
        await admin.auth.admin.deleteUser(authUserId);
        return Response.json({ error: "full_name is required for admin signup" }, { status: 400 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: userError } = await (admin as any).from("users").insert({
        id: authUserId,
        organization_id: organizationId,
        email,
        full_name,
        role: "teller",
      });

      if (userError) {
        console.error("Failed to create users row:", userError);
        await admin.auth.admin.deleteUser(authUserId);
        return Response.json({ error: "Failed to create user profile" }, { status: 500 });
      }
    } else {
      const { first_name, last_name } = body;
      if (!first_name || !last_name) {
        await admin.auth.admin.deleteUser(authUserId);
        return Response.json({ error: "first_name and last_name are required for customer signup" }, { status: 400 });
      }

      const customerId = `CUST-${Date.now().toString(36).toUpperCase()}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: custError } = await (admin as any).from("customers").insert({
        organization_id: organizationId,
        customer_id: customerId,
        first_name,
        last_name,
        email,
        auth_user_id: authUserId,
        kyc_status: "pending",
      });

      if (custError) {
        console.error("Failed to create customers row:", custError);
        await admin.auth.admin.deleteUser(authUserId);
        return Response.json({ error: "Failed to create customer profile" }, { status: 500 });
      }
    }

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Signup API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
