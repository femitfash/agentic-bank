"use client";

import { useEffect, useState, useCallback } from "react";
import AzureFileBrowser from "./AzureFileBrowser";
import ColumnMapper from "./ColumnMapper";

interface ValidationRow {
  transaction_id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
  account_id: string;
  account_number: string;
  account_type: string;
  customer_name: string;
  customer_id: string;
  is_ground_truth_fraud: boolean;
  ground_truth_note: string | null;
  scanner_flagged: boolean;
  scanner_risk_score: number | null;
  scanner_reason: string | null;
  scanner_batch_id: string | null;
  status: "detected" | "missed" | "false_positive" | "clean" | "not_in_batch";
}

interface Summary {
  total_ground_truth: number;
  total_scanner_flagged: number;
  detected: number;
  missed: number;
  false_positives: number;
  detection_rate: number;
  precision: number;
  out_of_batch_fraud?: number;
  batch_scoped?: boolean;
  total_in_batch?: number | null;
}

interface FilterOption {
  id: string;
  label: string;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDt(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; rowBg: string }> = {
  detected: { label: "Detected", bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", rowBg: "" },
  missed: { label: "Missed", bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", rowBg: "bg-red-50/50 dark:bg-red-950/20" },
  false_positive: { label: "False Positive", bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", rowBg: "bg-yellow-50/50 dark:bg-yellow-950/20" },
  not_in_batch: { label: "Not in Batch", bg: "bg-gray-100 dark:bg-gray-700/30", text: "text-gray-500 dark:text-gray-500", rowBg: "opacity-50" },
  clean: { label: "Clean", bg: "bg-gray-50 dark:bg-gray-800/30", text: "text-gray-500 dark:text-gray-400", rowBg: "" },
};

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReportRows(rows: ValidationRow[], includeGroundTruth = false) {
  return rows
    .filter(r => r.status !== "not_in_batch")
    .map(r => {
      const base: Record<string, unknown> = {
        transaction_id: r.transaction_id,
        status: r.status,
        type: r.type,
        amount: r.amount,
        description: r.description,
        created_at: r.created_at,
        account_number: r.account_number,
        customer_name: r.customer_name,
        scanner_flagged: r.scanner_flagged,
        scanner_risk_score: r.scanner_risk_score,
        scanner_reason: r.scanner_reason,
      };
      if (includeGroundTruth) {
        base.is_ground_truth_fraud = r.is_ground_truth_fraud;
        base.ground_truth_note = r.ground_truth_note;
      }
      return base;
    });
}

function toCsv(rows: ReturnType<typeof buildReportRows>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape((r as Record<string, unknown>)[h])).join(",")),
  ].join("\n");
}

function ExpandableCell({ text, maxLen = 40 }: { text: string | null; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  if (text.length <= maxLen) return <span>{text}</span>;
  return (
    <span>
      {expanded ? text : text.slice(0, maxLen) + "..."}
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export default function FraudValidationPage() {
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGroundTruth, setShowGroundTruth] = useState(false);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");

  // Filter options
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [accounts, setAccounts] = useState<FilterOption[]>([]);
  const [batches, setBatches] = useState<FilterOption[]>([]);

  // API Payload preview
  const [showPayload, setShowPayload] = useState(false);
  const [payloadData, setPayloadData] = useState<string>("");
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState("");

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadAccountId, setUploadAccountId] = useState("");

  // Azure / Column Mapper
  const [showAzureBrowser, setShowAzureBrowser] = useState(false);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [pendingFileContent, setPendingFileContent] = useState("");
  const [pendingFileName, setPendingFileName] = useState("");

  // Actions dropdown
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const fetchData = useCallback(async () => {
    // Load ground truth from localStorage
    let fraudIds = "";
    let fraudNotes = "{}";
    try {
      const raw = localStorage.getItem("fraud_sim_data");
      if (raw) {
        const data = JSON.parse(raw);
        fraudIds = (data.fraud_transaction_ids || []).join(",");
        fraudNotes = JSON.stringify(data.fraud_transaction_notes || {});
      }
    } catch { /* ignore */ }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("fraud_ids", fraudIds);
      params.set("fraud_notes", fraudNotes);
      if (batchFilter) params.set("batch_id", batchFilter);
      if (accountFilter) params.set("account_id", accountFilter);
      if (customerFilter) params.set("customer_id", customerFilter);
      if (!batchFilter) {
        params.set("page", String(currentPage));
        params.set("page_size", "100");
      }

      const res = await fetch(`/api/admin/fraud-validation?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load validation data");
        return;
      }

      setRows(data.transactions || []);
      setSummary(data.summary || null);
      setPagination(data.pagination || null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCustomers((data.customers || []).map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name} (${c.customer_id})` })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAccounts((data.accounts || []).map((a: any) => ({ id: a.id, label: `${a.account_number} (${a.account_type})` })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBatches((data.batches || []).map((b: any) => ({ id: b.batch_id, label: `${b.batch_id} — ${b.status} (${b.transaction_count} txns)` })));
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }, [batchFilter, accountFilter, customerFilter, currentPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRows = statusFilter
    ? rows.filter(r => r.status === statusFilter)
    : rows;

  const reportRows = buildReportRows(filteredRows);

  function handleDownloadJson() {
    downloadFile(JSON.stringify(reportRows, null, 2), "fraud-validation-report.json", "application/json");
  }

  function handleDownloadCsv() {
    downloadFile(toCsv(reportRows), "fraud-validation-report.csv", "text/csv");
  }

  const reportRowsWithGt = buildReportRows(filteredRows, true);

  function handleDownloadJsonWithGt() {
    downloadFile(JSON.stringify(reportRowsWithGt, null, 2), "fraud-validation-with-ground-truth.json", "application/json");
  }

  function handleDownloadCsvWithGt() {
    downloadFile(toCsv(reportRowsWithGt), "fraud-validation-with-ground-truth.csv", "text/csv");
  }

  function downloadTemplateCsv() {
    const csv = `type,amount,description,created_at,status,metadata
deposit,2500.00,Direct Deposit - Payroll,2026-02-15T09:00:00Z,completed,
withdrawal,85.50,POS Purchase - Grocery Store,2026-02-16T14:30:00Z,completed,"{""ip_address"":""192.168.1.10"",""device_type"":""mobile"",""channel"":""pos"",""location"":{""city"":""New York"",""country"":""US""},""mcc"":""5411"",""mcc_description"":""Grocery Stores""}"
withdrawal,3200.00,Wire Transfer - Unknown Recipient,2026-02-16T03:15:00Z,completed,"{""ip_address"":""103.45.67.89"",""device_type"":""desktop"",""channel"":""online"",""location"":{""city"":""Lagos"",""country"":""NG""},""risk_signals"":{""vpn_detected"":true,""unusual_location"":true}}"
deposit,1200.00,ACH Transfer - Savings,2026-02-17T10:00:00Z,completed,
withdrawal,45.99,Online Purchase - Streaming Service,2026-02-18T20:45:00Z,completed,"{""device_type"":""mobile"",""channel"":""online"",""is_recurring"":true}"`;
    downloadFile(csv, "transaction-upload-template.csv", "text/csv");
  }

  function downloadTemplateJson() {
    const template = {
      transactions: [
        {
          type: "deposit",
          amount: 2500.00,
          description: "Direct Deposit - Payroll",
          created_at: "2026-02-15T09:00:00Z",
          status: "completed",
        },
        {
          type: "withdrawal",
          amount: 85.50,
          description: "POS Purchase - Grocery Store",
          created_at: "2026-02-16T14:30:00Z",
          status: "completed",
          metadata: {
            ip_address: "192.168.1.10",
            device_type: "mobile",
            channel: "pos",
            location: { city: "New York", country: "US" },
            mcc: "5411",
            mcc_description: "Grocery Stores",
          },
        },
        {
          type: "withdrawal",
          amount: 3200.00,
          description: "Wire Transfer - Unknown Recipient",
          created_at: "2026-02-16T03:15:00Z",
          status: "completed",
          metadata: {
            ip_address: "103.45.67.89",
            device_type: "desktop",
            channel: "online",
            location: { city: "Lagos", country: "NG" },
            risk_signals: { vpn_detected: true, unusual_location: true },
          },
        },
        {
          type: "deposit",
          amount: 1200.00,
          description: "ACH Transfer - Savings",
          created_at: "2026-02-17T10:00:00Z",
          status: "completed",
        },
        {
          type: "withdrawal",
          amount: 45.99,
          description: "Online Purchase - Streaming Service",
          created_at: "2026-02-18T20:45:00Z",
          status: "completed",
          metadata: {
            device_type: "mobile",
            channel: "online",
            is_recurring: true,
          },
        },
      ],
    };
    downloadFile(JSON.stringify(template, null, 2), "transaction-upload-template.json", "application/json");
  }

  async function handleFetchPayload() {
    if (showPayload && payloadData) {
      setShowPayload(!showPayload);
      return;
    }
    setShowPayload(true);
    setPayloadLoading(true);
    setPayloadError("");
    try {
      const raw = localStorage.getItem("fraud_sim_data");
      if (!raw) { setPayloadError("No seed data found. Generate seed data in Settings first."); return; }
      const sim = JSON.parse(raw);
      const customerUuid = sim.customer_uuid;
      if (!customerUuid) { setPayloadError("No customer UUID found in seed data. Try regenerating seed data."); return; }

      // Use admin preview endpoint — returns the exact same payload shape as the scanner batch API
      const res = await fetch(`/api/admin/fraud-validation/preview-payload?customer_uuid=${customerUuid}&batch_size=50`);
      const data = await res.json();
      setPayloadData(JSON.stringify(data, null, 2));
    } catch {
      setPayloadError("Failed to fetch batch payload");
    } finally {
      setPayloadLoading(false);
    }
  }

  function handleCopyPayload() {
    navigator.clipboard.writeText(payloadData);
  }

  async function handleFileUpload(file: File) {
    setUploadMessage("");
    setUploadError("");
    const text = await file.text();
    setPendingFileName(file.name);
    setPendingFileContent(text);
    setShowColumnMapper(true);
  }

  function handleAzureFileSelected(filename: string, content: string) {
    setUploadMessage("");
    setUploadError("");
    setPendingFileName(filename);
    setPendingFileContent(content);
    setShowAzureBrowser(false);
    setShowColumnMapper(true);
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Fraud Scanner Validation</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Compare scanner results against known fraudulent transactions to measure detection accuracy.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards — only visible when ground truth is shown */}
      {summary && showGroundTruth && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Detection Rate</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{summary.detection_rate}%</p>
            <p className="text-xs text-gray-400 mt-1">{summary.detected} of {summary.total_ground_truth} found</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Precision</p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{summary.precision}%</p>
            <p className="text-xs text-gray-400 mt-1">{summary.detected} of {summary.total_scanner_flagged} correct</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-green-200 dark:border-green-800 p-4">
            <p className="text-xs font-medium text-green-600 dark:text-green-400">Detected</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{summary.detected}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 p-4">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Missed</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{summary.missed}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-yellow-200 dark:border-yellow-800 p-4">
            <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">False Positives</p>
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400 mt-1">{summary.false_positives}</p>
          </div>
        </div>
      )}

      {/* Batch scope info */}
      {summary?.batch_scoped && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
          Showing {summary.total_in_batch} transactions from this batch.
          {summary.out_of_batch_fraud && summary.out_of_batch_fraud > 0 ? (
            <span className="ml-1">{summary.out_of_batch_fraud} known fraud transactions were not included in this batch (outside batch window).</span>
          ) : null}
        </div>
      )}

      {/* Filters + Download */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
          <div className="flex gap-1">
            {[
              { value: "", label: "All" },
              { value: "detected", label: "Detected" },
              { value: "missed", label: "Missed" },
              { value: "false_positive", label: "False Pos." },
              { value: "clean", label: "Clean" },
              { value: "not_in_batch", label: "Not in Batch" },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  statusFilter === s.value
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Customer</label>
          <select
            value={customerFilter}
            onChange={(e) => { setCustomerFilter(e.target.value); setAccountFilter(""); setCurrentPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account</label>
          <select
            value={accountFilter}
            onChange={(e) => { setAccountFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Scanner Batch</label>
          <select
            value={batchFilter}
            onChange={(e) => { setBatchFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-end gap-2 pb-0.5">
          <button
            onClick={handleFetchPayload}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              showPayload
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
            title="Preview the API payload the scanner receives from GET /batch"
          >
            {payloadLoading ? "Loading..." : showPayload ? "Hide API Payload" : "Preview API Payload"}
          </button>
          <button
            onClick={() => setShowGroundTruth(!showGroundTruth)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              showGroundTruth
                ? "bg-red-600 text-white hover:bg-red-700"
                : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
            title="Show/hide ground truth answers (admin only)"
          >
            {showGroundTruth ? "Hide Ground Truth" : "Show Ground Truth"}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer flex items-center gap-1"
            >
              Actions
              <svg className={`w-3 h-3 transition-transform ${showActionsMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                  <p className="px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Download</p>
                  <button
                    onClick={() => { handleDownloadJson(); setShowActionsMenu(false); }}
                    disabled={reportRows.length === 0}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => { handleDownloadCsv(); setShowActionsMenu(false); }}
                    disabled={reportRows.length === 0}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    CSV
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700" />
                  <p className="px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Download with Ground Truth</p>
                  <button
                    onClick={() => { handleDownloadJsonWithGt(); setShowActionsMenu(false); }}
                    disabled={reportRowsWithGt.length === 0}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    JSON + Ground Truth
                  </button>
                  <button
                    onClick={() => { handleDownloadCsvWithGt(); setShowActionsMenu(false); }}
                    disabled={reportRowsWithGt.length === 0}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    CSV + Ground Truth
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => { setShowUpload(!showUpload); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    Upload Transactions
                  </button>
                </div>
              </>
            )}
          </div>
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {loading ? "Loading..." : pagination && pagination.total > filteredRows.length
              ? `${filteredRows.length} of ${pagination.total} txns`
              : `${filteredRows.length} txn${filteredRows.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* API Payload Preview */}
      {showPayload && (
        <div className="mb-4 bg-gray-900 dark:bg-gray-950 rounded-xl border border-indigo-500/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-400">GET /api/v1/fraud-detection/batch</span>
              <span className="text-xs text-gray-500">— This is the payload the scanner receives</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyPayload}
                disabled={!payloadData}
                className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 cursor-pointer transition-colors"
              >
                Copy JSON
              </button>
              <button
                onClick={() => setShowPayload(false)}
                className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          {payloadError ? (
            <div className="p-4 text-sm text-red-400">{payloadError}</div>
          ) : payloadLoading ? (
            <div className="p-4 text-sm text-gray-400">Fetching batch payload...</div>
          ) : (
            <pre className="p-4 text-xs text-green-400 overflow-auto max-h-96 font-mono whitespace-pre">
              {payloadData}
            </pre>
          )}
        </div>
      )}

      {/* Upload Panel */}
      {showUpload && (
        <div className="mb-4 bg-white dark:bg-gray-900 rounded-xl border border-emerald-500/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Upload Transactions (JSON or CSV)</span>
            <button
              onClick={() => { setShowUpload(false); setUploadMessage(""); setUploadError(""); }}
              className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Target Account (optional)</label>
                <select
                  value={uploadAccountId}
                  onChange={(e) => setUploadAccountId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value="">Use account_id from file</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
              <label className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-emerald-600 text-white hover:bg-emerald-700">
                Choose File
                <input
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => setShowAzureBrowser(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors"
              >
                Browse Azure File Storage
              </button>
            </div>

            {uploadMessage && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm">
                {uploadMessage}
              </div>
            )}
            {uploadError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm whitespace-pre-wrap">
                {uploadError}
              </div>
            )}

            <div className="flex items-center gap-4 pt-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Download template:</span>
              <button
                onClick={downloadTemplateCsv}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                CSV template
              </button>
              <button
                onClick={downloadTemplateJson}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                JSON template
              </button>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
              <p>Required fields: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">type</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">amount</code>. Other fields are optional. Max 500 per upload.</p>
              <p>Types: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">deposit</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">withdrawal</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">transfer_out</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">transfer_in</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {!loading && filteredRows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {rows.length === 0
            ? "No data. Generate seed data in Settings, then run a scanner and submit results via webhook."
            : "No transactions match the selected filters."}
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-500 dark:text-gray-400">TXN ID</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Date/Time</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  {showGroundTruth && <th className="text-left px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Ground Truth</th>}
                  <th className="text-center px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Score</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-500 dark:text-gray-400">Scanner Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.clean;
                  const dt = formatDt(r.created_at);
                  return (
                    <tr key={r.transaction_id} className={`border-b border-gray-200 dark:border-gray-800 last:border-0 ${cfg.rowBg}`}>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{r.transaction_id}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        <div className="text-gray-700 dark:text-gray-300">{dt.date}</div>
                        <div className="text-gray-400 dark:text-gray-500">{dt.time}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 max-w-56">
                        <ExpandableCell text={r.description} maxLen={45} />
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
                        {formatCurrency(r.amount)}
                      </td>
                      {showGroundTruth && (
                        <td className="px-3 py-3 text-xs max-w-56 text-red-600 dark:text-red-400">
                          <ExpandableCell text={r.ground_truth_note} maxLen={40} />
                        </td>
                      )}
                      <td className="px-3 py-3 text-center">
                        {r.scanner_risk_score !== null ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            r.scanner_risk_score >= 80
                              ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                              : r.scanner_risk_score >= 60
                              ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                          }`}>
                            {r.scanner_risk_score}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-64">
                        <ExpandableCell text={r.scanner_reason} maxLen={50} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} total transactions)
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(pagination.total_pages, p + 1))}
              disabled={currentPage >= pagination.total_pages}
              className="px-3 py-1.5 rounded text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(pagination.total_pages)}
              disabled={currentPage >= pagination.total_pages}
              className="px-3 py-1.5 rounded text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}

      <AzureFileBrowser
        open={showAzureBrowser}
        onClose={() => setShowAzureBrowser(false)}
        onFileSelected={handleAzureFileSelected}
      />
      <ColumnMapper
        open={showColumnMapper}
        filename={pendingFileName}
        rawContent={pendingFileContent}
        accountId={uploadAccountId}
        onClose={() => setShowColumnMapper(false)}
        onUploadComplete={(msg) => { setUploadMessage(msg); fetchData(); }}
        onError={(err) => setUploadError(err)}
      />
    </div>
  );
}
