"use client";

import { useEffect, useState } from "react";
import { useCustomer } from "@/features/portal/components/CustomerContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Account = Record<string, any>;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function PortalDashboardPage() {
  const { customerId, customerName } = useCustomer();
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

  if (loading) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">My Dashboard</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    );
  }

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const checking = accounts.filter((a) => a.account_type === "checking");
  const savings = accounts.filter((a) => a.account_type === "savings");
  const active = accounts.filter((a) => a.status === "active");

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">My Dashboard</h2>
      {customerName && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Welcome, {customerName}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Accounts"
          value={accounts.length.toString()}
          sub={`${checking.length} checking, ${savings.length} savings`}
        />
        <StatCard
          label="Total Balance"
          value={formatCurrency(totalBalance)}
          sub="Across all accounts"
        />
        <StatCard
          label="Active Accounts"
          value={active.length.toString()}
          sub={`${accounts.length - active.length} frozen or closed`}
        />
        <StatCard
          label="Checking Balance"
          value={formatCurrency(checking.reduce((s, a) => s + Number(a.balance), 0))}
          sub="Checking accounts only"
        />
      </div>

      {accounts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Account Summary</h3>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Account #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-200 dark:border-gray-800 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{a.account_number}</td>
                    <td className="px-4 py-3 capitalize text-gray-900 dark:text-gray-100">{a.account_type}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(Number(a.balance))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === "active" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
