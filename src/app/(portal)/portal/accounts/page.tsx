"use client";

import { useEffect, useState } from "react";
import { useCustomer } from "@/features/portal/components/CustomerContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Account = Record<string, any>;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function PortalAccountsPage() {
  const { customerId } = useCustomer();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/accounts?customer_id=${customerId}`);
        const data = await res.json();
        setAccounts(data.accounts || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">My Accounts</h2>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No accounts found.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Account #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Opened</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{a.account_number}</td>
                  <td className="px-4 py-3 capitalize text-gray-900 dark:text-gray-100">{a.account_type}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(Number(a.balance))}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.status === "active" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      a.status === "frozen" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
