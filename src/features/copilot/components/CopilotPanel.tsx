"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: CopilotAction[];
  isStreaming?: boolean;
}

interface CopilotAction {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "pending" | "executing" | "executed" | "rejected";
  result?: Record<string, unknown>;
}

interface CopilotPanelProps {
  onClose: () => void;
  context?: { page: string };
  customerId?: string;
  customerName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const ACTION_LABELS: Record<string, string> = {
  create_customer: "Register Customer",
  open_account: "Open Account",
  deposit: "Deposit Funds",
  withdraw: "Withdraw Funds",
  transfer: "Transfer Funds",
  seed_test_data: "Generate Test Data",
  update_account_status: "Update Account Status",
};

// ── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({
  action,
  onApprove,
  onReject,
}: {
  action: CopilotAction;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (action.status === "executing") {
    return (
      <div className="mt-2 ml-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Executing...</p>
        </div>
      </div>
    );
  }

  if (action.status !== "pending") {
    return (
      <div className="mt-2 ml-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {action.status === "executed" ? "Action completed" : "Action rejected"}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 ml-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
          {ACTION_LABELS[action.name] || action.name.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">Pending approval</span>
      </div>

      <div className="space-y-1.5 mb-3">
        {Object.entries(action.input).map(([key, value]) => {
          if (value === null || value === undefined) return null;
          const display = typeof value === "object" ? JSON.stringify(value) : String(value);
          return (
            <div key={key} className="flex text-sm">
              <span className="text-gray-400 dark:text-gray-500 w-32 shrink-0 capitalize">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{display}</span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors cursor-pointer"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          className="flex-1 px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ── Markdown Renderer ────────────────────────────────────────────────────────

function MarkdownText({
  text,
  isUser,
  isStreaming,
  onSuggestClick,
}: {
  text: string;
  isUser: boolean;
  isStreaming?: boolean;
  onSuggestClick?: (prompt: string) => void;
}) {
  if (!text && isStreaming) {
    return (
      <div className="flex gap-1 items-center py-1">
        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    );
  }

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      elements.push(<p key={i} className="font-semibold text-sm mt-1">{renderInline(line.slice(4), isUser)}</p>);
    } else if (line.startsWith("## ")) {
      elements.push(<p key={i} className="font-bold text-sm mt-1">{renderInline(line.slice(3), isUser)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm">
          <span className="opacity-60 mt-0.5">&bull;</span>
          <span>{renderInline(line.slice(2), isUser)}</span>
        </div>
      );
    } else if (/^\d+\. /.test(line)) {
      const match = line.match(/^(\d+)\. (.+)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 text-sm">
            <span className="opacity-60 font-medium min-w-[16px]">{match[1]}.</span>
            <span>{renderInline(match[2], isUser)}</span>
          </div>
        );
      }
    } else if (/^\[suggest:.*\].*\[\/suggest\]$/.test(line.trim())) {
      const suggestMatch = line.trim().match(/^\[suggest:(.*?)\](.*?)\[\/suggest\]$/);
      if (suggestMatch && onSuggestClick) {
        elements.push(
          <button
            key={i}
            onClick={() => onSuggestClick(suggestMatch[1])}
            className="flex items-center gap-2 w-full text-left px-3 py-2 mt-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
          >
            <span className="shrink-0">&#x2192;</span>
            <span>{suggestMatch[2]}</span>
          </button>
        );
      }
    } else if (line === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed">
          {renderInline(line, isUser)}
        </p>
      );
    }
  });

  return (
    <div className="space-y-0.5">
      {elements}
      {isStreaming && (
        <span className="inline-block w-0.5 h-3.5 bg-current opacity-70 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
}

function renderInline(text: string, isUser: boolean): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className={`px-1 py-0.5 rounded text-xs font-mono ${isUser ? "bg-white/20" : "bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600"}`}>
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      return <a key={i} href={linkMatch[2]} className="underline opacity-80 hover:opacity-100">{linkMatch[1]}</a>;
    }
    return part;
  });
}

// ── Main Component ───────────────────────────────────────────────────────────

export function CopilotPanel({ onClose, context, customerId, customerName }: CopilotPanelProps) {
  const isCustomer = Boolean(customerId);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: isCustomer
        ? `**Banking Assistant**\n\nHi${customerName ? ` ${customerName}` : ""}! I can help you check balances, view transactions, make deposits, withdrawals, and transfers.\n\nTry a suggestion below, or ask me anything:`
        : "**Banking Copilot**\n\nI can help you manage customers, accounts, and transactions. Just type what you need in plain English.\n\nTry clicking a suggestion below, or type your own request:",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send Message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      const assistantId = generateId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const history = messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history,
            context,
            ...(customerId ? { customer_id: customerId } : {}),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "text") {
                fullText += data.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullText } : m
                  )
                );
              } else if (data.type === "done") {
                const actions = (data.pendingActions || []).map(
                  (a: CopilotAction) => ({
                    ...a,
                    status: "pending" as const,
                  })
                );
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullText, isStreaming: false, actions }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "Sorry, something went wrong. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, context, customerId]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  // ── Execute / Reject Actions ─────────────────────────────────────────────

  const executeAction = useCallback(async (action: CopilotAction) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        actions: m.actions?.map((a) =>
          a.id === action.id ? { ...a, status: "executing" as const } : a
        ),
      }))
    );

    try {
      const res = await fetch("/api/copilot/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolCallId: action.id,
          name: action.name,
          input: action.input,
          ...(customerId ? { customer_id: customerId } : {}),
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        setMessages((prev) => [
          ...prev.map((m) => ({
            ...m,
            actions: m.actions?.map((a) =>
              a.id === action.id ? { ...a, status: "rejected" as const } : a
            ),
          })),
          {
            id: generateId(),
            role: "assistant" as const,
            content: "**Session expired** -- please sign in again.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (res.status === 402) {
        setMessages((prev) => [
          ...prev.map((m) => ({
            ...m,
            actions: m.actions?.map((a) =>
              a.id === action.id ? { ...a, status: "rejected" as const } : a
            ),
          })),
          {
            id: generateId(),
            role: "assistant" as const,
            content: "You've reached the free tier limit. Add your own API key in Settings to continue.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Execution failed");

      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.id === action.id
              ? { ...a, status: "executed" as const, result: data.result }
              : a
          ),
        }))
      );

      // Notify other components
      window.dispatchEvent(new CustomEvent("bank:data-changed"));

      const successMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: data.message || "Done! The action was executed successfully.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, successMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Action failed";
      setMessages((prev) => [
        ...prev.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.id === action.id ? { ...a, status: "rejected" as const } : a
          ),
        })),
        {
          id: generateId(),
          role: "assistant" as const,
          content: `**Action failed:** ${errorMsg}`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [customerId]);

  const rejectAction = useCallback((actionId: string) => {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        actions: m.actions?.map((a) =>
          a.id === actionId ? { ...a, status: "rejected" as const } : a
        ),
      }))
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-96 h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
            AI
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isCustomer ? "Banking Assistant" : "Banking Copilot"}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
        >
          &#x2715;
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            <div
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-2.5 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md"
                }`}
              >
                <MarkdownText
                  text={message.content}
                  isUser={message.role === "user"}
                  isStreaming={message.isStreaming}
                  onSuggestClick={(prompt) => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                />
              </div>
            </div>

            {/* Action cards */}
            {message.actions?.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onApprove={() => executeAction(action)}
                onReject={() => rejectAction(action.id)}
              />
            ))}
          </div>
        ))}

        {/* Starter chips on welcome */}
        {messages.length === 1 && messages[0].id === "welcome" && !isLoading && (
          <div className="flex flex-wrap gap-2 px-1">
            {(isCustomer
              ? [
                  { label: "Check balance", prompt: "What are my account balances?" },
                  { label: "Recent transactions", prompt: "Show my recent transactions" },
                  { label: "Make a deposit", prompt: "I want to make a deposit" },
                  { label: "Transfer funds", prompt: "Transfer money between my accounts" },
                ]
              : [
                  { label: "Register customer", prompt: "I need to register a new customer" },
                  { label: "Open account", prompt: "I want to open a new bank account" },
                  { label: "Make a deposit", prompt: "I need to deposit money" },
                  { label: "Dashboard stats", prompt: "Show me the dashboard overview" },
                  { label: "Populate test data", prompt: "Generate sample test data with 5 customers, accounts, and about 20 transactions" },
                ]
            ).map((chip) => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.prompt)}
                className="rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50 transition-colors hover:bg-blue-700 cursor-pointer"
          >
            &#x2191;
          </button>
        </form>
      </div>
    </div>
  );
}
