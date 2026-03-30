import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

interface UploadedTxn {
  transaction_id?: string;
  type: string;
  amount: number;
  description: string;
  created_at?: string;
  account_id?: string;
  counterparty_account_id?: string;
  balance_before?: number;
  balance_after?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

function genId(offset: number): string {
  return `TXN-UP${(Date.now() + offset).toString(36).toUpperCase()}`;
}

function parseCsv(text: string): UploadedTxn[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
  const rows: UploadedTxn[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted CSV fields
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ""; });

    rows.push({
      transaction_id: obj.transaction_id || undefined,
      type: obj.type || "withdrawal",
      amount: parseFloat(obj.amount) || 0,
      description: obj.description || "",
      created_at: obj.created_at || undefined,
      account_id: obj.account_id || undefined,
      counterparty_account_id: obj.counterparty_account_id || undefined,
      balance_before: obj.balance_before ? parseFloat(obj.balance_before) : undefined,
      balance_after: obj.balance_after ? parseFloat(obj.balance_after) : undefined,
      status: obj.status || undefined,
      metadata: obj.metadata ? tryParseJson(obj.metadata) : undefined,
    });
  }
  return rows;
}

function tryParseJson(s: string): Record<string, unknown> | undefined {
  try { return JSON.parse(s); } catch { return undefined; }
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization found" }, { status: 400 });

  const contentType = request.headers.get("content-type") || "";
  let uploaded: UploadedTxn[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const accountId = formData.get("account_id") as string | null;

    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

    const text = await file.text();
    const name = file.name.toLowerCase();

    if (name.endsWith(".json")) {
      const parsed = JSON.parse(text);
      uploaded = Array.isArray(parsed) ? parsed : (parsed.transactions || []);
    } else if (name.endsWith(".csv")) {
      uploaded = parseCsv(text);
    } else {
      return Response.json({ error: "Unsupported file type. Use .json or .csv" }, { status: 400 });
    }

    // Override account_id if provided
    if (accountId) {
      uploaded = uploaded.map(t => ({ ...t, account_id: t.account_id || accountId }));
    }
  } else {
    const body = await request.json();
    uploaded = Array.isArray(body) ? body : (body.transactions || []);
  }

  if (!uploaded || uploaded.length === 0) {
    return Response.json({ error: "No transactions found in upload" }, { status: 400 });
  }

  if (uploaded.length > 500) {
    return Response.json({ error: "Maximum 500 transactions per upload" }, { status: 400 });
  }

  // Get org accounts for validation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgAccounts } = await (admin as any)
    .from("accounts")
    .select("id, balance")
    .eq("organization_id", orgId);

  const validAccountIds = new Set((orgAccounts || []).map((a: { id: string }) => a.id));
  const accountBalances: Record<string, number> = {};
  for (const a of orgAccounts || []) {
    accountBalances[a.id] = Number(a.balance);
  }

  // If no account_id on transactions, use the first org account
  const defaultAccountId = orgAccounts?.[0]?.id;

  // Build records
  const records = [];
  const errors: string[] = [];

  for (let i = 0; i < uploaded.length; i++) {
    const t = uploaded[i];
    if (!t.amount || t.amount <= 0) {
      errors.push(`Row ${i + 1}: invalid amount`);
      continue;
    }
    if (!t.type) {
      errors.push(`Row ${i + 1}: missing type`);
      continue;
    }

    const acctId = t.account_id || defaultAccountId;
    if (!acctId || !validAccountIds.has(acctId)) {
      errors.push(`Row ${i + 1}: invalid or missing account_id "${t.account_id}"`);
      continue;
    }

    const currentBalance = accountBalances[acctId] || 0;
    const balanceBefore = t.balance_before ?? currentBalance;
    const isDebit = t.type !== "deposit" && t.type !== "transfer_in";
    const balanceAfter = t.balance_after ?? (isDebit ? balanceBefore - t.amount : balanceBefore + t.amount);

    // Update running balance
    accountBalances[acctId] = balanceAfter;

    records.push({
      organization_id: orgId,
      transaction_id: t.transaction_id || genId(i),
      account_id: acctId,
      type: t.type,
      amount: Math.round(t.amount * 100) / 100,
      balance_before: Math.round(balanceBefore * 100) / 100,
      balance_after: Math.round(balanceAfter * 100) / 100,
      counterparty_account_id: t.counterparty_account_id || null,
      reference: `REF-UP-${Date.now().toString(36).toUpperCase()}-${i}`,
      description: t.description || `Uploaded transaction #${i + 1}`,
      status: t.status || "completed",
      created_by: null,
      created_at: t.created_at || new Date().toISOString(),
      metadata: t.metadata || null,
    });
  }

  if (records.length === 0) {
    return Response.json({
      success: false,
      error: "No valid transactions to insert",
      validation_errors: errors,
    }, { status: 400 });
  }

  // Batch insert
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("transactions").insert(batch);
    if (error) {
      return Response.json({
        error: `Batch insert failed at row ${i}`,
        detail: error.message,
        inserted_so_far: i,
      }, { status: 500 });
    }
  }

  // Update account balances
  for (const [acctId, balance] of Object.entries(accountBalances)) {
    if (validAccountIds.has(acctId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("accounts")
        .update({ balance: Math.round(balance * 100) / 100 })
        .eq("id", acctId);
    }
  }

  return Response.json({
    success: true,
    message: `Uploaded ${records.length} transactions`,
    inserted: records.length,
    skipped: uploaded.length - records.length,
    validation_errors: errors.length > 0 ? errors : undefined,
    transaction_ids: records.map(r => r.transaction_id),
  });
}
