import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { getBankContext } from "@/shared/lib/copilot/bank-context";
import { formatBankContextForPrompt } from "@/shared/lib/copilot/format-context";
import {
  SYSTEM_PROMPT,
  CUSTOMER_SYSTEM_PROMPT,
  READ_TOOLS,
  WRITE_TOOLS,
  WRITE_TOOL_LABELS,
  CUSTOMER_READ_TOOLS,
  CUSTOMER_WRITE_TOOLS,
  getToolsForScope,
  executeReadTool,
  executeCustomerReadTool,
} from "@/shared/lib/copilot/tools";

/**
 * POST /api/v1/chat
 *
 * External REST API for copilot interaction. Returns JSON (not SSE).
 * The client manages conversation history.
 *
 * Request:  { message: string, history?: [{role, content}], conversation_id?: string, customer_id?: string }
 * Response: { response: string, pending_actions: [...], conversation_id: string }
 *
 * When customer_id is provided, the copilot is scoped to that customer's accounts only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history, conversation_id, customer_id } = body;

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message is required (string)" }, { status: 400 });
    }

    // 1. Authenticate
    const user = await authenticateRequest();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const organizationId = await getOrganizationId(admin, user);

    // 2. Determine scope
    const isCustomerScope = Boolean(customer_id);
    if (isCustomerScope && organizationId) {
      const { data: customer } = await admin
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("organization_id", organizationId)
        .single();
      if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const activeTools = getToolsForScope(isCustomerScope ? "customer" : "admin");
    const readToolNames = isCustomerScope ? CUSTOMER_READ_TOOLS : READ_TOOLS;
    const writeToolNames = isCustomerScope ? CUSTOMER_WRITE_TOOLS : WRITE_TOOLS;
    const basePrompt = isCustomerScope ? CUSTOMER_SYSTEM_PROMPT : SYSTEM_PROMPT;

    // 3. Resolve Anthropic API key
    let anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (organizationId) {
      try {
        const { data: orgData } = await admin
          .from("organizations")
          .select("settings")
          .eq("id", organizationId)
          .single();
        if (orgData?.settings?.anthropic_api_key) {
          anthropicApiKey = orgData.settings.anthropic_api_key;
        }
      } catch {
        // Fall back to platform key
      }
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // 4. Build system prompt with context
    let contextBlock = "";
    if (organizationId) {
      try {
        const snapshot = await getBankContext(organizationId);
        contextBlock = formatBankContextForPrompt(snapshot);
      } catch {
        // Fail open
      }
    }
    let contextualPrompt = contextBlock
      ? `${basePrompt}\n\n${contextBlock}`
      : basePrompt;

    if (isCustomerScope) {
      contextualPrompt += `\n\n## Customer Context\n- **Customer ID**: ${customer_id}\n- You are assisting this specific customer. All operations are scoped to their accounts only.`;
    }

    // 5. Build message history
    const messages: Anthropic.MessageParam[] = [
      ...((history || []) as Array<{ role: "user" | "assistant"; content: string }>),
      { role: "user", content: message },
    ];

    // 6. Agentic loop (same as /api/copilot but returns JSON)
    let loopMessages = [...messages];
    const pendingActions: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let maxIterations = 4;
    let finalText = "";

    while (maxIterations-- > 0) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: contextualPrompt,
        tools: activeTools,
        messages: loopMessages,
      });

      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      finalText = textBlocks.map((b) => b.text).join("");

      if (response.stop_reason !== "tool_use") break;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (writeToolNames.includes(toolUse.name)) {
          pendingActions.push({
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input as Record<string, unknown>,
          });
          const entityLabel = WRITE_TOOL_LABELS[toolUse.name] || "action";
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `The ${entityLabel} has been queued for approval. Describe what you are about to do and ask the user to approve it.`,
          });
        } else if (readToolNames.includes(toolUse.name)) {
          const result = isCustomerScope
            ? await executeCustomerReadTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                admin,
                organizationId,
                customer_id
              )
            : await executeReadTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                admin,
                organizationId
              );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
          });
        }
      }

      loopMessages = [
        ...loopMessages,
        { role: "assistant" as const, content: response.content },
        { role: "user" as const, content: toolResults },
      ];
    }

    // 7. Return JSON response
    const convId = conversation_id || `conv-${Date.now().toString(36)}`;

    return Response.json({
      response: finalText,
      pending_actions: pendingActions,
      conversation_id: convId,
    });
  } catch (error) {
    console.error("v1/chat API error:", error);
    return Response.json({ error: "Failed to process request" }, { status: 500 });
  }
}
