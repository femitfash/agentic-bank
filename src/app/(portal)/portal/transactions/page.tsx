"use client";

import { useEffect, useState } from "react";
import { useCustomer } from "@/features/portal/components/CustomerContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transaction = Record<string, any>;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
};

export default function PortalTransactionsPage() {
  const { customerId } = useCustomer();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    (async () => {
      try {
        // Fetch the customer's accounts, then transactions for those accounts
        const acctRes = await fetch(`/api/accounts?customer_id=${customerId}`);
        const acctData = await acctRes.json();
        const accounts = acctData.accounts || [];
        if (accounts.length === 0) {
          setTransactions([]);
          return;
        }

        // Fetch transactions for each account and merge
        const allTxns: Transaction[] = [];
        for (const acct of accounts) {
          const res = await fetch(`/api/transactions?account_id=${acct.id}&limit=50`);
          const data = await res.json();
          allTxns.push(...(data.transactions || []));
        }

        // Sort by date descending
        allTxns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setTransactions(allTxns.slice(0, 100));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">My Transactions</h2>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No transactions found.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Account</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Balance After</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{t.transaction_id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.type === "deposit" || t.type === "transfer_in"
                        ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    }`}>
                      {TYPE_LABELS[t.type] || t.type}
                    </span>
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
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">{t.reference}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === "completed" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      t.status === "failed" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
