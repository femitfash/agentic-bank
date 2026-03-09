import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";

// VULN: Information Disclosure — reveals whether email exists,
// no rate limiting, no account lockout
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // VULNERABLE: Check if user exists first — reveals valid emails
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (admin as any)
    .from("users")
    .select("id, email")
    .eq("email", email);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customers } = await (admin as any)
    .from("customers")
    .select("id, email")
    .eq("email", email);

  const userExists = (users && users.length > 0) || (customers && customers.length > 0);

  if (!userExists) {
    // VULNERABLE: Different error message reveals email doesn't exist
    return Response.json({
      error: "User not found",
      message: `No account exists with email: ${email}`,
    }, { status: 404 });
  }

  // Attempt actual sign-in
  const { error: authError } = await admin.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    // VULNERABLE: Different error for wrong password vs non-existent user
    return Response.json({
      error: "Invalid password",
      message: "The password you entered is incorrect",
      // VULN: Leaking number of failed attempts would go here
      hint: "Try resetting your password",
    }, { status: 401 });
  }

  return Response.json({ success: true });
}
