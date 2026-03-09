import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, createdBy, getOrganizationId } from "@/shared/lib/auth";
import { logAudit } from "@/shared/lib/audit";

function generateReference(): string {
  return `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ transactions: [] });

  const { searchParams } = new URL(request.url);
  const account_id = searchParams.get("account_id");
  const type = searchParams.get("type");
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from("transactions")
    .select("*, accounts(account_number, account_type)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (account_id) q = q.eq("account_id", account_id);
  if (type) q = q.eq("type", type);
  if (date_from) q = q.gte("created_at", date_from);
  if (date_to) q = q.lte("created_at", date_to);

  const { data, error } = await q;
  if (error) return Response.json({ transactions: [], error: error.message });

  return Response.json({ transactions: data || [] });
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const organizationId = await getOrganizationId(admin, user);
  if (!organizationId) return Response.json({ error: "No organization found" }, { status: 400 });

  const body = await request.json();
  const { account_id, type, amount, description, counterparty_account_id } = body;

  if (!account_id || !type || !amount) {
    return Response.json({ error: "account_id, type, and amount are required" }, { status: 400 });
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return Response.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  if (!["deposit", "withdrawal", "transfer_out"].includes(type)) {
    return Response.json({ error: "type must be 'deposit', 'withdrawal', or 'transfer_out'" }, { status: 400 });
  }

  // Fetch source account
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (admin as any)
    .from("accounts")
    .select("*")
    .eq("id", account_id)
    .eq("organization_id", organizationId)
    .single();

  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (account.status !== "active") return Response.json({ error: `Account is ${account.status}` }, { status: 400 });

  const currentBalance = Number(account.balance);
  const reference = generateReference();
  const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}`;

  if (type === "deposit") {
    const newBalance = currentBalance + numAmount;

    // Update balance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("accounts").update({ balance: newBalance }).eq("id", account_id);

    // Create transaction record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: txn, error } = await (admin as any)
      .from("transactions")
      .insert({
        organization_id: organizationId,
        transaction_id: transactionId,
        account_id,
        type: "deposit",
        amount: numAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        reference,
        description: description || "Deposit",
        status: "completed",
        created_by: createdBy(user),
      })
      .select()
      .single();

    if (error) return Response.json({ error: "Failed to create transaction", detail: error.message }, { status: 500 });

    void logAudit({
      organizationId,
      userId: user.id,
      action: "transaction.deposit",
      entityType: "transaction",
      entityId: txn.id,
      newValues: { transaction_id: transactionId, amount: numAmount, account_id, balance_after: newBalance },
    });

    return Response.json({ success: true, transaction: txn }, { status: 201 });
  }

  if (type === "withdrawal") {
    if (currentBalance < numAmount) {
      return Response.json({ error: "Insufficient balance", detail: `Available: $${currentBalance.toFixed(2)}, Requested: $${numAmount.toFixed(2)}` }, { status: 400 });
    }

    const newBalance = currentBalance - numAmount;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("accounts").update({ balance: newBalance }).eq("id", account_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: txn, error } = await (admin as any)
      .from("transactions")
      .insert({
        organization_id: organizationId,
        transaction_id: transactionId,
        account_id,
        type: "withdrawal",
        amount: numAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        reference,
        description: description || "Withdrawal",
        status: "completed",
        created_by: createdBy(user),
      })
      .select()
      .single();

    if (error) return Response.json({ error: "Failed to create transaction", detail: error.message }, { status: 500 });

    void logAudit({
      organizationId,
      userId: user.id,
      action: "transaction.withdrawal",
      entityType: "transaction",
      entityId: txn.id,
      newValues: { transaction_id: transactionId, amount: numAmount, account_id, balance_after: newBalance },
    });

    return Response.json({ success: true, transaction: txn }, { status: 201 });
  }

  if (type === "transfer_out") {
    if (!counterparty_account_id) {
      return Response.json({ error: "counterparty_account_id is required for transfers" }, { status: 400 });
    }

    if (currentBalance < numAmount) {
      return Response.json({ error: "Insufficient balance", detail: `Available: $${currentBalance.toFixed(2)}, Requested: $${numAmount.toFixed(2)}` }, { status: 400 });
    }

    // Fetch destination account
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: destAccount } = await (admin as any)
      .from("accounts")
      .select("*")
      .eq("id", counterparty_account_id)
      .eq("organization_id", organizationId)
      .single();

    if (!destAccount) return Response.json({ error: "Destination account not found" }, { status: 404 });
    if (destAccount.status !== "active") return Response.json({ error: `Destination account is ${destAccount.status}` }, { status: 400 });

    const fromNewBalance = currentBalance - numAmount;
    const toCurrentBalance = Number(destAccount.balance);
    const toNewBalance = toCurrentBalance + numAmount;
    const transferTxnId = `TXN-${(Date.now() + 1).toString(36).toUpperCase()}`;

    // Update both balances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("accounts").update({ balance: fromNewBalance }).eq("id", account_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("accounts").update({ balance: toNewBalance }).eq("id", counterparty_account_id);

    // Create two transaction records
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: txnOut, error: errOut } = await (admin as any)
      .from("transactions")
      .insert({
        organization_id: organizationId,
        transaction_id: transactionId,
        account_id,
        type: "transfer_out",
        amount: numAmount,
        balance_before: currentBalance,
        balance_after: fromNewBalance,
        counterparty_account_id,
        reference,
        description: description || `Transfer to ${destAccount.account_number}`,
        status: "completed",
        created_by: createdBy(user),
      })
      .select()
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: txnIn, error: errIn } = await (admin as any)
      .from("transactions")
      .insert({
        organization_id: organizationId,
        transaction_id: transferTxnId,
        account_id: counterparty_account_id,
        type: "transfer_in",
        amount: numAmount,
        balance_before: toCurrentBalance,
        balance_after: toNewBalance,
        counterparty_account_id: account_id,
        reference,
        description: description || `Transfer from ${account.account_number}`,
        status: "completed",
        created_by: createdBy(user),
      })
      .select()
      .single();

    if (errOut || errIn) {
      return Response.json({ error: "Failed to create transfer", detail: (errOut || errIn)?.message }, { status: 500 });
    }

    void logAudit({
      organizationId,
      userId: user.id,
      action: "transaction.transfer",
      entityType: "transaction",
      entityId: txnOut.id,
      newValues: { amount: numAmount, from: account_id, to: counterparty_account_id, reference },
    });

    return Response.json({ success: true, transfer_out: txnOut, transfer_in: txnIn }, { status: 201 });
  }

  return Response.json({ error: "Invalid transaction type" }, { status: 400 });
}
