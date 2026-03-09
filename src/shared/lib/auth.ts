import { createClient } from "@/shared/lib/supabase/server";

const DEV_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "dev@agentic.bank",
  user_metadata: { full_name: "Dev Teller" },
  is_dev: true,
};

const DEV_ORG_SLUG = "org-00000000";

/** Returns user.id for real users, null for dev user (avoids FK violations on auth.users) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createdBy(user: any): string | null {
  return user?.is_dev ? null : user?.id ?? null;
}

/**
 * Authenticate the current request. Returns a user object or null.
 * In development mode, returns a dev user when Supabase auth is unavailable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function authenticateRequest(): Promise<any | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user;
  } catch {
    // Supabase unavailable
  }

  if (process.env.NODE_ENV === "development") return DEV_USER;
  return null;
}

/**
 * Resolve the organization ID for a user.
 * - Real users: looked up via the `users` table.
 * - Dev user: looked up (or auto-provisioned) via a well-known org slug.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrganizationId(admin: any, user: any): Promise<string | null> {
  if (!user) return null;

  // For real users, look up via users table (admins) then customers table
  if (!user.is_dev) {
    const { data } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (data?.organization_id) return data.organization_id;

    // Fallback: check customers table (customer auth users)
    const { data: custData } = await admin
      .from("customers")
      .select("organization_id")
      .eq("auth_user_id", user.id)
      .single();
    return custData?.organization_id ?? null;
  }

  // Dev user: find or create org by slug
  const { data: existingOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", DEV_ORG_SLUG)
    .single();

  if (existingOrg?.id) return existingOrg.id;

  // Create the dev org
  const { data: newOrg } = await admin
    .from("organizations")
    .insert({ name: "Dev Bank", slug: DEV_ORG_SLUG })
    .select("id")
    .single();

  return newOrg?.id ?? null;
}
