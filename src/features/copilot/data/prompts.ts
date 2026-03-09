export interface CopilotPrompt {
  id: string;
  category: string;
  title: string;
  prompt: string;
  outcome: string;
}

export const PROMPT_CATEGORIES = [
  "All",
  "Customers",
  "Accounts",
  "Transactions",
  "Reports",
] as const;

export const COPILOT_PROMPTS: CopilotPrompt[] = [
  // Customers
  {
    id: "register-customer",
    category: "Customers",
    title: "Register a new customer",
    prompt: "I need to register a new customer",
    outcome: "Guides you through customer registration",
  },
  {
    id: "search-customer",
    category: "Customers",
    title: "Find a customer",
    prompt: "Search for a customer",
    outcome: "Searches customers by name, email, or phone",
  },
  {
    id: "pending-kyc",
    category: "Customers",
    title: "Pending KYC reviews",
    prompt: "Show all customers with pending KYC verification",
    outcome: "Lists customers awaiting KYC approval",
  },

  // Accounts
  {
    id: "open-account",
    category: "Accounts",
    title: "Open a new account",
    prompt: "I want to open a new bank account",
    outcome: "Opens a checking or savings account",
  },
  {
    id: "check-balance",
    category: "Accounts",
    title: "Check account balance",
    prompt: "What's the balance on account",
    outcome: "Shows current balance for an account",
  },
  {
    id: "frozen-accounts",
    category: "Accounts",
    title: "View frozen accounts",
    prompt: "Show all frozen accounts",
    outcome: "Lists accounts currently on security hold",
  },

  // Transactions
  {
    id: "make-deposit",
    category: "Transactions",
    title: "Make a deposit",
    prompt: "I need to deposit money",
    outcome: "Processes a deposit into an account",
  },
  {
    id: "make-withdrawal",
    category: "Transactions",
    title: "Make a withdrawal",
    prompt: "I need to withdraw money",
    outcome: "Processes a withdrawal from an account",
  },
  {
    id: "make-transfer",
    category: "Transactions",
    title: "Transfer funds",
    prompt: "I need to transfer money between accounts",
    outcome: "Transfers funds between two accounts",
  },
  {
    id: "transaction-history",
    category: "Transactions",
    title: "View transaction history",
    prompt: "Show recent transactions",
    outcome: "Displays recent transaction activity",
  },

  // Reports
  {
    id: "dashboard-stats",
    category: "Reports",
    title: "Dashboard overview",
    prompt: "Show me the dashboard overview with key metrics",
    outcome: "Displays summary statistics",
  },
  {
    id: "today-activity",
    category: "Reports",
    title: "Today's activity",
    prompt: "What happened today? Show today's transactions and volume",
    outcome: "Summarizes today's banking activity",
  },
];
