"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CopilotPanel } from "@/features/copilot/components/CopilotPanel";
import { LogoutButton } from "@/shared/components/LogoutButton";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [copilotOpen, setCopilotOpen] = useState(true);
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Agentic Bank</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">AI-Powered Banking</p>
        </div>

        <nav className="flex-1 p-3 space-y-1" suppressHydrationWarning>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                suppressHydrationWarning
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-2 border-t border-gray-200 dark:border-gray-800" suppressHydrationWarning>
          <Link
            href="/portal/dashboard"
            suppressHydrationWarning
            className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith("/portal")
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            }`}
          >
            Customer Portal
          </Link>
          <Link
            href="/docs"
            suppressHydrationWarning
            className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/docs"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            }`}
          >
            Documentation
          </Link>
          <Link
            href="/settings"
            suppressHydrationWarning
            className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/settings"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            }`}
          >
            Settings
          </Link>
          <LogoutButton />
          <button
            onClick={() => setCopilotOpen(!copilotOpen)}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {copilotOpen ? "Hide Copilot" : "AI Copilot"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Copilot panel */}
      {copilotOpen && (
        <CopilotPanel
          onClose={() => setCopilotOpen(false)}
          context={{ page: pathname }}
        />
      )}
    </div>
  );
}
