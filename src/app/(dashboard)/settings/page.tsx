"use client";

import { useState, useEffect } from "react";
import { useTheme, type Theme } from "@/shared/hooks/useTheme";

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
  { value: "system", label: "System", description: "Follow your OS preference" },
];

const LS_KEY = "fraud_sim_data";

interface FraudSimData {
  anon_user_id: string;
  checking_account_id: string;
  savings_account_id: string | null;
  total_transactions: number;
  fraud_transaction_ids: string[];
  fraud_transaction_notes: Record<string, string>;
  fraud_count: number;
  seeded_at: string;
  customer_id?: string;
  customer_uuid?: string;
}

interface CustomerOption { id: string; customer_id: string; first_name: string; last_name: string }
interface AccountOption { id: string; account_number: string; account_type: string; customer_id: string }

type SafetyMode = "block" | "warn" | "allow";
type HallucinationMode = SafetyMode | "manual";
interface SafetySettings {
  pii_detection: SafetyMode;
  hallucination_check: HallucinationMode;
}
const DEFAULT_SAFETY: SafetySettings = { pii_detection: "warn", hallucination_check: "manual" };
const SAFETY_LS_KEY = "safety_settings";

function loadSafetySettings(): SafetySettings {
  try {
    const raw = localStorage.getItem(SAFETY_LS_KEY);
    return raw ? { ...DEFAULT_SAFETY, ...JSON.parse(raw) } : DEFAULT_SAFETY;
  } catch { return DEFAULT_SAFETY; }
}

function loadFraudData(): FraudSimData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveFraudData(data: FraudSimData): void {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export default function SettingsPage() {
  const { theme, setTheme, mounted } = useTheme();
  const [seedStatus, setSeedStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [seedMessage, setSeedMessage] = useState("");
  const [fraudData, setFraudData] = useState<FraudSimData | null>(null);

  // Target selection
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");

  // Safety settings
  const [safetySettings, setSafetySettings] = useState<SafetySettings>(DEFAULT_SAFETY);

  function updateSafety(key: keyof SafetySettings, value: SafetyMode | HallucinationMode) {
    setSafetySettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(SAFETY_LS_KEY, JSON.stringify(next));
      return next;
    });
  }

  // Load persisted data + customer/account lists on mount
  useEffect(() => {
    setFraudData(loadFraudData());
    setSafetySettings(loadSafetySettings());
    fetch("/api/customers?limit=100").then(r => r.json()).then(d => setCustomers(d.customers || [])).catch(() => {});
    fetch("/api/accounts?limit=100").then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {});
  }, []);

  // Filter accounts when customer changes
  const filteredAccounts = selectedCustomer
    ? accounts.filter(a => a.customer_id === selectedCustomer)
    : accounts;

  // Reset account when customer changes
  useEffect(() => {
    setSelectedAccount("");
  }, [selectedCustomer]);

  // mode: "mixed" (default first seed), "append" (add more), "clean_only" (no fraud)
  // force: only used with "mixed" to wipe and regenerate
  async function handleSeed(mode: "mixed" | "append" | "clean_only", force = false) {
    const confirmMessages: Record<string, string> = {
      mixed: "Generate seed data with normal + fraudulent transactions?",
      append: "Append additional normal + fraudulent transactions to existing data?",
      clean_only: "Append clean transactions only (no fraud)? This tests for false positives.",
    };
    const forceMsg = "This will DELETE all existing transactions, scan results, and regenerate from scratch. Continue?";
    if (!confirm(force ? forceMsg : confirmMessages[mode])) return;

    setSeedStatus("loading");
    setSeedMessage("");
    try {
      const params = new URLSearchParams();
      params.set("mode", mode);
      if (force) params.set("force", "true");
      if (selectedCustomer) params.set("customer_id", selectedCustomer);
      if (selectedAccount) params.set("account_id", selectedAccount);

      const res = await fetch(`/api/admin/seed-fraud?${params}`, { method: "POST" });
      const data = await res.json();
      setSeedMessage(data.message || "");
      if (data.success) {
        setSeedStatus("success");

        const isAppend = mode === "append" || mode === "clean_only";
        const existing = isAppend ? loadFraudData() : null;

        // Merge fraud IDs on append, replace on fresh seed
        const mergedIds = isAppend && existing
          ? [...new Set([...existing.fraud_transaction_ids, ...(data.fraud_transaction_ids || [])])]
          : (data.fraud_transaction_ids || []);
        const mergedNotes = isAppend && existing
          ? { ...existing.fraud_transaction_notes, ...(data.fraud_transaction_notes || {}) }
          : (data.fraud_transaction_notes || {});

        const persistable: FraudSimData = {
          anon_user_id: data.anon_user_id,
          checking_account_id: data.checking_account_id,
          savings_account_id: data.savings_account_id,
          total_transactions: (isAppend && existing ? existing.total_transactions : 0) + (data.total_transactions || 0),
          fraud_transaction_ids: mergedIds,
          fraud_transaction_notes: mergedNotes,
          fraud_count: mergedIds.length,
          seeded_at: new Date().toISOString(),
          customer_id: data.customer_id,
          customer_uuid: data.customer_uuid,
        };
        saveFraudData(persistable);
        setFraudData(persistable);
        fetch("/api/accounts?limit=100").then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {});
        fetch("/api/customers?limit=100").then(r => r.json()).then(d => setCustomers(d.customers || [])).catch(() => {});
      } else {
        setSeedStatus("error");
      }
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : "Request failed");
      setSeedStatus("error");
    }
  }

  async function handleClearAll(keepCustomer: boolean) {
    if (!confirm(keepCustomer
      ? "Delete all transactions and scan data? Customers and accounts will be kept."
      : "WARNING: This will permanently delete ALL data — transactions, scan results, accounts, and customers. This cannot be undone."
    )) return;

    // Double confirm for full delete
    if (!keepCustomer && !confirm("Are you sure? Type OK to confirm you want to delete everything.")) return;

    setSeedStatus("loading");
    setSeedMessage("");
    try {
      const params = keepCustomer ? "?keep_customer=true" : "";
      const res = await fetch(`/api/admin/seed-fraud/clear${params}`, { method: "DELETE" });
      const data = await res.json();
      setSeedMessage(data.message || "Cleared");
      setSeedStatus(data.success ? "success" : "error");
      if (data.success) {
        localStorage.removeItem(LS_KEY);
        setFraudData(null);
        fetch("/api/accounts?limit=100").then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {});
        fetch("/api/customers?limit=100").then(r => r.json()).then(d => setCustomers(d.customers || [])).catch(() => {});
      }
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : "Request failed");
      setSeedStatus("error");
    }
  }

  const hasData = fraudData && fraudData.fraud_transaction_ids.length > 0;

  const [activeTab, setActiveTab] = useState<"fraud" | "appearance" | "safety">("fraud");

  const tabs = [
    { id: "fraud" as const, label: "Fraud Simulation" },
    { id: "safety" as const, label: "Safety & Guardrails" },
    { id: "appearance" as const, label: "Appearance" },
  ];

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Settings</h2>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer -mb-px ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Appearance Tab */}
      {activeTab === "appearance" && (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Appearance</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose your preferred color theme.</p>

        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((option) => {
            const isSelected = mounted && theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className={`w-full h-16 rounded-lg border overflow-hidden ${
                  option.value === "dark"
                    ? "bg-gray-900 border-gray-700"
                    : option.value === "light"
                    ? "bg-white border-gray-200"
                    : "bg-gradient-to-r from-white to-gray-900 border-gray-300"
                }`}>
                  <div className="flex h-full">
                    <div className={`w-1/4 h-full ${
                      option.value === "dark" ? "bg-gray-800" : option.value === "light" ? "bg-gray-50" : "bg-gradient-to-r from-gray-50 to-gray-800"
                    }`} />
                    <div className="flex-1 p-1.5 flex flex-col gap-1">
                      <div className={`h-1.5 w-3/4 rounded-full ${
                        option.value === "dark" ? "bg-gray-700" : option.value === "light" ? "bg-gray-200" : "bg-gray-400"
                      }`} />
                      <div className={`h-1.5 w-1/2 rounded-full ${
                        option.value === "dark" ? "bg-gray-700" : option.value === "light" ? "bg-gray-200" : "bg-gray-400"
                      }`} />
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium ${
                    isSelected ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                  }`}>{option.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Safety & Guardrails Tab */}
      {activeTab === "safety" && (
        <div className="space-y-6">
          {/* PII Detection */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">PII Detection</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Scan content for personally identifiable information (emails, names, phone numbers, addresses, SSN, credit cards). This check runs <strong>before</strong> any data is sent to the AI model — your content never reaches the LLM until it passes validation.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "block" as SafetyMode, label: "Block", desc: "Prevent sending content with PII", color: "red" },
                { value: "warn" as SafetyMode, label: "Warn & Continue", desc: "Show warning, user can proceed", color: "amber" },
                { value: "allow" as SafetyMode, label: "Allow All", desc: "No PII checking", color: "green" },
              ]).map((opt) => {
                const selected = safetySettings.pii_detection === opt.value;
                const borderColor = selected
                  ? opt.color === "red" ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : opt.color === "amber" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                  : "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600";
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateSafety("pii_detection", opt.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors cursor-pointer ${borderColor}`}
                  >
                    <p className={`text-sm font-medium ${selected
                      ? opt.color === "red" ? "text-red-700 dark:text-red-400"
                      : opt.color === "amber" ? "text-amber-700 dark:text-amber-400"
                      : "text-green-700 dark:text-green-400"
                      : "text-gray-700 dark:text-gray-300"
                    }`}>{opt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
            {safetySettings.pii_detection === "block" && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                When PII is detected, users will be blocked and directed to sanitize their file at{" "}
                <a href="https://dev.zerotrusted.ai/file-sanitization" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  dev.zerotrusted.ai/file-sanitization
                </a>
              </div>
            )}
          </div>

          {/* Hallucination / Reliability Check */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Hallucination &amp; Reliability Check</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Evaluate AI responses for factual reliability and hallucination after the copilot responds. Uses multiple LLM evaluations for accuracy.
            </p>
            <div className="grid grid-cols-4 gap-3">
              {([
                { value: "manual" as HallucinationMode, label: "On-Demand", desc: "Run manually per response (default)", color: "blue" },
                { value: "block" as HallucinationMode, label: "Block", desc: "Auto-hide unreliable responses", color: "red" },
                { value: "warn" as HallucinationMode, label: "Warn & Continue", desc: "Auto-show reliability warning", color: "amber" },
                { value: "allow" as HallucinationMode, label: "Allow All", desc: "No reliability checking", color: "green" },
              ]).map((opt) => {
                const selected = safetySettings.hallucination_check === opt.value;
                const borderColor = selected
                  ? opt.color === "blue" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : opt.color === "red" ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : opt.color === "amber" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                  : "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600";
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateSafety("hallucination_check", opt.value)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors cursor-pointer ${borderColor}`}
                  >
                    <p className={`text-sm font-medium ${selected
                      ? opt.color === "blue" ? "text-blue-700 dark:text-blue-400"
                      : opt.color === "red" ? "text-red-700 dark:text-red-400"
                      : opt.color === "amber" ? "text-amber-700 dark:text-amber-400"
                      : "text-green-700 dark:text-green-400"
                      : "text-gray-700 dark:text-gray-300"
                    }`}>{opt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">How Safety Checks Work</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              PII detection runs <strong>before</strong> any data is sent to the AI model. Your content is validated by ZeroTrusted.ai first — it never reaches the LLM until it passes.
              Hallucination checks run <strong>after</strong> the AI responds, evaluating reliability across multiple models.
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Scenario</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">ZTA Called?</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Data Reaches LLM?</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300">
                  <tr className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">PII Block mode, PII found</td>
                    <td className="px-3 py-1.5 text-green-600 dark:text-green-400">Yes</td>
                    <td className="px-3 py-1.5 text-red-600 dark:text-red-400 font-medium">No (blocked)</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">PII Block mode, no PII</td>
                    <td className="px-3 py-1.5 text-green-600 dark:text-green-400">Yes</td>
                    <td className="px-3 py-1.5">Yes (after ZTA passes)</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">PII Warn mode, PII found, user cancels</td>
                    <td className="px-3 py-1.5 text-green-600 dark:text-green-400">Yes</td>
                    <td className="px-3 py-1.5 text-red-600 dark:text-red-400 font-medium">No</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">PII Warn mode, user clicks &quot;Send Anyway&quot;</td>
                    <td className="px-3 py-1.5 text-green-600 dark:text-green-400">Yes</td>
                    <td className="px-3 py-1.5">Yes (user override)</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">PII Allow All mode</td>
                    <td className="px-3 py-1.5 text-gray-400">No</td>
                    <td className="px-3 py-1.5">Yes (directly)</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5">ZTA API error</td>
                    <td className="px-3 py-1.5 text-amber-600 dark:text-amber-400">Attempted</td>
                    <td className="px-3 py-1.5">Yes (graceful fallback)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Safety checks are powered by <a href="https://dev.zerotrusted.ai" target="_blank" rel="noopener noreferrer" className="underline font-medium">ZeroTrusted.ai</a> guardrails API.
          </p>
        </div>
      )}

      {/* Fraud Simulation Tab */}
      {activeTab === "fraud" && (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Fraud Detection Simulation</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Generate 2 months of backdated transactions with embedded fraudulent patterns for blue team testing.
        </p>

        {/* Target Selection */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Customer</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer min-w-48"
            >
              <option value="">Auto-create (default)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.customer_id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer min-w-48"
            >
              <option value="">Auto-create (default)</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.account_number} ({a.account_type})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleSeed("mixed")}
            disabled={seedStatus === "loading"}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Generate initial seed data with normal + fraudulent transactions"
          >
            {seedStatus === "loading" ? "Generating..." : "Generate Seed Data"}
          </button>
          <button
            onClick={() => handleSeed("append")}
            disabled={seedStatus === "loading"}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Add more transactions on top of existing data (normal + fraud)"
          >
            Add More Data
          </button>
          <button
            onClick={() => handleSeed("clean_only")}
            disabled={seedStatus === "loading"}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Add only normal transactions (no fraud) — test for false positives"
          >
            Add Clean Only
          </button>
          <button
            onClick={() => handleSeed("mixed", true)}
            disabled={seedStatus === "loading"}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Delete all existing transactions and generate fresh seed data"
          >
            Force Regenerate
          </button>
          <button
            onClick={() => handleClearAll(true)}
            disabled={seedStatus === "loading"}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Delete all transactions and scan data, keep customers and accounts"
          >
            Clear Transactions
          </button>
          <button
            onClick={() => handleClearAll(false)}
            disabled={seedStatus === "loading"}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Delete everything — transactions, scan data, accounts, and customers"
          >
            Delete All
          </button>
        </div>

        {/* Status message */}
        {seedMessage && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            seedStatus === "success"
              ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
          }`}>
            {seedMessage}
          </div>
        )}

        {/* Persisted fraud data */}
        {fraudData && fraudData.anon_user_id && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm">
            <div className="space-y-1 text-xs font-mono text-gray-600 dark:text-gray-400">
              {fraudData.customer_id && <p>Customer: <span className="select-all font-bold text-gray-900 dark:text-gray-100">{fraudData.customer_id}</span></p>}
              <p>Anonymized User ID: <span className="select-all font-bold text-gray-900 dark:text-gray-100">{fraudData.anon_user_id}</span></p>
              <p>Checking Account: <span className="select-all">{fraudData.checking_account_id}</span></p>
              {fraudData.savings_account_id && <p>Savings Account: <span className="select-all">{fraudData.savings_account_id}</span></p>}
              {fraudData.total_transactions > 0 && <p>Total Transactions: {fraudData.total_transactions}</p>}
              {fraudData.seeded_at && <p>Seeded: {new Date(fraudData.seeded_at).toLocaleString()}</p>}
            </div>
          </div>
        )}

        {/* Fraud transaction IDs with notes */}
        {hasData && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Fraudulent Transactions ({fraudData.fraud_count})
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(fraudData.fraud_transaction_ids.join(","));
                  }}
                  className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  Copy IDs
                </button>
                <a
                  href={`/transactions?txn_ids=${fraudData.fraud_transaction_ids.join(",")}`}
                  className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  View in Transactions
                </a>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-44">Transaction ID</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Fraud Pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {fraudData.fraud_transaction_ids.map((id) => (
                    <tr key={id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-3 py-2 font-mono select-all text-gray-700 dark:text-gray-300">{id}</td>
                      <td className="px-3 py-2 text-red-700 dark:text-red-400">
                        {fraudData.fraud_transaction_notes[id] || "Fraudulent"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
