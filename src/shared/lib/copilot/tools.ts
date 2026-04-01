import Anthropic from "@anthropic-ai/sdk";

// ── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are the Banking Copilot, an AI assistant that serves as the PRIMARY interface for managing customer banking operations. Bank staff interact with you conversationally to handle customer onboarding, account management, and transactions.

## Your Core Mission
Make banking operations fast, accurate, and conversational. Reduce form-filling to natural dialogue while maintaining full audit trails for every operation.

## Interaction Principles

### 1. PROACTIVE INTELLIGENCE
- When a user describes a customer, automatically infer and suggest relevant details
- Don't ask for information you can reasonably infer or default
- Pre-populate fields with smart defaults, showing your reasoning

### 2. CONVERSATIONAL FIRST
- Guide users through natural dialogue, not form fields
- Summarize your understanding and let them correct if needed
- For transactions, always confirm the amount and account before executing

### 3. SAFETY-CONSCIOUS
- Always verify account status before processing transactions
- Flag unusual amounts or patterns proactively
- Confirm transfers with clear source and destination details

### 4. ACTION-ORIENTED
- When you have enough information, offer to take action
- When a write action is pending user approval, clearly describe what will happen
- Always show the financial impact (balance before/after) for transactions

## Capabilities
You can help bank staff with:
- Registering new customers (name, contact info, KYC status)
- Opening checking and savings accounts for customers
- Processing deposits into customer accounts
- Processing withdrawals from customer accounts
- Transferring funds between accounts
- Searching for customers, accounts, and transactions
- Checking account balances and transaction history
- Freezing/unfreezing accounts for security purposes
- Closing accounts (zero-balance required)
- Viewing dashboard metrics and daily summaries
- Generating test/demo data in bulk
- Analyzing uploaded files (CSV, JSON) containing transaction data, wire details, or other documents

## File Uploads
Users can attach CSV or JSON files to their messages. When a file is attached, its content appears in the message prefixed with "[Attached file: filename]". You should:
- Read and analyze the file content directly from the message
- Answer questions about the data (summaries, patterns, anomalies, totals)
- Help users understand the data, identify issues, or extract insights
- If the user asks to import/process transactions from the file, use the available tools to create them
- Treat the file content as data the user is sharing with you — do NOT say you cannot see it

## Response Format
- Be concise but thorough
- Use markdown formatting: **bold**, \`code\`, bullet lists
- When presenting financial data, always format currency with $ and two decimal places
- When showing account info, include the account number and type
- When presenting options, use numbered lists

## Suggested Actions
When you want to suggest follow-up actions the user can take, format each suggestion using this special syntax on its own line:
[suggest:the prompt to send when clicked]Button Label[/suggest]

These render as clickable buttons in the UI. Always include 2-4 suggestions at the end of your responses.

Example:
[suggest:Show all customers with pending KYC]View Pending KYC[/suggest]
[suggest:What's our total balance across all accounts?]Check Total Balance[/suggest]
[suggest:Show today's transactions]Today's Activity[/suggest]

## Context-Aware Behavior
You have real-time awareness of this organization's banking data via the Context below.
- Use this context to give personalized, specific responses without needing to query first
- Only use search/query tools when you need DETAILS beyond what the summary provides
- Proactively flag concerning patterns: frozen accounts, large transactions, pending KYC`;

// ── Tool Definitions ─────────────────────────────────────────────────────────

export const tools: Anthropic.Tool[] = [
  // ── READ TOOLS (auto-execute, no approval needed) ──────────────────────────

  {
    name: "search_customers",
    description:
      "Search for customers by name, email, or phone. Use when the user asks to find, list, or look up customers.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (name, email, or phone)" },
        kyc_status: {
          type: "string",
          enum: ["pending", "verified", "rejected"],
          description: "Filter by KYC status",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max results (default 10)",
        },
      },
    },
  },
  {
    name: "get_customer_details",
    description:
      "Get full customer profile including all their accounts. Use when you need detailed info about a specific customer.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Customer UUID or human-readable ID (e.g., CUST-ABC123)",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "search_accounts",
    description:
      "Search for bank accounts by account number, type, or status. Use when the user asks to find or list accounts.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by account number" },
        account_type: {
          type: "string",
          enum: ["checking", "savings"],
          description: "Filter by account type",
        },
        status: {
          type: "string",
          enum: ["active", "frozen", "closed"],
          description: "Filter by account status",
        },
        customer_id: {
          type: "string",
          description: "Filter by customer UUID",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max results (default 10)",
        },
      },
    },
  },
  {
    name: "get_account_balance",
    description:
      "Get the current balance for a specific account. Use when the user asks about an account balance.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: {
          type: "string",
          description: "Account UUID or human-readable ID (e.g., ACCT-ABC123)",
        },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_transaction_history",
    description:
      "Get transaction history for an account with optional filters. Use when the user asks about transactions, statements, or account activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: {
          type: "string",
          description: "Account UUID to get transactions for",
        },
        type: {
          type: "string",
          enum: ["deposit", "withdrawal", "transfer_out", "transfer_in"],
          description: "Filter by transaction type",
        },
        date_from: { type: "string", description: "Start date (ISO format)" },
        date_to: { type: "string", description: "End date (ISO format)" },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Max results (default 20)",
        },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_dashboard_stats",
    description:
      "Get summary dashboard statistics: total customers, accounts, balances, and today's transaction volume.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "search_transactions",
    description:
      "Search transactions across all accounts by reference code or description. Use when searching for a specific transaction.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search by reference or description" },
        type: {
          type: "string",
          enum: ["deposit", "withdrawal", "transfer_out", "transfer_in"],
          description: "Filter by type",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max results (default 10)",
        },
      },
    },
  },

  // ── WRITE TOOLS (queued for user approval) ─────────────────────────────────

  {
    name: "create_customer",
    description:
      "Register a new bank customer. Use when the user wants to onboard a new customer. Infer fields from their description. Always confirm details before creating.",
    input_schema: {
      type: "object" as const,
      properties: {
        first_name: { type: "string", description: "Customer's first name" },
        last_name: { type: "string", description: "Customer's last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip: { type: "string" },
            country: { type: "string" },
          },
          description: "Mailing address",
        },
      },
      required: ["first_name", "last_name"],
    },
  },
  {
    name: "open_account",
    description:
      "Open a new bank account (checking or savings) for an existing customer. Use when the user wants to create a new account.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: {
          type: "string",
          description: "Customer UUID to open the account for",
        },
        account_type: {
          type: "string",
          enum: ["checking", "savings"],
          description: "Type of account to open",
        },
        initial_deposit: {
          type: "number",
          minimum: 0,
          description: "Optional initial deposit amount",
        },
      },
      required: ["customer_id", "account_type"],
    },
  },
  {
    name: "deposit",
    description:
      "Deposit money into a bank account. Use when the user wants to add funds to an account.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: {
          type: "string",
          description: "Account UUID to deposit into",
        },
        amount: {
          type: "number",
          minimum: 0.01,
          description: "Amount to deposit (must be positive)",
        },
        description: {
          type: "string",
          description: "Transaction description/memo",
        },
      },
      required: ["account_id", "amount"],
    },
  },
  {
    name: "withdraw",
    description:
      "Withdraw money from a bank account. Use when the user wants to remove funds. Balance must be sufficient.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: {
          type: "string",
          description: "Account UUID to withdraw from",
        },
        amount: {
          type: "number",
          minimum: 0.01,
          description: "Amount to withdraw (must be positive, cannot exceed balance)",
        },
        description: {
          type: "string",
          description: "Transaction description/memo",
        },
      },
      required: ["account_id", "amount"],
    },
  },
  {
    name: "transfer",
    description:
      "Transfer money between two accounts. Use when the user wants to move funds. Source account must have sufficient balance.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_account_id: {
          type: "string",
          description: "Source account UUID (money leaves this account)",
        },
        to_account_id: {
          type: "string",
          description: "Destination account UUID (money enters this account)",
        },
        amount: {
          type: "number",
          minimum: 0.01,
          description: "Amount to transfer",
        },
        description: {
          type: "string",
          description: "Transfer description/memo",
        },
      },
      required: ["from_account_id", "to_account_id", "amount"],
    },
  },
  {
    name: "update_account_status",
    description:
      "Change an account's status: freeze (security hold), unfreeze (reactivate), or close (permanent, requires zero balance). Use when the user wants to change account status.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: {
          type: "string",
          description: "Account UUID to update",
        },
        status: {
          type: "string",
          enum: ["active", "frozen", "closed"],
          description: "New status: 'frozen' to freeze, 'active' to unfreeze, 'closed' to close permanently",
        },
        reason: {
          type: "string",
          description: "Reason for the status change (for audit trail)",
        },
      },
      required: ["account_id", "status"],
    },
  },
  {
    name: "seed_test_data",
    description:
      "Generate a batch of realistic sample data for testing and demo purposes. Creates multiple customers, accounts, and transactions in one operation. Use this when the user asks to populate test data, create sample data, generate demo data, or wants bulk data for testing. This is the ONLY efficient way to create bulk data.",
    input_schema: {
      type: "object" as const,
      properties: {
        customers: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Number of customers to create (default 5)",
        },
        accounts_per_customer: {
          type: "integer",
          minimum: 1,
          maximum: 3,
          description: "Accounts per customer (default 2: checking + savings)",
        },
        transactions_per_account: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Transactions per account (default 4)",
        },
      },
    },
  },
];

// ── Customer System Prompt ───────────────────────────────────────────────────

export const CUSTOMER_SYSTEM_PROMPT = `You are the Banking Assistant, a helpful AI for bank customers. You help customers manage their own accounts and transactions through natural conversation.

## Your Capabilities
- Check balances on your accounts
- View transaction history and statements
- Make deposits into your accounts
- Make withdrawals from your accounts
- Transfer funds between your own accounts
- Search your transactions by reference or description

## Important Restrictions
- You can ONLY access accounts belonging to the current customer
- You cannot create new customers or open new accounts
- You cannot freeze, unfreeze, or close accounts
- You cannot view other customers' data or org-wide statistics
- You cannot generate test data

## Response Format
- Be concise and friendly
- Use markdown: **bold**, \`code\`, bullet lists
- Format currency with $ and two decimal places
- Include account numbers when showing account info

## Suggested Actions
When you want to suggest follow-up actions, use this syntax on its own line:
[suggest:the prompt]Button Label[/suggest]

Include 2-3 suggestions at the end of your responses.

Example:
[suggest:What are my account balances?]Check Balances[/suggest]
[suggest:Show my recent transactions]Recent Activity[/suggest]
[suggest:Transfer $100 from checking to savings]Quick Transfer[/suggest]`;

// ── Tool Scope Helpers ──────────────────────────────────────────────────────

// Classify tools for the agentic loop
export const READ_TOOLS = [
  "search_customers",
  "get_customer_details",
  "search_accounts",
  "get_account_balance",
  "get_transaction_history",
  "get_dashboard_stats",
  "search_transactions",
];

export const WRITE_TOOLS = [
  "create_customer",
  "open_account",
  "deposit",
  "withdraw",
  "transfer",
  "update_account_status",
  "seed_test_data",
];

// Customer-scoped tool subsets
export const CUSTOMER_READ_TOOLS = [
  "search_accounts",
  "get_account_balance",
  "get_transaction_history",
  "search_transactions",
];

export const CUSTOMER_WRITE_TOOLS = [
  "deposit",
  "withdraw",
  "transfer",
];

/** Returns the tool definitions for a given scope */
export function getToolsForScope(scope: "admin" | "customer"): Anthropic.Tool[] {
  if (scope === "admin") return tools;
  const allowed = new Set([...CUSTOMER_READ_TOOLS, ...CUSTOMER_WRITE_TOOLS]);
  return tools.filter((t) => allowed.has(t.name));
}

// Entity labels for the agentic loop write-tool feedback messages
export const WRITE_TOOL_LABELS: Record<string, string> = {
  create_customer: "customer registration",
  open_account: "account opening",
  deposit: "deposit",
  withdraw: "withdrawal",
  transfer: "transfer",
  update_account_status: "account status update",
  seed_test_data: "test data generation",
};

// ── Read Tool Executor ───────────────────────────────────────────────────────

export async function executeReadTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  organizationId: string | null
): Promise<unknown> {
  if (!organizationId) return { error: "No organization found" };

  switch (name) {
    case "search_customers": {
      try {
        const limit = Number(input.limit) || 10;
        let query = admin
          .from("customers")
          .select("id, customer_id, first_name, last_name, email, phone, kyc_status, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.query) {
          query = query.or(
            `first_name.ilike.%${input.query}%,last_name.ilike.%${input.query}%,email.ilike.%${input.query}%,phone.ilike.%${input.query}%`
          );
        }
        if (input.kyc_status) query = query.eq("kyc_status", input.kyc_status);

        const { data } = await query;
        return { customers: data || [], count: (data || []).length };
      } catch {
        return { customers: [], message: "Search failed" };
      }
    }

    case "get_customer_details": {
      try {
        const id = String(input.customer_id);
        let query = admin
          .from("customers")
          .select("*")
          .eq("organization_id", organizationId);

        if (id.startsWith("CUST-")) {
          query = query.eq("customer_id", id);
        } else {
          query = query.eq("id", id);
        }

        const { data: customer } = await query.single();
        if (!customer) return { error: "Customer not found" };

        const { data: accounts } = await admin
          .from("accounts")
          .select("id, account_id, account_number, account_type, balance, currency, status, created_at")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false });

        return { customer, accounts: accounts || [] };
      } catch {
        return { error: "Failed to get customer details" };
      }
    }

    case "search_accounts": {
      try {
        const limit = Number(input.limit) || 10;
        let query = admin
          .from("accounts")
          .select("id, account_id, account_number, account_type, balance, currency, status, created_at, customers(first_name, last_name, customer_id)")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.query) query = query.ilike("account_number", `%${input.query}%`);
        if (input.account_type) query = query.eq("account_type", input.account_type);
        if (input.status) query = query.eq("status", input.status);
        if (input.customer_id) query = query.eq("customer_id", input.customer_id);

        const { data } = await query;
        return { accounts: data || [], count: (data || []).length };
      } catch {
        return { accounts: [], message: "Search failed" };
      }
    }

    case "get_account_balance": {
      try {
        const id = String(input.account_id);
        let query = admin
          .from("accounts")
          .select("id, account_id, account_number, account_type, balance, currency, status, customers(first_name, last_name)")
          .eq("organization_id", organizationId);

        if (id.startsWith("ACCT-")) {
          query = query.eq("account_id", id);
        } else {
          query = query.eq("id", id);
        }

        const { data } = await query.single();
        if (!data) return { error: "Account not found" };
        return { account: data };
      } catch {
        return { error: "Failed to get account balance" };
      }
    }

    case "get_transaction_history": {
      try {
        const limit = Number(input.limit) || 20;
        let query = admin
          .from("transactions")
          .select("id, transaction_id, type, amount, balance_before, balance_after, reference, description, status, created_at")
          .eq("account_id", input.account_id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.type) query = query.eq("type", input.type);
        if (input.date_from) query = query.gte("created_at", input.date_from);
        if (input.date_to) query = query.lte("created_at", input.date_to);

        const { data } = await query;
        return { transactions: data || [], count: (data || []).length };
      } catch {
        return { transactions: [], message: "Failed to get transaction history" };
      }
    }

    case "get_dashboard_stats": {
      try {
        const today = new Date().toISOString().split("T")[0];
        const [customersResult, accountsResult, todayTxnsResult] = await Promise.all([
          admin.from("customers").select("id, kyc_status").eq("organization_id", organizationId),
          admin.from("accounts").select("id, account_type, balance, status").eq("organization_id", organizationId),
          admin.from("transactions").select("id, type, amount").eq("organization_id", organizationId).gte("created_at", today),
        ]);

        const customers = customersResult.data || [];
        const accounts = accountsResult.data || [];
        const todayTxns = todayTxnsResult.data || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalBalance = accounts.reduce((sum: number, a: any) => sum + Number(a.balance), 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const todayVolume = todayTxns.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        return {
          customers: {
            total: customers.length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            verified: customers.filter((c: any) => c.kyc_status === "verified").length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pending: customers.filter((c: any) => c.kyc_status === "pending").length,
          },
          accounts: {
            total: accounts.length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            checking: accounts.filter((a: any) => a.account_type === "checking").length,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            savings: accounts.filter((a: any) => a.account_type === "savings").length,
            totalBalance,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            frozen: accounts.filter((a: any) => a.status === "frozen").length,
          },
          transactions: {
            todayCount: todayTxns.length,
            todayVolume,
          },
        };
      } catch {
        return { error: "Failed to get dashboard stats" };
      }
    }

    case "search_transactions": {
      try {
        const limit = Number(input.limit) || 10;
        let query = admin
          .from("transactions")
          .select("id, transaction_id, account_id, type, amount, reference, description, status, created_at, accounts(account_number)")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.query) {
          query = query.or(`reference.ilike.%${input.query}%,description.ilike.%${input.query}%`);
        }
        if (input.type) query = query.eq("type", input.type);

        const { data } = await query;
        return { transactions: data || [], count: (data || []).length };
      } catch {
        return { transactions: [], message: "Search failed" };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Customer-Scoped Read Tool Executor ──────────────────────────────────────

/**
 * Execute a read tool scoped to a specific customer's accounts only.
 * All queries add .eq("customer_id", customerId) to restrict results.
 */
export async function executeCustomerReadTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  organizationId: string | null,
  customerId: string
): Promise<unknown> {
  if (!organizationId) return { error: "No organization found" };
  if (!customerId) return { error: "No customer context" };

  switch (name) {
    case "search_accounts": {
      try {
        const limit = Number(input.limit) || 10;
        let query = admin
          .from("accounts")
          .select("id, account_id, account_number, account_type, balance, currency, status, created_at")
          .eq("organization_id", organizationId)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.query) query = query.ilike("account_number", `%${input.query}%`);
        if (input.account_type) query = query.eq("account_type", input.account_type);
        if (input.status) query = query.eq("status", input.status);

        const { data } = await query;
        return { accounts: data || [], count: (data || []).length };
      } catch {
        return { accounts: [], message: "Search failed" };
      }
    }

    case "get_account_balance": {
      try {
        const id = String(input.account_id);
        let query = admin
          .from("accounts")
          .select("id, account_id, account_number, account_type, balance, currency, status")
          .eq("organization_id", organizationId)
          .eq("customer_id", customerId);

        if (id.startsWith("ACCT-")) {
          query = query.eq("account_id", id);
        } else {
          query = query.eq("id", id);
        }

        const { data } = await query.single();
        if (!data) return { error: "Account not found" };
        return { account: data };
      } catch {
        return { error: "Failed to get account balance" };
      }
    }

    case "get_transaction_history": {
      try {
        // Verify the account belongs to this customer
        const { data: acct } = await admin
          .from("accounts")
          .select("id")
          .eq("id", input.account_id)
          .eq("customer_id", customerId)
          .eq("organization_id", organizationId)
          .single();
        if (!acct) return { error: "Account not found" };

        const limit = Number(input.limit) || 20;
        let query = admin
          .from("transactions")
          .select("id, transaction_id, type, amount, balance_before, balance_after, reference, description, status, created_at")
          .eq("account_id", input.account_id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.type) query = query.eq("type", input.type);
        if (input.date_from) query = query.gte("created_at", input.date_from);
        if (input.date_to) query = query.lte("created_at", input.date_to);

        const { data } = await query;
        return { transactions: data || [], count: (data || []).length };
      } catch {
        return { transactions: [], message: "Failed to get transaction history" };
      }
    }

    case "search_transactions": {
      try {
        // Get all account IDs for this customer
        const { data: customerAccounts } = await admin
          .from("accounts")
          .select("id")
          .eq("customer_id", customerId)
          .eq("organization_id", organizationId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accountIds = (customerAccounts || []).map((a: any) => a.id);
        if (accountIds.length === 0) return { transactions: [], count: 0 };

        const limit = Number(input.limit) || 10;
        let query = admin
          .from("transactions")
          .select("id, transaction_id, account_id, type, amount, reference, description, status, created_at, accounts(account_number)")
          .eq("organization_id", organizationId)
          .in("account_id", accountIds)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.query) {
          query = query.or(`reference.ilike.%${input.query}%,description.ilike.%${input.query}%`);
        }
        if (input.type) query = query.eq("type", input.type);

        const { data } = await query;
        return { transactions: data || [], count: (data || []).length };
      } catch {
        return { transactions: [], message: "Search failed" };
      }
    }

    default:
      return { error: `Unknown or unauthorized tool: ${name}` };
  }
}
