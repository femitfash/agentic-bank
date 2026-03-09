import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Admin Supabase client using the service role key.
 * Bypasses Row Level Security — ONLY use in server-side API routes
 * after explicitly authenticating the user.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
