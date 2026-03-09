import { createAdminClient } from "@/shared/lib/supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BankContextSnapshot {
  org: {
    name: string;
    plan: string;
  };
  customers: {
    total: number;
    byKycStatus: Record<string, number>;
  };
  accounts: {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalBalance: number;
  };
  transactions: {
    todayCount: number;
    todayVolume: number;
    recentLarge: Array<{ transaction_id: string; type: string; amount: number }>;
  };
  snapshotAt: string;
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const cache = new Map<string, { snapshot: BankContextSnapshot; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateBankContext(organizationId: string) {
  cache.delete(organizationId);
}

export async function getBankContext(organizationId: string): Promise<BankContextSnapshot> {
  const now = Date.now();
  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > now) return cached.snapshot;

  const snapshot = await buildBankContextSnapshot(organizationId);
  cache.set(organizationId, { snapshot, expiresAt: now + TTL_MS });

  // Evict stale entries if cache grows large
  if (cache.size > 100) {
    for (const [key, val] of cache) {
      if (val.expiresAt < now) cache.delete(key);
    }
  }

  return snapshot;
}

// ── Snapshot Builder ───────────────────────────────────────────────────────────

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function buildBankContextSnapshot(organizationId: string): Promise<BankContextSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const today = new Date().toISOString().split("T")[0];

  // Run all queries in parallel for minimum latency
  const [orgResult, customersResult, accountsResult, todayTxnsResult, largeTxnsResult] = await Promise.all([
    admin.from("organizations").select("name, settings").eq("id", organizationId).single(),
    admin.from("customers").select("id, kyc_status").eq("organization_id", organizationId),
    admin.from("accounts").select("id, account_type, balance, status").eq("organization_id", organizationId),
    admin.from("transactions").select("id, type, amount").eq("organization_id", organizationId).gte("created_at", today),
    admin.from("transactions").select("transaction_id, type, amount").eq("organization_id", organizationId).order("amount", { ascending: false }).limit(5),
  ]);

  const orgData = orgResult.data as Row | null;
  const customers = (customersResult.data || []) as Row[];
  const accounts = (accountsResult.data || []) as Row[];
  const todayTxns = (todayTxnsResult.data || []) as Row[];
  const largeTxns = (largeTxnsResult.data || []) as Row[];

  const totalBalance = accounts.reduce((sum: number, a: Row) => sum + Number(a.balance), 0);
  const todayVolume = todayTxns.reduce((sum: number, t: Row) => sum + Number(t.amount), 0);

  return {
    org: {
      name: orgData?.name || "Unknown",
      plan: orgData?.settings?.plan || "starter",
    },
    customers: {
      total: customers.length,
      byKycStatus: countBy(customers, (c) => c.kyc_status),
    },
    accounts: {
      total: accounts.length,
      byType: countBy(accounts, (a) => a.account_type),
      byStatus: countBy(accounts, (a) => a.status),
      totalBalance,
    },
    transactions: {
      todayCount: todayTxns.length,
      todayVolume,
      recentLarge: largeTxns.map((t: Row) => ({
        transaction_id: t.transaction_id,
        type: t.type,
        amount: Number(t.amount),
      })),
    },
    snapshotAt: new Date().toISOString(),
  };
}
