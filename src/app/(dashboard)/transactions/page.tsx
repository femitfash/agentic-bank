"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = Record<string, any>;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
  };
}

function loadFraudIds(): Set<string> {
  try {
    const raw = localStorage.getItem("fraud_sim_data");
    if (!raw) return new Set();
    const data = JSON.parse(raw);
    return new Set(data.fraud_transaction_ids || []);
  } catch { return new Set(); }
}

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
};

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer_out", label: "Transfer Out" },
  { value: "transfer_in", label: "Transfer In" },
];

type DatePreset = "today" | "week" | "month" | "custom" | "";

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];

  switch (preset) {
    case "today": {
      return { from: to, to };
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split("T")[0], to };
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString().split("T")[0], to };
    }
    default:
      return { from: "", to: "" };
  }
}

const PAGE_SIZE = 50;

export default function TransactionsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading transactions...</div>}>
      <TransactionsPage />
    </Suspense>
  );
}

function TransactionsPage() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [typeFilter, setTypeFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [txnIdFilter, setTxnIdFilter] = useState("");
  const txnIdInputRef = useRef<HTMLInputElement>(null);
  const [fraudIds, setFraudIds] = useState<Set<string>>(new Set());

  // Load fraud IDs from localStorage
  useEffect(() => {
    setFraudIds(loadFraudIds());
  }, []);

  // Initialize txn_ids filter from URL params
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const urlTxnIds = searchParams.get("txn_ids");
    if (urlTxnIds) {
      setTxnIdFilter(urlTxnIds);
    }
  }, [searchParams]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((page - 1) * PAGE_SIZE));

      if (typeFilter) params.set("type", typeFilter);

      if (txnIdFilter.trim()) {
        params.set("txn_ids", txnIdFilter.trim());
      }

      if (datePreset === "custom") {
        if (customFrom) params.set("date_from", customFrom);
        if (customTo) params.set("date_to", customTo);
      } else if (datePreset) {
        const { from, to } = getDateRange(datePreset);
        if (from) params.set("date_from", from);
        if (to) params.set("date_to", to);
      }

      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotalCount(data.total ?? data.transactions?.length ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, datePreset, customFrom, customTo, txnIdFilter]);

  useEffect(() => {
    fetchTransactions();

    const handler = () => fetchTransactions();
    window.addEventListener("bank:data-changed", handler);
    return () => window.removeEventListener("bank:data-changed", handler);
  }, [fetchTransactions]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [typeFilter, datePreset, customFrom, customTo, txnIdFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Transactions</h2>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* Type filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Date preset */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Period</label>
          <div className="flex gap-1">
            {([
              { value: "", label: "All" },
              { value: "today", label: "Today" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "custom", label: "Custom" },
            ] as { value: DatePreset; label: string }[]).map((p) => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  datePreset === p.value
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date inputs */}
        {datePreset === "custom" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          </>
        )}

        {/* Transaction ID filter */}
        <div className="w-full mt-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Transaction IDs</label>
          <div className="flex gap-2">
            <input
              ref={txnIdInputRef}
              type="text"
              value={txnIdFilter}
              onChange={(e) => setTxnIdFilter(e.target.value)}
              placeholder="Paste comma-separated TXN IDs (e.g. TXN-ABC,TXN-DEF)"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono"
            />
            {txnIdFilter && (
              <button
                onClick={() => { setTxnIdFilter(""); if (txnIdInputRef.current) txnIdInputRef.current.focus(); }}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Result count */}
        <div className="w-full flex justify-between items-center">
          <div className="text-sm text-gray-400 dark:text-gray-500">
            {loading ? "Loading..." : `${totalCount} transaction${totalCount !== 1 ? "s" : ""}`}
          </div>
        </div>
      </div>

      {/* Table */}
      {!loading && transactions.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No transactions found for the selected filters.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Account</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Balance After</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const isFraud = fraudIds.has(t.transaction_id);
                const dt = formatDateTime(t.created_at);
                return (
                <tr key={t.id} className={`border-b border-gray-200 dark:border-gray-800 last:border-0 ${
                  isFraud
                    ? "bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      {isFraud && <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" title="Fraudulent" />}
                      {t.transaction_id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.type === "deposit" || t.type === "transfer_in"
                        ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    }`}>
                      {TYPE_LABELS[t.type] || t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={t.description}>
                    {t.description || "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {t.accounts?.account_number || "-"}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    t.type === "deposit" || t.type === "transfer_in"
                      ? "text-green-700 dark:text-green-400"
                      : "text-orange-700 dark:text-orange-400"
                  }`}>
                    {t.type === "deposit" || t.type === "transfer_in" ? "+" : "-"}
                    {formatCurrency(Number(t.amount))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{formatCurrency(Number(t.balance_after))}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === "completed" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      t.status === "failed" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <div className="text-gray-700 dark:text-gray-300">{dt.date}</div>
                    <div className="text-gray-400 dark:text-gray-500">{dt.time}</div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Previous
            </button>
            {/* Page number buttons */}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    page === pageNum
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
