"use client";

import { useEffect, useState } from "react";

interface Stats {
  customers: { total: number; verified: number; pending: number };
  accounts: { total: number; checking: number; savings: number; active: number; frozen: number; totalBalance: number };
  transactions: { todayCount: number; todayVolume: number };
}

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

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const data = await res.json();
      setStats(data.stats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    const handler = () => fetchStats();
    window.addEventListener("bank:data-changed", handler);
    return () => window.removeEventListener("bank:data-changed", handler);
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Dashboard</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Dashboard</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">No data available. Use the AI Copilot to get started.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Customers"
          value={stats.customers.total.toString()}
          sub={`${stats.customers.verified} verified, ${stats.customers.pending} pending KYC`}
        />
        <StatCard
          label="Total Accounts"
          value={stats.accounts.total.toString()}
          sub={`${stats.accounts.checking} checking, ${stats.accounts.savings} savings${stats.accounts.frozen > 0 ? `, ${stats.accounts.frozen} frozen` : ""}`}
        />
        <StatCard
          label="Total Balance"
          value={formatCurrency(stats.accounts.totalBalance)}
          sub="Across all accounts"
        />
        <StatCard
          label="Today's Activity"
          value={stats.transactions.todayCount.toString()}
          sub={`${formatCurrency(stats.transactions.todayVolume)} volume`}
        />
      </div>
    </div>
  );
}
