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
  attachedFile?: string;
  reliability?: { score: number; reliable: boolean; checking?: boolean };
  validation?: { status: "scanning" | "passed" | "failed" | "skipped"; details?: string };
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
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null);

  // Safety settings
  type SafetyMode = "block" | "warn" | "allow";
  type HallucinationMode = SafetyMode | "manual";
  interface SafetySettings { pii_detection: SafetyMode; hallucination_check: HallucinationMode }
  const [safetySettings, setSafetySettings] = useState<SafetySettings>({ pii_detection: "warn", hallucination_check: "manual" });
  const [piiWarning, setPiiWarning] = useState<{ detections: { entity_type: string; text: string }[]; pendingText: string; pendingFile: { name: string; content: string } | null } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("safety_settings");
      if (raw) setSafetySettings(JSON.parse(raw));
    } catch { /* use defaults */ }
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "json") {
      alert("Only .csv and .json files are supported");
      return;
    }
    if (file.size > 100 * 1024) {
      alert("File too large. Maximum 100KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFile({ name: file.name, content: reader.result as string });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send Message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, bypassPii = false) => {
      if ((!text.trim() && !uploadedFile) || isLoading) return;

      // Build message with file content if attached
      const currentFile = uploadedFile;
      const displayText = text.trim() || (currentFile ? "Process this file" : "");
      let messageToSend = displayText;
      if (currentFile) {
        messageToSend = `[Attached file: ${currentFile.name}]\n${currentFile.content}\n\n${displayText}`;
      }

      // Always show user message with file indicator immediately
      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: displayText,
        timestamp: new Date(),
        attachedFile: currentFile?.name,
      };
      const assistantId = generateId();
      let validationResult: Message["validation"] = undefined;

      setInput("");
      setUploadedFile(null);

      // ── PII Pre-Check (BEFORE any data reaches the LLM) ──────────────
      if (!bypassPii && safetySettings.pii_detection !== "allow") {
        // Show scanning indicator
        setMessages((prev) => [...prev, userMsg, {
          id: assistantId, role: "assistant", content: "", timestamp: new Date(),
          validation: { status: "scanning" },
        }]);

        try {
          const piiRes = await fetch("/api/copilot/pii-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: messageToSend }),
          });
          const piiData = piiRes.ok ? await piiRes.json() : { has_pii: false, detections: [], error: true };
          console.log("[PII Check] Response:", piiRes.status, piiData);

          if (piiData.has_pii && piiData.detections?.length > 0) {
            const detectedTypes = piiData.detections.map((d: { entity_type: string }) => d.entity_type).join(", ");
            if (safetySettings.pii_detection === "block") {
              // Block: show validation failed in the response, don't send to LLM
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? {
                  ...m,
                  content: "Sensitive personal information was detected. For security, this has not been sent to the AI.\n\nDetected: " + detectedTypes +
                    "\n\n[Sanitize your file here](https://dev.zerotrusted.ai/file-sanitization) before uploading.",
                  validation: { status: "failed", details: detectedTypes },
                } : m
              ));
              return;
            } else {
              // Warn: remove scanning message, show modal
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
              setPiiWarning({ detections: piiData.detections, pendingText: text, pendingFile: currentFile });
              return;
            }
          } else {
            validationResult = { status: piiData.error ? "skipped" : "passed" };
          }
        } catch {
          validationResult = { status: "skipped" };
        }

        // Update to show passed/skipped, then continue to streaming
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: "", isStreaming: true, validation: validationResult } : m
        ));
      } else {
        // No PII check — add user + assistant messages directly
        setMessages((prev) => [...prev, userMsg, {
          id: assistantId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true,
        }]);
      }

      setIsLoading(true);

      try {
        const history = messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: messageToSend,
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

        // ── Hallucination Post-Check (async, after streaming) ──────────
        if (safetySettings.hallucination_check !== "allow" && safetySettings.hallucination_check !== "manual" && fullText) {
          // Show "checking" indicator
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, reliability: { score: 0, reliable: true, checking: true } } : m
            )
          );

          try {
            const hRes = await fetch("/api/copilot/hallucination-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_prompt: displayText, ai_response: fullText }),
            });
            const hData = await hRes.json();

            if (hRes.ok) {
              const reliable = hData.reliable !== false;
              const score = hData.score ?? 50;

              if (!reliable && safetySettings.hallucination_check === "block") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: "**Response Hidden** — This response was flagged as potentially unreliable (score: " + score + "%). For safety, it has been withheld.", reliability: { score, reliable: false } }
                      : m
                  )
                );
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, reliability: { score, reliable } } : m
                  )
                );
              }
            } else {
              // Check failed — remove checking indicator
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, reliability: undefined } : m
                )
              );
            }
          } catch {
            // Hallucination check failed — silently remove indicator
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, reliability: undefined } : m
              )
            );
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
    [isLoading, messages, context, customerId, uploadedFile, safetySettings]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  // On-demand reliability check for a specific assistant message
  const runReliabilityCheck = useCallback(async (messageId: string) => {
    // Find the assistant message and the preceding user message
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;
    const assistantMsg = messages[msgIndex];
    if (!assistantMsg.content || assistantMsg.role !== "assistant") return;

    // Find the last user message before this assistant message
    let userPrompt = "";
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userPrompt = messages[i].content;
        break;
      }
    }

    // Show checking indicator
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, reliability: { score: 0, reliable: true, checking: true } } : m
      )
    );

    try {
      const res = await fetch("/api/copilot/hallucination-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_prompt: userPrompt, ai_response: assistantMsg.content }),
      });
      const data = await res.json();

      if (res.ok) {
        const reliable = data.reliable !== false;
        const score = data.score ?? 50;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, reliability: { score, reliable } } : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, reliability: undefined } : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reliability: undefined } : m
        )
      );
    }
  }, [messages]);

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
                {message.attachedFile && (
                  <div className="text-xs opacity-80 mb-1 flex items-center gap-1">
                    <span>&#128206;</span> {message.attachedFile}
                  </div>
                )}
                {message.validation && (
                  <div className={`text-xs px-2.5 py-1.5 rounded-lg mb-2 font-medium ${
                    message.validation.status === "scanning"
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : message.validation.status === "passed"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : message.validation.status === "failed"
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                  }`}>
                    {message.validation.status === "scanning" && (<span className="inline-flex items-center gap-1.5">Scanning for sensitive data<span className="inline-flex gap-0.5 ml-0.5"><span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} /><span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} /></span></span>)}
                    {message.validation.status === "passed" && "Sensitive Data Validation: Passed"}
                    {message.validation.status === "failed" && "Sensitive Data Validation: Failed"}
                    {message.validation.status === "skipped" && "Sensitive Data Validation: Skipped"}
                  </div>
                )}
                <MarkdownText
                  text={message.content}
                  isUser={message.role === "user"}
                  isStreaming={message.isStreaming}
                  onSuggestClick={(prompt) => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                />
                {message.reliability ? (
                  <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg font-medium ${
                    message.reliability.checking
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : message.reliability.reliable
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  }`}>
                    {message.reliability.checking
                      ? (<span className="inline-flex items-center gap-1.5">Checking reliability<span className="inline-flex gap-0.5 ml-0.5"><span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} /><span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} /><span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} /></span></span>)
                      : message.reliability.reliable
                        ? `Reliability: High (${message.reliability.score}%)`
                        : `Reliability: Low (${message.reliability.score}%) — treat this response with caution`}
                  </div>
                ) : (
                  message.role === "assistant" && !message.isStreaming && message.content && safetySettings.hallucination_check !== "allow" && message.id !== "welcome" && (
                    <button
                      onClick={() => runReliabilityCheck(message.id)}
                      className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                    >
                      Check Reliability
                    </button>
                  )
                )}
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
        {uploadedFile && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400">
              <span>&#128206;</span>
              {uploadedFile.name}
              <button
                onClick={() => setUploadedFile(null)}
                className="ml-1 text-blue-400 hover:text-blue-600 cursor-pointer"
              >
                &#x2715;
              </button>
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer disabled:opacity-50"
            title="Upload CSV or JSON file"
          >
            <span className="text-sm">&#128206;</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={uploadedFile ? `Ask about ${uploadedFile.name}...` : "Ask anything..."}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && !uploadedFile)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50 transition-colors hover:bg-blue-700 cursor-pointer"
          >
            &#x2191;
          </button>
        </form>
      </div>

      {/* PII Warning Modal */}
      {piiWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 rounded-2xl">
          <div className="w-[90%] max-w-md bg-white dark:bg-gray-900 rounded-xl border border-red-300 dark:border-red-700 shadow-xl max-h-[80%] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-t-xl">
              <span className="text-red-600 dark:text-red-400">&#9888;</span>
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">PII Detected in Content</span>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Sensitive personal information was found. This data has <strong>not</strong> been sent to the AI.
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {piiWarning.detections.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold uppercase tracking-wider text-[10px]">
                      {d.entity_type}
                    </span>
                    <span className="text-gray-500 font-mono truncate">
                      {d.text.length > 4 ? d.text.slice(0, 2) + "****" + d.text.slice(-2) : "****"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setPiiWarning(null)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const pending = piiWarning;
                  setPiiWarning(null);
                  if (pending.pendingFile) setUploadedFile(pending.pendingFile);
                  sendMessage(pending.pendingText, true);
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 cursor-pointer transition-colors"
              >
                Send Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
