"use client";

import { useEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Customer = Record<string, any>;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();

    const handler = () => fetchCustomers();
    window.addEventListener("bank:data-changed", handler);
    return () => window.removeEventListener("bank:data-changed", handler);
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Customers</h2>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No customers yet. Use the AI Copilot to register your first customer.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">KYC Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Notes</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Created</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{c.customer_id}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.first_name} {c.last_name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.email || "-"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.phone || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.kyc_status === "verified" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      c.kyc_status === "rejected" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      {c.kyc_status}
                    </span>
                  </td>
                  {/* VULN: Stored XSS — rendering user-supplied HTML without sanitization */}
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: c.notes || "-" }} />
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
