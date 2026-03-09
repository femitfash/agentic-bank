import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { executeWriteTool, executeCustomerWriteTool } from "@/shared/lib/copilot/execute-write-tool";
import { CUSTOMER_WRITE_TOOLS } from "@/shared/lib/copilot/tools";

const FREE_LIMIT = 10;

export async function POST(request: NextRequest) {
  try {
    const { toolCallId, name, input, customer_id } = await request.json();

    // 1. Authenticate
    const user = await authenticateRequest();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // 2. Get organization ID
    const organizationId = await getOrganizationId(admin, user);
    if (!organizationId) {
      return Response.json({ error: "No organization found" }, { status: 400 });
    }

    // 3. Validate customer scope if provided
    const isCustomerScope = Boolean(customer_id);
    if (isCustomerScope) {
      const { data: customer } = await admin
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("organization_id", organizationId)
        .single();
      if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

      if (!CUSTOMER_WRITE_TOOLS.includes(name)) {
        return Response.json({ error: `Action "${name}" is not available in the customer portal` }, { status: 403 });
      }
    }

    // 4. Check usage limits
    const { data: orgData } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgSettings: Record<string, any> = orgData?.settings || {};
    const writeCount: number = orgSettings.copilot_write_count || 0;
    const hasCustomKey = Boolean(orgSettings.anthropic_api_key);

    if (writeCount >= FREE_LIMIT && !hasCustomKey) {
      return Response.json({
        error: "free_limit_reached",
        upgrade_prompt: true,
        message: `You've used all ${FREE_LIMIT} free AI actions. Add your own API key in Settings to continue.`,
        write_count: writeCount,
        limit: FREE_LIMIT,
      }, { status: 402 });
    }

    // 5. Execute the approved action (scoped appropriately)
    const result = isCustomerScope
      ? await executeCustomerWriteTool(name, input, admin, organizationId, user, customer_id, toolCallId)
      : await executeWriteTool(name, input, admin, organizationId, user, toolCallId);

    if (!result.success) {
      return Response.json(
        { error: result.error || result.message, detail: result.error },
        { status: result.status || 500 }
      );
    }

    return Response.json({
      success: true,
      result: result.result,
      toolCallId,
      message: result.message,
    });
  } catch (error) {
    console.error("Copilot execute error:", error);
    return Response.json({ error: "Failed to execute action" }, { status: 500 });
  }
}
