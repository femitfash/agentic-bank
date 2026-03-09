import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { getBankContext } from "@/shared/lib/copilot/bank-context";
import { formatBankContextForPrompt } from "@/shared/lib/copilot/format-context";
import {
  SYSTEM_PROMPT,
  CUSTOMER_SYSTEM_PROMPT,
  tools,
  READ_TOOLS,
  WRITE_TOOLS,
  WRITE_TOOL_LABELS,
  CUSTOMER_READ_TOOLS,
  CUSTOMER_WRITE_TOOLS,
  getToolsForScope,
  executeReadTool,
  executeCustomerReadTool,
} from "@/shared/lib/copilot/tools";

export async function POST(request: NextRequest) {
  try {
    const { message, history, context, customer_id } = await request.json();

    // 1. Authenticate
    const user = await authenticateRequest();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // 2. Get organization ID (single admin client for the whole request)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const organizationId = await getOrganizationId(admin, user);

    // 3. Determine scope (admin vs customer)
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

    // 4. Initialize Anthropic client (support org's custom API key)
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

    // 5. Build context-aware system prompt
    let contextBlock = "";
    if (organizationId) {
      try {
        const snapshot = await getBankContext(organizationId);
        contextBlock = formatBankContextForPrompt(snapshot);
      } catch {
        // Fail open — copilot works without context
      }
    }
    const pageContext = context?.page ? `\n- **Current Page**: ${context.page}` : "";
    let contextualPrompt = contextBlock
      ? `${basePrompt}\n\n${contextBlock}${pageContext}`
      : `${basePrompt}${pageContext ? `\n\n## Current Context${pageContext}` : ""}`;

    if (isCustomerScope) {
      contextualPrompt += `\n\n## Customer Context\n- **Customer ID**: ${customer_id}\n- You are assisting this specific customer. All operations are scoped to their accounts only.`;
    }

    // 6. Build message history
    const messages: Anthropic.MessageParam[] = [
      ...((history || []) as Array<{ role: "user" | "assistant"; content: string }>),
      { role: "user", content: message },
    ];

    // 7. Agentic loop
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

      // Collect text from this pass
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      finalText = textBlocks.map((b) => b.text).join("");

      // If no tool use, we're done
      if (response.stop_reason !== "tool_use") break;

      // Process tool calls
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (writeToolNames.includes(toolUse.name)) {
          // Write tool — queue for user approval
          pendingActions.push({
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input as Record<string, unknown>,
          });
          const entityLabel = WRITE_TOOL_LABELS[toolUse.name] || "action";
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `The ${entityLabel} has been presented to the user for approval. Please describe what you are about to do and ask them to approve it using the action card below.`,
          });
        } else if (readToolNames.includes(toolUse.name)) {
          // Read tool — execute immediately (scoped appropriately)
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

      // Feed results back for next iteration
      loopMessages = [
        ...loopMessages,
        { role: "assistant" as const, content: response.content },
        { role: "user" as const, content: toolResults },
      ];
    }

    // 8. Stream the response word by word via SSE
    const encoder = new TextEncoder();
    const words = finalText.split(/(\s+)/);

    const readableStream = new ReadableStream({
      start(controller) {
        let i = 0;

        function sendNext() {
          if (i < words.length) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", text: words[i] })}\n\n`
              )
            );
            i++;
            setTimeout(sendNext, 25);
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done", pendingActions })}\n\n`
              )
            );
            controller.close();
          }
        }

        sendNext();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Copilot API error:", error);
    return Response.json({ error: "Failed to process request" }, { status: 500 });
  }
}
