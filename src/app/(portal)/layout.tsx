import { createClient } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import PortalLayoutClient from "./portal-layout-client";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let authCustomerId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: customer } = await (admin as any)
        .from("customers")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (customer) {
        authCustomerId = customer.id;
      }
    }
  } catch {
    // Dev mode or no auth — authCustomerId stays null, dropdown mode
  }

  return <PortalLayoutClient authCustomerId={authCustomerId}>{children}</PortalLayoutClient>;
}
