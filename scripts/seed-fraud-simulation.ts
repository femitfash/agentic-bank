/**
 * Seed script: generates 2 months of backdated transactions for fraud detection simulation.
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-fraud-simulation.ts [--force]
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);
const FORCE = process.argv.includes("--force");

const TARGET_EMAIL = "fashoks33@gmail.com";
const DEV_ORG_SLUG = "org-00000000";
const CHECKING_START_BALANCE = 85000;
const SAVINGS_START_BALANCE = 32000;

// Date range: 2 months back from today
const END_DATE = new Date("2026-03-23T23:59:59Z");
const START_DATE = new Date("2026-01-23T00:00:00Z");

interface TxnRecord {
  organization_id: string;
  transaction_id: string;
  account_id: string;
  type: "deposit" | "withdrawal" | "transfer_out" | "transfer_in";
  amount: number;
  balance_before: number;
  balance_after: number;
  counterparty_account_id: string | null;
  reference: string;
  description: string;
  status: string;
  created_by: null;
  created_at: string;
}

// --- Helpers ---

function genId(prefix: string, offset: number): string {
  return `${prefix}-${(Date.now() + offset).toString(36).toUpperCase()}`;
}

function genAccountNumber(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return ts + rand;
}

function genReference(): string {
  return `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setUTCHours(hours, minutes, randomInt(0, 59), 0);
  return d;
}

// --- Data generation ---

interface RawTxn {
  type: "deposit" | "withdrawal" | "transfer_out" | "transfer_in";
  amount: number;
  description: string;
  created_at: Date;
  target_account: "checking" | "savings";
  counterparty_account?: "checking" | "savings";
  _is_fraud: boolean;
}

function generateNormalTransactions(): RawTxn[] {
  const txns: RawTxn[] = [];
  const groceryStores = ["Whole Foods", "Trader Joes", "Kroger", "Safeway", "Aldi", "Costco"];
  const restaurants = ["Chipotle", "Starbucks", "Panera Bread", "Chick-fil-A", "Olive Garden", "Dominos Pizza"];
  const gasStations = ["Shell", "BP", "Exxon", "Chevron", "Mobil"];
  const atmIds = ["Chase ATM #4521", "BOA ATM #1187", "Wells Fargo ATM #3392"];
  const utilities = [
    { name: "ConEd Electric", amount: [80, 160] as [number, number] },
    { name: "Verizon Wireless", amount: [95, 115] as [number, number] },
    { name: "Spectrum Internet", amount: [69.99, 69.99] as [number, number] },
  ];
  const subscriptions = [
    { name: "Netflix", amount: 15.99 },
    { name: "Spotify Premium", amount: 10.99 },
    { name: "Apple iCloud+", amount: 2.99 },
    { name: "Amazon Prime", amount: 14.99 },
  ];

  // Iterate day by day over the 2-month period
  let current = new Date(START_DATE);
  while (current <= END_DATE) {
    const dayOfMonth = current.getUTCDate();
    const dayOfWeek = current.getUTCDay(); // 0=Sun, 6=Sat

    // Payroll: 1st and 15th of each month
    if (dayOfMonth === 1 || dayOfMonth === 15) {
      txns.push({
        type: "deposit",
        amount: randomBetween(2800, 3200),
        description: "Direct Deposit - Payroll - TechCorp Inc",
        created_at: setTime(current, 8, 0),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // Rent: 1st of each month
    if (dayOfMonth === 1) {
      txns.push({
        type: "withdrawal",
        amount: 1450,
        description: "Rent Payment - Oakwood Apartments",
        created_at: setTime(current, 9, 30),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // Utilities: around 10th-15th of each month
    if (dayOfMonth >= 10 && dayOfMonth <= 12) {
      const utilIndex = (current.getUTCMonth() + dayOfMonth) % utilities.length;
      const util = utilities[utilIndex];
      txns.push({
        type: "withdrawal",
        amount: randomBetween(util.amount[0], util.amount[1]),
        description: `Utility Payment - ${util.name}`,
        created_at: setTime(current, randomInt(9, 17), randomInt(0, 59)),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // Subscriptions: various days each month
    if (dayOfMonth === 5) {
      for (const sub of subscriptions) {
        txns.push({
          type: "withdrawal",
          amount: sub.amount,
          description: `Recurring - ${sub.name}`,
          created_at: setTime(current, randomInt(0, 6), randomInt(0, 59)),
          target_account: "checking",
          _is_fraud: false,
        });
      }
    }

    // Groceries: 2-3 times per week (Tue, Thu, Sat)
    if ([2, 4, 6].includes(dayOfWeek)) {
      txns.push({
        type: "withdrawal",
        amount: randomBetween(25, 120),
        description: `POS Purchase - ${randomItem(groceryStores)}`,
        created_at: setTime(current, randomInt(10, 19), randomInt(0, 59)),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // Dining: 2-3 times per week (Mon, Wed, Fri)
    if ([1, 3, 5].includes(dayOfWeek)) {
      txns.push({
        type: "withdrawal",
        amount: randomBetween(12, 55),
        description: `POS Purchase - ${randomItem(restaurants)}`,
        created_at: setTime(current, randomInt(11, 21), randomInt(0, 59)),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // Gas: once per week (Saturday)
    if (dayOfWeek === 6) {
      txns.push({
        type: "withdrawal",
        amount: randomBetween(35, 65),
        description: `POS Purchase - ${randomItem(gasStations)}`,
        created_at: setTime(current, randomInt(8, 16), randomInt(0, 59)),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // ATM withdrawals: 1-2 per week (Wed and sometimes Fri)
    if (dayOfWeek === 3) {
      txns.push({
        type: "withdrawal",
        amount: Math.round(randomBetween(2, 10)) * 20, // multiples of $20
        description: `ATM Withdrawal - ${randomItem(atmIds)}`,
        created_at: setTime(current, randomInt(9, 20), randomInt(0, 59)),
        target_account: "checking",
        _is_fraud: false,
      });
    }
    if (dayOfWeek === 5 && Math.random() > 0.5) {
      txns.push({
        type: "withdrawal",
        amount: Math.round(randomBetween(2, 8)) * 20,
        description: `ATM Withdrawal - ${randomItem(atmIds)}`,
        created_at: setTime(current, randomInt(12, 20), randomInt(0, 59)),
        target_account: "checking",
        _is_fraud: false,
      });
    }

    // Monthly savings transfer: 20th of each month
    if (dayOfMonth === 20) {
      const transferAmount = randomBetween(200, 500);
      txns.push({
        type: "transfer_out",
        amount: transferAmount,
        description: "Monthly Transfer to Savings",
        created_at: setTime(current, 10, 0),
        target_account: "checking",
        counterparty_account: "savings",
        _is_fraud: false,
      });
    }

    current = addDays(current, 1);
  }

  return txns;
}

function generateFraudulentTransactions(): RawTxn[] {
  const txns: RawTxn[] = [];

  // 1. Large unusual withdrawals (2-3)
  const largeWithdrawalDates = [
    new Date("2026-02-07T00:00:00Z"),
    new Date("2026-02-22T00:00:00Z"),
    new Date("2026-03-11T00:00:00Z"),
  ];
  for (const d of largeWithdrawalDates) {
    txns.push({
      type: "withdrawal",
      amount: randomBetween(4000, 9500),
      description: "Counter Withdrawal - Branch #9912",
      created_at: setTime(d, randomInt(10, 16), randomInt(0, 59)),
      target_account: "checking",
      _is_fraud: true,
    });
  }

  // 2. Rapid successive ATM withdrawals (5 within 30 minutes)
  const rapidDate = new Date("2026-02-14T00:00:00Z");
  for (let i = 0; i < 5; i++) {
    txns.push({
      type: "withdrawal",
      amount: 400,
      description: `ATM Withdrawal - Unknown ATM #${8800 + i}`,
      created_at: setTime(rapidDate, 23, 10 + i * 6), // 6 min apart
      target_account: "checking",
      _is_fraud: true,
    });
  }

  // 3. Round-number large transfers
  const transferDates = [
    { date: new Date("2026-01-30T00:00:00Z"), amount: 5000 },
    { date: new Date("2026-02-18T00:00:00Z"), amount: 10000 },
    { date: new Date("2026-03-08T00:00:00Z"), amount: 15000 },
  ];
  for (const t of transferDates) {
    txns.push({
      type: "withdrawal",
      amount: t.amount,
      description: "Wire Transfer - Offshore Holdings Ltd - Cayman Islands",
      created_at: setTime(t.date, randomInt(14, 17), randomInt(0, 59)),
      target_account: "checking",
      _is_fraud: true,
    });
  }

  // 4. Odd-hour transactions (2:00-4:30 AM)
  const oddHourDates = [
    new Date("2026-02-03T00:00:00Z"),
    new Date("2026-02-20T00:00:00Z"),
    new Date("2026-03-05T00:00:00Z"),
    new Date("2026-03-17T00:00:00Z"),
  ];
  for (const d of oddHourDates) {
    txns.push({
      type: "withdrawal",
      amount: randomBetween(500, 2500),
      description: `Online Purchase - ElectroMart - ${randomItem(["Dubai, UAE", "Moscow, Russia", "Shenzhen, China"])}`,
      created_at: setTime(d, randomInt(2, 4), randomInt(0, 30)),
      target_account: "checking",
      _is_fraud: true,
    });
  }

  // 5. Geographic anomaly transactions
  txns.push({
    type: "withdrawal",
    amount: randomBetween(800, 3500),
    description: "POS Purchase - Electronics Mega Store - Lagos, Nigeria",
    created_at: setTime(new Date("2026-02-11T00:00:00Z"), 15, 22),
    target_account: "checking",
    _is_fraud: true,
  });
  txns.push({
    type: "withdrawal",
    amount: randomBetween(1200, 4000),
    description: "POS Purchase - Luxury Goods - Bangkok, Thailand",
    created_at: setTime(new Date("2026-03-02T00:00:00Z"), 13, 45),
    target_account: "checking",
    _is_fraud: true,
  });

  // 6. Suspicious counterparties
  txns.push({
    type: "withdrawal",
    amount: randomBetween(2000, 8000),
    description: "Wire Transfer - CryptoMix Exchange",
    created_at: setTime(new Date("2026-02-25T00:00:00Z"), 22, 15),
    target_account: "checking",
    _is_fraud: true,
  });
  txns.push({
    type: "withdrawal",
    amount: randomBetween(3000, 7000),
    description: "Payment - Anonymous Holding LLC",
    created_at: setTime(new Date("2026-03-14T00:00:00Z"), 21, 40),
    target_account: "checking",
    _is_fraud: true,
  });

  // 7. Velocity spike: 8 small purchases in 2 hours
  const spikeDate = new Date("2026-03-19T00:00:00Z");
  const spikeMerchants = [
    "Gift Card Kiosk A", "Gift Card Kiosk B", "Online Prepaid #1",
    "Online Prepaid #2", "Digital Wallet Load", "Prepaid Card Store",
    "Gift Card Exchange", "Virtual Card Service",
  ];
  for (let i = 0; i < 8; i++) {
    txns.push({
      type: "withdrawal",
      amount: randomBetween(15, 30),
      description: `POS Purchase - ${spikeMerchants[i]}`,
      created_at: setTime(spikeDate, 14, i * 15), // every 15 min over 2 hours
      target_account: "checking",
      _is_fraud: true,
    });
  }

  return txns;
}

// --- DB operations ---

async function findOrCreateOrg(): Promise<string> {
  const { data } = await (admin as any).from("organizations").select("id").eq("slug", DEV_ORG_SLUG).single();
  if (data) return data.id;

  const { data: created, error } = await (admin as any)
    .from("organizations")
    .insert({ name: "Dev Organization", slug: DEV_ORG_SLUG, settings: {} })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create org: ${error.message}`);
  console.log("Created organization:", created.id);
  return created.id;
}

async function findOrCreateCustomer(orgId: string): Promise<{ id: string; customer_id: string }> {
  const { data } = await (admin as any)
    .from("customers")
    .select("id, customer_id")
    .eq("organization_id", orgId)
    .eq("email", TARGET_EMAIL)
    .single();
  if (data) return data;

  const customerId = `CUST-${Date.now().toString(36).toUpperCase()}`;
  const { data: created, error } = await (admin as any)
    .from("customers")
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      first_name: "Fashola",
      last_name: "Komolafe",
      email: TARGET_EMAIL,
      phone: "+1-555-0142",
      address: { street: "742 Evergreen Terrace", city: "New York", state: "NY", zip: "10001" },
      kyc_status: "verified",
      created_by: null,
    })
    .select("id, customer_id")
    .single();
  if (error) throw new Error(`Failed to create customer: ${error.message}`);
  console.log("Created customer:", created.customer_id);
  return created;
}

async function findOrCreateAccounts(
  orgId: string,
  customerId: string
): Promise<{ checking: { id: string; account_id: string }; savings: { id: string; account_id: string } }> {
  const { data: existing } = await (admin as any)
    .from("accounts")
    .select("id, account_id, account_type")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId);

  let checking = existing?.find((a: any) => a.account_type === "checking");
  let savings = existing?.find((a: any) => a.account_type === "savings");

  if (!checking) {
    const { data, error } = await (admin as any)
      .from("accounts")
      .insert({
        organization_id: orgId,
        account_id: genId("ACCT", 0),
        customer_id: customerId,
        account_number: genAccountNumber(),
        account_type: "checking",
        balance: CHECKING_START_BALANCE,
        currency: "USD",
        status: "active",
        created_by: null,
      })
      .select("id, account_id")
      .single();
    if (error) throw new Error(`Failed to create checking account: ${error.message}`);
    checking = data;
    console.log("Created checking account:", data.account_id);
  }

  if (!savings) {
    const { data, error } = await (admin as any)
      .from("accounts")
      .insert({
        organization_id: orgId,
        account_id: genId("ACCT", 1),
        customer_id: customerId,
        account_number: genAccountNumber(),
        account_type: "savings",
        balance: SAVINGS_START_BALANCE,
        currency: "USD",
        status: "active",
        created_by: null,
      })
      .select("id, account_id")
      .single();
    if (error) throw new Error(`Failed to create savings account: ${error.message}`);
    savings = data;
    console.log("Created savings account:", data.account_id);
  }

  return { checking, savings };
}

async function main() {
  console.log("=== Fraud Simulation Seed Script ===\n");

  const orgId = await findOrCreateOrg();
  console.log("Organization ID:", orgId);

  const customer = await findOrCreateCustomer(orgId);
  console.log("Customer ID:", customer.customer_id, "(uuid:", customer.id, ")");

  const accounts = await findOrCreateAccounts(orgId, customer.id);
  console.log("Checking:", accounts.checking.account_id);
  console.log("Savings:", accounts.savings.account_id);

  // Check idempotency
  if (!FORCE) {
    const { count } = await (admin as any)
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("account_id", [accounts.checking.id, accounts.savings.id]);
    if (count && count > 50) {
      console.log(`\nSkipping: ${count} transactions already exist for these accounts.`);
      console.log("Use --force to override.");
      return;
    }
  }

  // Generate transactions
  const normalTxns = generateNormalTransactions();
  const fraudTxns = generateFraudulentTransactions();
  const allRaw = [...normalTxns, ...fraudTxns].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime()
  );

  console.log(`\nGenerated ${normalTxns.length} normal + ${fraudTxns.length} fraudulent = ${allRaw.length} total transactions`);

  // Convert to DB records with running balances
  const balances: Record<string, number> = {
    checking: CHECKING_START_BALANCE,
    savings: SAVINGS_START_BALANCE,
  };
  const accountIdMap = {
    checking: accounts.checking.id,
    savings: accounts.savings.id,
  };

  let idOffset = 0;
  const records: TxnRecord[] = [];

  for (const raw of allRaw) {
    const accountKey = raw.target_account;
    const accountId = accountIdMap[accountKey];
    const balanceBefore = balances[accountKey];

    let balanceAfter: number;
    if (raw.type === "deposit") {
      balanceAfter = balanceBefore + raw.amount;
    } else if (raw.type === "transfer_out") {
      balanceAfter = balanceBefore - raw.amount;
    } else {
      // withdrawal
      // If balance would go negative, reduce amount to what's available (min $5)
      const effectiveAmount = Math.min(raw.amount, Math.max(balanceBefore - 5, 0));
      if (effectiveAmount <= 0) continue; // skip if no funds
      raw.amount = effectiveAmount;
      balanceAfter = balanceBefore - raw.amount;
    }

    balances[accountKey] = Math.round(balanceAfter * 100) / 100;

    const record: TxnRecord = {
      organization_id: orgId,
      transaction_id: genId("TXN", idOffset++),
      account_id: accountId,
      type: raw.type,
      amount: raw.amount,
      balance_before: Math.round(balanceBefore * 100) / 100,
      balance_after: Math.round(balanceAfter * 100) / 100,
      counterparty_account_id: raw.counterparty_account
        ? accountIdMap[raw.counterparty_account]
        : null,
      reference: genReference(),
      description: raw.description,
      status: "completed",
      created_by: null,
      created_at: raw.created_at.toISOString(),
    };
    records.push(record);

    // For transfer_out, also create the transfer_in on the counterparty
    if (raw.type === "transfer_out" && raw.counterparty_account) {
      const cpKey = raw.counterparty_account;
      const cpBalanceBefore = balances[cpKey];
      const cpBalanceAfter = cpBalanceBefore + raw.amount;
      balances[cpKey] = Math.round(cpBalanceAfter * 100) / 100;

      records.push({
        organization_id: orgId,
        transaction_id: genId("TXN", idOffset++),
        account_id: accountIdMap[cpKey],
        type: "transfer_in",
        amount: raw.amount,
        balance_before: Math.round(cpBalanceBefore * 100) / 100,
        balance_after: Math.round(cpBalanceAfter * 100) / 100,
        counterparty_account_id: accountId,
        reference: record.reference,
        description: `Transfer from Checking`,
        status: "completed",
        created_by: null,
        created_at: raw.created_at.toISOString(),
      });
    }
  }

  console.log(`Inserting ${records.length} transaction records...`);

  // Insert in batches of 50
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await (admin as any).from("transactions").insert(batch);
    if (error) {
      console.error(`Batch insert failed at offset ${i}:`, error.message);
      throw error;
    }
    process.stdout.write(`  Inserted ${Math.min(i + 50, records.length)}/${records.length}\r`);
  }
  console.log();

  // Update final account balances
  await (admin as any)
    .from("accounts")
    .update({ balance: Math.round(balances.checking * 100) / 100 })
    .eq("id", accounts.checking.id);
  await (admin as any)
    .from("accounts")
    .update({ balance: Math.round(balances.savings * 100) / 100 })
    .eq("id", accounts.savings.id);

  console.log("\nFinal balances:");
  console.log(`  Checking: $${balances.checking.toFixed(2)}`);
  console.log(`  Savings:  $${balances.savings.toFixed(2)}`);

  // Output anonymized user ID for convenience
  const crypto = await import("crypto");
  const salt = process.env.FRAUD_ANON_SALT || "agentic-bank-anon-salt";
  const anonId = crypto.createHash("sha256").update(customer.id + salt).digest("hex").slice(0, 16);
  console.log(`\nAnonymized user_id for API calls: ${anonId}`);

  const fraudCount = records.filter((_, i) => {
    const rawIdx = allRaw.findIndex(r => r.created_at.toISOString() === records[i]?.created_at);
    return rawIdx >= 0 && allRaw[rawIdx]._is_fraud;
  });

  console.log(`\n✓ Seed complete. ${records.length} transactions (${fraudTxns.length} fraudulent patterns) inserted.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
