import { BankContextSnapshot } from "./bank-context";

/**
 * Formats the bank context snapshot into a compact markdown block
 * for injection into the copilot system prompt.
 * Target: ~300 tokens to avoid bloating the system prompt.
 */
export function formatBankContextForPrompt(snapshot: BankContextSnapshot): string {
  const lines: string[] = ["## Banking Context (live)"];

  // Org profile
  lines.push(`- **Organization**: ${snapshot.org.name} | ${capitalize(snapshot.org.plan)} plan`);

  // Customers
  const { customers } = snapshot;
  if (customers.total > 0) {
    const parts = Object.entries(customers.byKycStatus).map(([s, n]) => `${n} ${s}`);
    lines.push(`- **Customers**: ${customers.total} total (${parts.join(", ")})`);
  } else {
    lines.push("- **Customers**: No customers registered yet");
  }

  // Accounts
  const { accounts } = snapshot;
  if (accounts.total > 0) {
    const typeParts = Object.entries(accounts.byType).map(([t, n]) => `${n} ${t}`);
    const frozenCount = accounts.byStatus["frozen"] || 0;
    const frozenNote = frozenCount > 0 ? ` | ${frozenCount} frozen` : "";
    lines.push(`- **Accounts**: ${accounts.total} total (${typeParts.join(", ")}) | $${formatCurrency(accounts.totalBalance)} total balance${frozenNote}`);
  } else {
    lines.push("- **Accounts**: No accounts opened yet");
  }

  // Today's transactions
  const { transactions } = snapshot;
  if (transactions.todayCount > 0) {
    lines.push(`- **Today**: ${transactions.todayCount} transactions, $${formatCurrency(transactions.todayVolume)} volume`);
    if (transactions.recentLarge.length > 0) {
      const large = transactions.recentLarge
        .slice(0, 3)
        .map((t) => `"${t.transaction_id}" ${t.type} $${formatCurrency(t.amount)}`)
        .join(", ");
      lines.push(`  - Largest: ${large}`);
    }
  } else {
    lines.push("- **Today**: No transactions yet");
  }

  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(2);
}
