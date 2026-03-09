"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CustomerProvider, CustomerSelector, useCustomer } from "@/features/portal/components/CustomerContext";
import { CopilotPanel } from "@/features/copilot/components/CopilotPanel";
import { LogoutButton } from "@/shared/components/LogoutButton";

const PORTAL_NAV = [
  { href: "/portal/dashboard", label: "My Dashboard" },
  { href: "/portal/accounts", label: "My Accounts" },
  { href: "/portal/transactions", label: "My Transactions" },
];

function PortalInner({ children }: { children: React.ReactNode }) {
  const [copilotOpen, setCopilotOpen] = useState(true);
  const pathname = usePathname();
  const { customerId, customerName, isAuthCustomer } = useCustomer();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Agentic Bank</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-2">Customer Portal</p>
          <CustomerSelector />
        </div>

        <nav className="flex-1 p-3 space-y-1" suppressHydrationWarning>
          {PORTAL_NAV.map((item) => {
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
          {!isAuthCustomer && (
            <>
              <Link
                href="/docs"
                suppressHydrationWarning
                className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Documentation
              </Link>
              <Link
                href="/dashboard"
                suppressHydrationWarning
                className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Back to Admin
              </Link>
            </>
          )}
          <LogoutButton />
          <button
            onClick={() => setCopilotOpen(!copilotOpen)}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {copilotOpen ? "Hide Assistant" : "AI Assistant"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Customer copilot panel */}
      {copilotOpen && customerId && (
        <CopilotPanel
          onClose={() => setCopilotOpen(false)}
          context={{ page: pathname }}
          customerId={customerId}
          customerName={customerName}
        />
      )}
    </div>
  );
}

export default function PortalLayoutClient({
  children,
  authCustomerId,
}: {
  children: React.ReactNode;
  authCustomerId: string | null;
}) {
  return (
    <CustomerProvider authCustomerId={authCustomerId}>
      <PortalInner>{children}</PortalInner>
    </CustomerProvider>
  );
}
