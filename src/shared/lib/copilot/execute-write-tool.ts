import { logAudit } from "@/shared/lib/audit";
import { createdBy } from "@/shared/lib/auth";
import { invalidateBankContext } from "@/shared/lib/copilot/bank-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type User = any;

export interface WriteToolResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  message: string;
  error?: string;
  status?: number;
}

function generateReference(): string {
  return `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function bumpWriteCount(admin: Admin, organizationId: string) {
  try {
    const { data } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .single();
    const settings = data?.settings || {};
    await admin
      .from("organizations")
      .update({ settings: { ...settings, copilot_write_count: (settings.copilot_write_count || 0) + 1 } })
      .eq("id", organizationId);
  } catch {
    // Non-critical — don't block the response
  }
}

async function resolveCustomer(admin: Admin, id: string, organizationId: string) {
  const column = id.startsWith("CUST-") ? "customer_id" : "id";
  const { data } = await admin
    .from("customers")
    .select("id, first_name, last_name")
    .eq(column, id)
    .eq("organization_id", organizationId)
    .single();
  return data;
}

async function resolveAccount(admin: Admin, id: string, organizationId: string) {
  const column = id.startsWith("ACCT-") ? "account_id" : "id";
  const { data } = await admin
    .from("accounts")
    .select("*")
    .eq(column, id)
    .eq("organization_id", organizationId)
    .single();
  return data;
}

export async function executeWriteTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  admin: Admin,
  organizationId: string,
  user: User,
  toolCallId?: string,
): Promise<WriteToolResult> {
  switch (name) {
    case "create_customer": {
      const customerId = `CUST-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await admin
        .from("customers")
        .insert({
          organization_id: organizationId,
          customer_id: customerId,
          first_name: String(input.first_name),
          last_name: String(input.last_name),
          email: input.email ? String(input.email) : null,
          phone: input.phone ? String(input.phone) : null,
          address: input.address || {},
          kyc_status: "pending",
          created_by: createdBy(user),
        })
        .select()
        .single();

      if (error) return { success: false, message: "Failed to create customer", error: error.message, status: 500 };

      void logAudit({
        organizationId,
        userId: user.id,
        action: "customer.created",
        entityType: "customer",
        entityId: data.id,
        newValues: { customer_id: customerId, first_name: input.first_name, last_name: input.last_name },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      return {
        success: true,
        result: data,
        message: `Customer **${input.first_name} ${input.last_name}** registered successfully (${customerId}).`,
      };
    }

    case "open_account": {
      const accountId = `ACCT-${Date.now().toString(36).toUpperCase()}`;
      const accountNumber = Date.now().toString().slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, "0");

      const customer = await resolveCustomer(admin, String(input.customer_id), organizationId);
      if (!customer) return { success: false, message: "Customer not found", error: "Customer not found", status: 404 };

      const { data, error } = await admin
        .from("accounts")
        .insert({
          organization_id: organizationId,
          account_id: accountId,
          customer_id: customer.id,
          account_number: accountNumber,
          account_type: input.account_type,
          balance: 0,
          currency: "USD",
          status: "active",
          created_by: createdBy(user),
        })
        .select()
        .single();

      if (error) return { success: false, message: "Failed to open account", error: error.message, status: 500 };

      if (input.initial_deposit && Number(input.initial_deposit) > 0) {
        const depositAmount = Number(input.initial_deposit);
        const txnId = `TXN-${Date.now().toString(36).toUpperCase()}`;
        const reference = generateReference();

        await admin.from("accounts").update({ balance: depositAmount }).eq("id", data.id);

        await admin.from("transactions").insert({
          organization_id: organizationId,
          transaction_id: txnId,
          account_id: data.id,
          type: "deposit",
          amount: depositAmount,
          balance_before: 0,
          balance_after: depositAmount,
          reference,
          description: "Initial deposit",
          status: "completed",
          created_by: createdBy(user),
        });
      }

      void logAudit({
        organizationId,
        userId: user.id,
        action: "account.created",
        entityType: "account",
        entityId: data.id,
        newValues: { account_id: accountId, account_number: accountNumber, account_type: input.account_type, customer_id: input.customer_id },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      const depositMsg = input.initial_deposit ? ` with initial deposit of $${Number(input.initial_deposit).toFixed(2)}` : "";
      return {
        success: true,
        result: data,
        message: `${input.account_type.charAt(0).toUpperCase() + input.account_type.slice(1)} account **${accountNumber}** opened for ${customer.first_name} ${customer.last_name}${depositMsg}.`,
      };
    }

    case "deposit": {
      const amount = Number(input.amount);

      const account = await resolveAccount(admin, String(input.account_id), organizationId);
      if (!account) return { success: false, message: "Account not found", error: "Account not found", status: 404 };
      if (account.status !== "active") return { success: false, message: `Account is ${account.status}`, error: `Account is ${account.status}`, status: 400 };

      const currentBalance = Number(account.balance);
      const newBalance = currentBalance + amount;
      const txnId = `TXN-${Date.now().toString(36).toUpperCase()}`;
      const reference = generateReference();

      await admin.from("accounts").update({ balance: newBalance }).eq("id", account.id);

      const { data: txn, error } = await admin
        .from("transactions")
        .insert({
          organization_id: organizationId,
          transaction_id: txnId,
          account_id: account.id,
          type: "deposit",
          amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          reference,
          description: input.description || "Deposit",
          status: "completed",
          created_by: createdBy(user),
        })
        .select()
        .single();

      if (error) return { success: false, message: "Failed to process deposit", error: error.message, status: 500 };

      void logAudit({
        organizationId,
        userId: user.id,
        action: "transaction.deposit",
        entityType: "transaction",
        entityId: txn.id,
        newValues: { transaction_id: txnId, amount, account_id: account.id, balance_after: newBalance },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      return {
        success: true,
        result: txn,
        message: `Deposited **$${amount.toFixed(2)}** into account ${account.account_number}. New balance: **$${newBalance.toFixed(2)}**.`,
      };
    }

    case "withdraw": {
      const amount = Number(input.amount);

      const account = await resolveAccount(admin, String(input.account_id), organizationId);
      if (!account) return { success: false, message: "Account not found", error: "Account not found", status: 404 };
      if (account.status !== "active") return { success: false, message: `Account is ${account.status}`, error: `Account is ${account.status}`, status: 400 };

      const currentBalance = Number(account.balance);
      if (currentBalance < amount) {
        return { success: false, message: "Insufficient balance", error: `Available: $${currentBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`, status: 400 };
      }

      const newBalance = currentBalance - amount;
      const txnId = `TXN-${Date.now().toString(36).toUpperCase()}`;
      const reference = generateReference();

      await admin.from("accounts").update({ balance: newBalance }).eq("id", account.id);

      const { data: txn, error } = await admin
        .from("transactions")
        .insert({
          organization_id: organizationId,
          transaction_id: txnId,
          account_id: account.id,
          type: "withdrawal",
          amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          reference,
          description: input.description || "Withdrawal",
          status: "completed",
          created_by: createdBy(user),
        })
        .select()
        .single();

      if (error) return { success: false, message: "Failed to process withdrawal", error: error.message, status: 500 };

      void logAudit({
        organizationId,
        userId: user.id,
        action: "transaction.withdrawal",
        entityType: "transaction",
        entityId: txn.id,
        newValues: { transaction_id: txnId, amount, account_id: account.id, balance_after: newBalance },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      return {
        success: true,
        result: txn,
        message: `Withdrew **$${amount.toFixed(2)}** from account ${account.account_number}. New balance: **$${newBalance.toFixed(2)}**.`,
      };
    }

    case "transfer": {
      const amount = Number(input.amount);

      const fromAccount = await resolveAccount(admin, String(input.from_account_id), organizationId);
      if (!fromAccount) return { success: false, message: "Source account not found", error: "Source account not found", status: 404 };
      if (fromAccount.status !== "active") return { success: false, message: `Source account is ${fromAccount.status}`, error: `Source account is ${fromAccount.status}`, status: 400 };

      const fromBalance = Number(fromAccount.balance);
      if (fromBalance < amount) {
        return { success: false, message: "Insufficient balance", error: `Available: $${fromBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`, status: 400 };
      }

      const toAccount = await resolveAccount(admin, String(input.to_account_id), organizationId);
      if (!toAccount) return { success: false, message: "Destination account not found", error: "Destination account not found", status: 404 };
      if (toAccount.status !== "active") return { success: false, message: `Destination account is ${toAccount.status}`, error: `Destination account is ${toAccount.status}`, status: 400 };

      const fromNewBalance = fromBalance - amount;
      const toCurrentBalance = Number(toAccount.balance);
      const toNewBalance = toCurrentBalance + amount;
      const reference = generateReference();
      const txnOutId = `TXN-${Date.now().toString(36).toUpperCase()}`;
      const txnInId = `TXN-${(Date.now() + 1).toString(36).toUpperCase()}`;

      await admin.from("accounts").update({ balance: fromNewBalance }).eq("id", fromAccount.id);
      await admin.from("accounts").update({ balance: toNewBalance }).eq("id", toAccount.id);

      const { data: txnOut, error: errOut } = await admin
        .from("transactions")
        .insert({
          organization_id: organizationId,
          transaction_id: txnOutId,
          account_id: fromAccount.id,
          type: "transfer_out",
          amount,
          balance_before: fromBalance,
          balance_after: fromNewBalance,
          counterparty_account_id: toAccount.id,
          reference,
          description: input.description || `Transfer to ${toAccount.account_number}`,
          status: "completed",
          created_by: createdBy(user),
        })
        .select()
        .single();

      const { error: errIn } = await admin
        .from("transactions")
        .insert({
          organization_id: organizationId,
          transaction_id: txnInId,
          account_id: toAccount.id,
          type: "transfer_in",
          amount,
          balance_before: toCurrentBalance,
          balance_after: toNewBalance,
          counterparty_account_id: fromAccount.id,
          reference,
          description: input.description || `Transfer from ${fromAccount.account_number}`,
          status: "completed",
          created_by: createdBy(user),
        })
        .select()
        .single();

      if (errOut || errIn) {
        return { success: false, message: "Failed to process transfer", error: (errOut || errIn)?.message, status: 500 };
      }

      void logAudit({
        organizationId,
        userId: user.id,
        action: "transaction.transfer",
        entityType: "transaction",
        entityId: txnOut.id,
        newValues: { amount, from: fromAccount.id, to: toAccount.id, reference },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      return {
        success: true,
        result: txnOut,
        message: `Transferred **$${amount.toFixed(2)}** from account ${fromAccount.account_number} to ${toAccount.account_number}. Source balance: **$${fromNewBalance.toFixed(2)}**, Destination balance: **$${toNewBalance.toFixed(2)}**.`,
      };
    }

    case "update_account_status": {
      const account = await resolveAccount(admin, String(input.account_id), organizationId);
      if (!account) return { success: false, message: "Account not found", error: "Account not found", status: 404 };

      if (input.status === "closed" && Number(account.balance) !== 0) {
        return { success: false, message: "Cannot close account with non-zero balance", error: "Cannot close account with non-zero balance", status: 400 };
      }
      if (account.status === "closed") {
        return { success: false, message: "Cannot modify a closed account", error: "Cannot modify a closed account", status: 400 };
      }

      const { data, error } = await admin
        .from("accounts")
        .update({ status: input.status })
        .eq("id", account.id)
        .select()
        .single();

      if (error) return { success: false, message: "Failed to update account status", error: error.message, status: 500 };

      const actionLabel = input.status === "frozen" ? "frozen" : input.status === "active" ? "unfrozen" : "closed";

      void logAudit({
        organizationId,
        userId: user.id,
        action: `account.${actionLabel}`,
        entityType: "account",
        entityId: account.id,
        oldValues: { status: account.status },
        newValues: { status: input.status, reason: input.reason },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      return {
        success: true,
        result: data,
        message: `Account ${account.account_number} has been **${actionLabel}**${input.reason ? ` — Reason: ${input.reason}` : ""}.`,
      };
    }

    case "seed_test_data": {
      const numCustomers = Number(input.customers) || 5;
      const accountsPerCust = Math.min(Number(input.accounts_per_customer) || 2, 2);
      const txnsPerAcct = Number(input.transactions_per_account) || 4;

      const firstNames = ["Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry", "Iris", "James"];
      const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
      const cities = ["Springfield", "Portland", "Austin", "Denver", "Miami"];
      const txnDescriptions = [
        "Payroll deposit", "Grocery shopping", "Utility bill", "Online purchase",
        "ATM withdrawal", "Restaurant", "Gas station", "Rent payment",
        "Freelance payment", "Insurance premium",
      ];
      const accountTypes = ["checking", "savings"];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdCustomers: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdAccounts: any[] = [];
      let totalTxns = 0;

      for (let ci = 0; ci < numCustomers; ci++) {
        const customerId = `CUST-${(Date.now() + ci).toString(36).toUpperCase()}`;
        const firstName = firstNames[ci % firstNames.length];
        const lastName = lastNames[ci % lastNames.length];

        const { data: cust, error: custErr } = await admin
          .from("customers")
          .insert({
            organization_id: organizationId,
            customer_id: customerId,
            first_name: firstName,
            last_name: lastName,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
            phone: `+1555${String(100 + ci).padStart(4, "0")}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
            address: { street: `${100 + ci * 10} Main St`, city: cities[ci % cities.length], state: "TX", zip: "78701", country: "US" },
            kyc_status: ci % 4 === 0 ? "pending" : "verified",
            created_by: createdBy(user),
          })
          .select()
          .single();

        if (custErr) continue;
        createdCustomers.push(cust);

        for (let ai = 0; ai < accountsPerCust && ai < accountTypes.length; ai++) {
          const accountId = `ACCT-${(Date.now() + ci * 10 + ai).toString(36).toUpperCase()}`;
          const accountNumber = String(Date.now() + ci * 10 + ai).slice(-8) + String(Math.floor(Math.random() * 100)).padStart(2, "0");

          const { data: acct, error: acctErr } = await admin
            .from("accounts")
            .insert({
              organization_id: organizationId,
              account_id: accountId,
              customer_id: cust.id,
              account_number: accountNumber,
              account_type: accountTypes[ai],
              balance: 0,
              currency: "USD",
              status: "active",
              created_by: createdBy(user),
            })
            .select()
            .single();

          if (acctErr) continue;
          createdAccounts.push(acct);

          let runningBalance = 0;
          for (let ti = 0; ti < txnsPerAcct; ti++) {
            const amount = Math.round((Math.random() * 900 + 100) * 100) / 100;
            const isDeposit = ti === 0 || runningBalance < amount || Math.random() > 0.4;

            const txnType = isDeposit ? "deposit" : "withdrawal";
            const balanceBefore = runningBalance;
            const balanceAfter = txnType === "deposit" ? runningBalance + amount : runningBalance - amount;
            runningBalance = balanceAfter;

            const txnId = `TXN-${(Date.now() + ci * 100 + ai * 10 + ti).toString(36).toUpperCase()}`;
            const reference = `REF-${(Date.now() + ti).toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

            await admin.from("transactions").insert({
              organization_id: organizationId,
              transaction_id: txnId,
              account_id: acct.id,
              type: txnType,
              amount,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              reference,
              description: txnDescriptions[(ci + ai + ti) % txnDescriptions.length],
              status: "completed",
              created_by: createdBy(user),
            });

            totalTxns++;
          }

          await admin.from("accounts").update({ balance: runningBalance }).eq("id", acct.id);
        }
      }

      void logAudit({
        organizationId,
        userId: user.id,
        action: "data.seeded",
        entityType: "seed",
        entityId: "batch",
        newValues: { customers: createdCustomers.length, accounts: createdAccounts.length, transactions: totalTxns },
      });

      invalidateBankContext(organizationId);
      await bumpWriteCount(admin, organizationId);

      return {
        success: true,
        result: { customers_created: createdCustomers.length, accounts_created: createdAccounts.length, transactions_created: totalTxns },
        message: `Test data created: **${createdCustomers.length}** customers, **${createdAccounts.length}** accounts, **${totalTxns}** transactions.`,
      };
    }

    default:
      return { success: false, message: `Unknown action: ${name}`, error: `Unknown action: ${name}`, status: 400 };
  }
}

// ── Customer-Scoped Write Executor ──────────────────────────────────────────

const CUSTOMER_ALLOWED_WRITES = ["deposit", "withdraw", "transfer"];

async function resolveAccountForCustomer(admin: Admin, id: string, organizationId: string, customerId: string) {
  const column = id.startsWith("ACCT-") ? "account_id" : "id";
  const { data } = await admin
    .from("accounts")
    .select("*")
    .eq(column, id)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .single();
  return data;
}

/**
 * Execute a write tool scoped to a specific customer.
 * Only deposit, withdraw, and transfer are allowed.
 * All account lookups verify ownership by the given customerId.
 */
export async function executeCustomerWriteTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  admin: Admin,
  organizationId: string,
  user: User,
  customerId: string,
  toolCallId?: string,
): Promise<WriteToolResult> {
  if (!CUSTOMER_ALLOWED_WRITES.includes(name)) {
    return { success: false, message: `Action "${name}" is not available in the customer portal`, status: 403 };
  }

  // Verify account ownership before delegating
  if (name === "deposit" || name === "withdraw") {
    const account = await resolveAccountForCustomer(admin, String(input.account_id), organizationId, customerId);
    if (!account) {
      return { success: false, message: "Account not found or does not belong to you", status: 403 };
    }
  }

  if (name === "transfer") {
    const fromAccount = await resolveAccountForCustomer(admin, String(input.from_account_id), organizationId, customerId);
    const toAccount = await resolveAccountForCustomer(admin, String(input.to_account_id), organizationId, customerId);
    if (!fromAccount || !toAccount) {
      return { success: false, message: "One or both accounts not found or do not belong to you", status: 403 };
    }
  }

  // Delegate to existing executor (which handles the actual logic)
  return executeWriteTool(name, input, admin, organizationId, user, toolCallId);
}
