import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { executeWriteTool, executeCustomerWriteTool } from "@/shared/lib/copilot/execute-write-tool";
import { CUSTOMER_WRITE_TOOLS } from "@/shared/lib/copilot/tools";

const FREE_LIMIT = 10;

/**
 * POST /api/v1/chat/execute
 *
 * Execute an approved action from a v1/chat response.
 *
 * Request:  { action_id?: string, name: string, input: {...}, customer_id?: string }
 * Response: { success: true, result: {...}, message: string }
 *
 * When customer_id is provided, only customer-allowed tools are permitted
 * and account ownership is validated.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action_id, name, input, customer_id } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required (string)" }, { status: 400 });
    }
    if (!input || typeof input !== "object") {
      return Response.json({ error: "input is required (object)" }, { status: 400 });
    }

    // 1. Authenticate
    const user = await authenticateRequest();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const organizationId = await getOrganizationId(admin, user);
    if (!organizationId) {
      return Response.json({ error: "No organization found" }, { status: 400 });
    }

    // 2. Validate customer scope if provided
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

    // 3. Check usage limits
    const { data: orgData } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgSettings: Record<string, any> = orgData?.settings || {};
    const writeCount: number = orgSettings.copilot_write_count || 0;
    const hasCustomKey = Boolean(orgSettings.anthropic_api_key);

    // Free tier limit removed for development

    // 4. Execute (scoped appropriately)
    const result = isCustomerScope
      ? await executeCustomerWriteTool(name, input, admin, organizationId, user, customer_id, action_id)
      : await executeWriteTool(name, input, admin, organizationId, user, action_id);

    if (!result.success) {
      return Response.json(
        { error: result.error || result.message, detail: result.error },
        { status: result.status || 500 }
      );
    }

    return Response.json({
      success: true,
      result: result.result,
      action_id,
      message: result.message,
    });
  } catch (error) {
    console.error("v1/chat/execute API error:", error);
    return Response.json({ error: "Failed to execute action" }, { status: 500 });
  }
}
