const sections = [
  { id: "auth", label: "Authentication" },
  { id: "customers", label: "Customers API" },
  { id: "accounts", label: "Accounts API" },
  { id: "transactions", label: "Transactions API" },
  { id: "dashboard", label: "Dashboard API" },
  { id: "copilot", label: "Copilot (SSE)" },
  { id: "tools", label: "Copilot Tools" },
  { id: "customer-portal", label: "Customer Portal" },
  { id: "v1", label: "External Chat API (v1)" },
  { id: "audit", label: "Audit Log" },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
        {title}
      </h2>
      <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </section>
  );
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    PATCH: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors[method] || "bg-gray-100 text-gray-600"}`}>{method}</span>
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{path}</code>
      <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{description}</span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">API Documentation</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        API reference, copilot tools, and architecture guide for Agentic Bank.
      </p>

      {/* Table of Contents */}
      <nav className="mb-10 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Contents</h3>
        <div className="grid grid-cols-2 gap-1">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Authentication */}
      <Section id="auth" title="Authentication">
        <p>All endpoints require authentication via Supabase session cookie. The server extracts the user via <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">supabase.auth.getUser()</code> and resolves their organization ID. All queries are scoped to the user&apos;s organization.</p>
        <p>For curl examples, export your session cookie:</p>
        <Code>{`export COOKIE="sb-access-token=YOUR_TOKEN; sb-refresh-token=YOUR_REFRESH"`}</Code>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono">401</td><td className="px-3 py-2">Unauthorized (missing/invalid session)</td></tr>
              <tr className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono">400</td><td className="px-3 py-2">Validation failure</td></tr>
              <tr className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono">402</td><td className="px-3 py-2">Free AI action limit reached</td></tr>
              <tr className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono">403</td><td className="px-3 py-2">Action not permitted (customer scope)</td></tr>
              <tr className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono">404</td><td className="px-3 py-2">Resource not found in this org</td></tr>
              <tr className="border-t border-gray-200 dark:border-gray-700"><td className="px-3 py-2 font-mono">500</td><td className="px-3 py-2">Server error</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Customers */}
      <Section id="customers" title="Customers API">
        <div className="space-y-2">
          <Endpoint method="GET" path="/api/customers" description="List/search customers" />
          <Endpoint method="POST" path="/api/customers" description="Register new customer" />
          <Endpoint method="GET" path="/api/customers/[id]" description="Get customer + accounts" />
          <Endpoint method="PATCH" path="/api/customers/[id]" description="Update customer fields" />
        </div>
        <Code>{`# List all customers
curl -s -b "$COOKIE" http://localhost:3000/api/customers | jq

# Search by name
curl -s -b "$COOKIE" "http://localhost:3000/api/customers?query=smith" | jq

# Create a customer
curl -s -X POST http://localhost:3000/api/customers \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"first_name":"John","last_name":"Smith","email":"john@example.com"}' | jq`}</Code>
      </Section>

      {/* Accounts */}
      <Section id="accounts" title="Accounts API">
        <div className="space-y-2">
          <Endpoint method="GET" path="/api/accounts" description="List/filter accounts" />
          <Endpoint method="POST" path="/api/accounts" description="Open new account" />
          <Endpoint method="GET" path="/api/accounts/[id]" description="Account details + transactions" />
          <Endpoint method="PATCH" path="/api/accounts/[id]" description="Freeze/unfreeze/close" />
        </div>
        <Code>{`# List all accounts
curl -s -b "$COOKIE" http://localhost:3000/api/accounts | jq

# Filter by customer
curl -s -b "$COOKIE" "http://localhost:3000/api/accounts?customer_id=UUID" | jq

# Open a checking account
curl -s -X POST http://localhost:3000/api/accounts \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"customer_id":"UUID","account_type":"checking"}' | jq

# Freeze an account
curl -s -X PATCH http://localhost:3000/api/accounts/UUID \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"status":"frozen"}' | jq`}</Code>
      </Section>

      {/* Transactions */}
      <Section id="transactions" title="Transactions API">
        <div className="space-y-2">
          <Endpoint method="GET" path="/api/transactions" description="List/filter transactions" />
          <Endpoint method="POST" path="/api/transactions" description="Deposit/withdraw/transfer" />
          <Endpoint method="GET" path="/api/transactions/[id]" description="Transaction details" />
        </div>
        <Code>{`# Deposit
curl -s -X POST http://localhost:3000/api/transactions \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"account_id":"UUID","type":"deposit","amount":500,"description":"Payroll"}' | jq

# Withdrawal
curl -s -X POST http://localhost:3000/api/transactions \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"account_id":"UUID","type":"withdrawal","amount":100}' | jq

# Transfer
curl -s -X POST http://localhost:3000/api/transactions \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"account_id":"SRC_UUID","type":"transfer_out","amount":250,"counterparty_account_id":"DST_UUID"}' | jq`}</Code>
      </Section>

      {/* Dashboard */}
      <Section id="dashboard" title="Dashboard API">
        <Endpoint method="GET" path="/api/dashboard/stats" description="Aggregate statistics" />
        <Code>{`curl -s -b "$COOKIE" http://localhost:3000/api/dashboard/stats | jq`}</Code>
        <p>Returns customer counts, account totals, balances, and today&apos;s transaction volume.</p>
      </Section>

      {/* Copilot */}
      <Section id="copilot" title="Copilot (SSE)">
        <div className="space-y-2">
          <Endpoint method="POST" path="/api/copilot" description="Send message (SSE stream)" />
          <Endpoint method="POST" path="/api/copilot/execute" description="Execute approved action" />
        </div>
        <p>The copilot endpoint runs an agentic loop (up to 4 iterations) where READ tools are auto-executed and WRITE tools are queued for user approval. The response is streamed word-by-word via Server-Sent Events.</p>
        <p>Both endpoints accept an optional <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">customer_id</code> field. When present, the copilot operates in customer-scoped mode with restricted tools.</p>
      </Section>

      {/* Tools */}
      <Section id="tools" title="Copilot Tool Reference">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-3 py-2">Tool</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Customer?</th>
                <th className="text-left px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { tool: "search_customers", type: "READ", customer: false, desc: "List/search customers" },
                { tool: "get_customer_details", type: "READ", customer: false, desc: "Get customer + accounts" },
                { tool: "search_accounts", type: "READ", customer: true, desc: "List/search accounts" },
                { tool: "get_account_balance", type: "READ", customer: true, desc: "Get account balance" },
                { tool: "get_transaction_history", type: "READ", customer: true, desc: "Account transactions" },
                { tool: "get_dashboard_stats", type: "READ", customer: false, desc: "Aggregate metrics" },
                { tool: "search_transactions", type: "READ", customer: true, desc: "Search by reference" },
                { tool: "create_customer", type: "WRITE", customer: false, desc: "Register customer" },
                { tool: "open_account", type: "WRITE", customer: false, desc: "Open bank account" },
                { tool: "deposit", type: "WRITE", customer: true, desc: "Deposit funds" },
                { tool: "withdraw", type: "WRITE", customer: true, desc: "Withdraw funds" },
                { tool: "transfer", type: "WRITE", customer: true, desc: "Transfer between accounts" },
                { tool: "update_account_status", type: "WRITE", customer: false, desc: "Freeze/unfreeze/close" },
                { tool: "seed_test_data", type: "WRITE", customer: false, desc: "Generate test data" },
              ].map((t) => (
                <tr key={t.tool} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-3 py-2 font-mono">{t.tool}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.type === "READ" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{t.customer ? "Yes" : "-"}</td>
                  <td className="px-3 py-2">{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          <strong>Customer?</strong> = Available in customer-scoped mode (portal / customer_id API calls). Tools marked &ldquo;-&rdquo; are admin-only.
        </p>
      </Section>

      {/* Customer Portal */}
      <Section id="customer-portal" title="Customer Portal">
        <p>The customer portal at <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">/portal/*</code> provides a customer-scoped view with an AI assistant. A customer selector dropdown simulates customer identity (no real customer auth in dev mode).</p>
        <p><strong>How scoping works:</strong> The portal passes <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">customer_id</code> to all copilot API calls. The backend restricts tool access and adds <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">.eq(&quot;customer_id&quot;, customerId)</code> to every database query.</p>
        <p><strong>Available operations:</strong> Check balance, view transaction history, deposit, withdraw, transfer between own accounts.</p>
        <p><strong>Blocked operations:</strong> Create customers, open accounts, freeze/close accounts, view other customers&apos; data, seed test data, dashboard stats.</p>
      </Section>

      {/* External API */}
      <Section id="v1" title="External Chat API (v1)">
        <div className="space-y-2">
          <Endpoint method="POST" path="/api/v1/chat" description="Send message (JSON response)" />
          <Endpoint method="POST" path="/api/v1/chat/execute" description="Execute approved action" />
        </div>
        <p>Programmatic REST interface for copilot interaction. Same agentic loop as the SSE endpoint but returns JSON. Ideal for integrating with external apps.</p>
        <Code>{`# Simple query (admin)
curl -s -X POST http://localhost:3000/api/v1/chat \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"message":"How many customers do we have?"}' | jq

# Customer-scoped query
curl -s -X POST http://localhost:3000/api/v1/chat \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"message":"What are my account balances?","customer_id":"UUID"}' | jq

# Execute a pending action
curl -s -X POST http://localhost:3000/api/v1/chat/execute \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"action_id":"toolu_xxx","name":"deposit","input":{"account_id":"UUID","amount":500}}' | jq

# Seed test data
curl -s -X POST http://localhost:3000/api/v1/chat/execute \\
  -b "$COOKIE" -H "Content-Type: application/json" \\
  -d '{"name":"seed_test_data","input":{"customers":5,"accounts_per_customer":2,"transactions_per_account":4}}' | jq`}</Code>
        <p>Response includes <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">pending_actions</code> array with queued write tools that need explicit execution via the <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">/execute</code> endpoint.</p>
      </Section>

      {/* Audit */}
      <Section id="audit" title="Audit Log">
        <p>Every write operation generates an audit log entry. Actions tracked:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Trigger</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["customer.created", "New customer registered"],
                ["customer.updated", "Customer fields modified"],
                ["account.created", "New account opened"],
                ["account.frozen", "Account frozen"],
                ["account.unfrozen", "Account reactivated"],
                ["account.closed", "Account permanently closed"],
                ["transaction.deposit", "Deposit processed"],
                ["transaction.withdrawal", "Withdrawal processed"],
                ["transaction.transfer", "Transfer between accounts"],
                ["data.seeded", "Batch test data generation"],
              ].map(([action, trigger]) => (
                <tr key={action} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-3 py-2 font-mono">{action}</td>
                  <td className="px-3 py-2">{trigger}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
