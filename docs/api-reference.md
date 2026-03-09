# Agentic Bank — API Reference

All endpoints require authentication via Supabase session cookie (browser) or the External Chat API (v1) for programmatic access. All data is organization-scoped (multi-tenant).

> **Base URL:** `http://localhost:3000` (development)

---

## Authentication

Every request must include a valid Supabase session cookie. The server extracts the user via `supabase.auth.getUser()` and resolves their `organization_id` from the `users` table. All queries are scoped to the user's organization.

For curl examples below, replace `$COOKIE` with your Supabase session cookie:

```bash
# Export your session cookie for reuse
export COOKIE="sb-access-token=YOUR_TOKEN; sb-refresh-token=YOUR_REFRESH"
```

**Error Responses (all endpoints):**

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid session |
| 400 | `{ "error": "...", "detail": "..." }` | Validation failure |
| 404 | `{ "error": "... not found" }` | Resource doesn't exist in this org |
| 402 | `{ "error": "free_limit_reached" }` | Free AI action limit reached |
| 500 | `{ "error": "Failed to ...", "detail": "..." }` | Server error |

---

## Customers

### GET /api/customers

List all customers for the authenticated user's organization.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| query | string | - | Search by first_name, last_name, email, or phone (case-insensitive) |
| kyc_status | string | - | Filter: `pending`, `verified`, `rejected` |
| limit | integer | 50 | Max results (capped at 100) |

**curl Examples:**

```bash
# List all customers
curl -s -b "$COOKIE" http://localhost:3000/api/customers | jq

# Search by name
curl -s -b "$COOKIE" "http://localhost:3000/api/customers?query=smith" | jq

# Filter by KYC status
curl -s -b "$COOKIE" "http://localhost:3000/api/customers?kyc_status=verified&limit=10" | jq
```

**Response 200:**
```json
{
  "customers": [
    {
      "id": "uuid",
      "customer_id": "CUST-2X4H8K",
      "first_name": "John",
      "last_name": "Smith",
      "email": "john@example.com",
      "phone": "+1234567890",
      "address": { "street": "123 Main St", "city": "Springfield", "state": "IL", "zip": "62701", "country": "US" },
      "kyc_status": "verified",
      "created_by": "uuid",
      "created_at": "2026-03-03T10:00:00Z",
      "updated_at": "2026-03-03T10:00:00Z"
    }
  ]
}
```

---

### POST /api/customers

Register a new customer.

**Copilot Tool:** `create_customer`

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| first_name | string | yes | Non-empty |
| last_name | string | yes | Non-empty |
| email | string | no | Valid email |
| phone | string | no | Phone number |
| address | object | no | `{ street, city, state, zip, country }` |
| kyc_status | string | no | Default: `pending`. One of: `pending`, `verified`, `rejected` |

**curl Example:**

```bash
curl -s -X POST http://localhost:3000/api/customers \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Smith",
    "email": "john@example.com",
    "phone": "+1234567890",
    "address": { "street": "123 Main St", "city": "Springfield", "state": "IL", "zip": "62701", "country": "US" }
  }' | jq
```

**Response 201:**
```json
{
  "success": true,
  "customer": {
    "id": "uuid",
    "customer_id": "CUST-2X4H8K",
    "first_name": "John",
    "last_name": "Smith",
    "email": "john@example.com",
    "kyc_status": "pending",
    "created_at": "2026-03-03T10:00:00Z"
  }
}
```

**Audit Log:** `customer.created` with `{ customer_id, first_name, last_name, email }`

---

### GET /api/customers/[id]

Get a single customer's full profile including their accounts.

**Copilot Tool:** `get_customer_details`

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| id | string (uuid) | Customer UUID |

**curl Example:**

```bash
curl -s -b "$COOKIE" http://localhost:3000/api/customers/CUSTOMER_UUID | jq
```

**Response 200:**
```json
{
  "customer": { "...all customer fields..." },
  "accounts": [
    {
      "id": "uuid",
      "account_id": "ACCT-2X4H8L",
      "account_number": "1234567890",
      "account_type": "checking",
      "balance": 1500.00,
      "currency": "USD",
      "status": "active",
      "created_at": "2026-03-03T10:00:00Z"
    }
  ]
}
```

---

### PATCH /api/customers/[id]

Update customer fields.

**Request Body (all fields optional):**

| Field | Type | Constraints |
|-------|------|-------------|
| first_name | string | Non-empty |
| last_name | string | Non-empty |
| email | string | Valid email |
| phone | string | Phone number |
| address | object | `{ street, city, state, zip, country }` |
| kyc_status | string | `pending`, `verified`, `rejected` |

**curl Example:**

```bash
curl -s -X PATCH http://localhost:3000/api/customers/CUSTOMER_UUID \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{ "kyc_status": "verified" }' | jq
```

**Response 200:**
```json
{
  "success": true,
  "customer": { "...updated customer..." }
}
```

**Audit Log:** `customer.updated` with old and new values

---

## Accounts

### GET /api/accounts

List all accounts for the organization.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| customer_id | string (uuid) | - | Filter by customer |
| account_type | string | - | `checking` or `savings` |
| status | string | - | `active`, `frozen`, `closed` |
| limit | integer | 50 | Max results (capped at 100) |

**curl Examples:**

```bash
# List all accounts
curl -s -b "$COOKIE" http://localhost:3000/api/accounts | jq

# Filter by type
curl -s -b "$COOKIE" "http://localhost:3000/api/accounts?account_type=checking" | jq

# Filter by customer
curl -s -b "$COOKIE" "http://localhost:3000/api/accounts?customer_id=CUSTOMER_UUID" | jq
```

**Response 200:**
```json
{
  "accounts": [
    {
      "id": "uuid",
      "account_id": "ACCT-2X4H8L",
      "account_number": "1234567890",
      "account_type": "checking",
      "balance": 1500.00,
      "currency": "USD",
      "status": "active",
      "customer_id": "uuid",
      "customers": {
        "first_name": "John",
        "last_name": "Smith",
        "customer_id": "CUST-2X4H8K"
      },
      "created_at": "2026-03-03T10:00:00Z"
    }
  ]
}
```

---

### POST /api/accounts

Open a new bank account for an existing customer.

**Copilot Tool:** `open_account`

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| customer_id | string (uuid) | yes | Must be an existing customer in same org |
| account_type | string | yes | `checking` or `savings` |
| currency | string | no | Default: `USD` |

**Response 201:**
```json
{
  "success": true,
  "account": {
    "id": "uuid",
    "account_id": "ACCT-2X4H8L",
    "account_number": "1234567890",
    "account_type": "checking",
    "balance": 0.00,
    "currency": "USD",
    "status": "active"
  }
}
```

**curl Example:**

```bash
curl -s -X POST http://localhost:3000/api/accounts \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUSTOMER_UUID",
    "account_type": "checking"
  }' | jq
```

**Generated Fields:**
- `account_id`: `ACCT-{base36 timestamp}` (human-readable)
- `account_number`: 10-digit numeric string

**Audit Log:** `account.created` with `{ account_id, account_number, account_type, customer_id }`

---

### GET /api/accounts/[id]

Get account details with recent transactions (last 20).

**curl Example:**

```bash
curl -s -b "$COOKIE" http://localhost:3000/api/accounts/ACCOUNT_UUID | jq
```

**Response 200:**
```json
{
  "account": {
    "...all account fields...",
    "customers": {
      "first_name": "John",
      "last_name": "Smith",
      "customer_id": "CUST-2X4H8K",
      "email": "john@example.com"
    }
  },
  "transactions": [
    {
      "id": "uuid",
      "transaction_id": "TXN-2X4H8M",
      "type": "deposit",
      "amount": 500.00,
      "balance_after": 1500.00,
      "reference": "REF-2X4H8M-AB12",
      "description": "Payroll deposit",
      "status": "completed",
      "created_at": "2026-03-03T10:00:00Z"
    }
  ]
}
```

---

### PATCH /api/accounts/[id]

Update account status (freeze, unfreeze, or close).

**Copilot Tool:** `update_account_status`

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| status | string | yes | `active` (unfreeze), `frozen` (freeze), `closed` (close) |

**curl Examples:**

```bash
# Freeze an account
curl -s -X PATCH http://localhost:3000/api/accounts/ACCOUNT_UUID \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{ "status": "frozen" }' | jq

# Unfreeze
curl -s -X PATCH http://localhost:3000/api/accounts/ACCOUNT_UUID \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{ "status": "active" }' | jq
```

**Business Rules:**
- **Close**: Account balance must be exactly $0.00
- **Closed accounts**: Cannot be modified further
- **Frozen accounts**: Cannot process transactions until unfrozen

**Response 200:**
```json
{
  "success": true,
  "account": { "...updated account..." }
}
```

**Audit Log:** `account.frozen`, `account.unfrozen`, or `account.closed`

---

## Transactions

### GET /api/transactions

List transactions across all accounts in the organization.

**curl Examples:**

```bash
# List recent transactions
curl -s -b "$COOKIE" http://localhost:3000/api/transactions | jq

# Filter by account
curl -s -b "$COOKIE" "http://localhost:3000/api/transactions?account_id=ACCOUNT_UUID&limit=20" | jq

# Filter by type and date range
curl -s -b "$COOKIE" "http://localhost:3000/api/transactions?type=deposit&date_from=2026-03-01&date_to=2026-03-04" | jq
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| account_id | string (uuid) | - | Filter by account |
| type | string | - | `deposit`, `withdrawal`, `transfer_out`, `transfer_in` |
| date_from | string (ISO date) | - | Start date (inclusive) |
| date_to | string (ISO date) | - | End date (inclusive) |
| limit | integer | 50 | Max results (capped at 200) |

**Response 200:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "transaction_id": "TXN-2X4H8M",
      "account_id": "uuid",
      "type": "deposit",
      "amount": 500.00,
      "balance_before": 1000.00,
      "balance_after": 1500.00,
      "counterparty_account_id": null,
      "reference": "REF-2X4H8M-AB12",
      "description": "Payroll deposit",
      "status": "completed",
      "created_by": "uuid",
      "created_at": "2026-03-03T10:00:00Z",
      "accounts": {
        "account_number": "1234567890",
        "account_type": "checking"
      }
    }
  ]
}
```

---

### POST /api/transactions

Create a new transaction (deposit, withdrawal, or transfer).

**Copilot Tools:** `deposit`, `withdraw`, `transfer`

**Request Body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| account_id | string (uuid) | yes | Must be an active account |
| type | string | yes | `deposit`, `withdrawal`, `transfer_out` |
| amount | number | yes | > 0, max 2 decimal places |
| description | string | no | Transaction memo |
| counterparty_account_id | string (uuid) | for transfers | Must be an active account (destination) |

**Business Rules:**

| Rule | Applies To | Behavior |
|------|-----------|----------|
| Balance check | withdrawal, transfer_out | Returns 400 if `balance < amount` |
| Account status | all | Returns 400 if account is `frozen` or `closed` |
| Dual records | transfer_out | Creates a `transfer_out` on source + `transfer_in` on destination |
| Balance update | all | Atomically updates account balance |
| Reference generation | all | Auto-generates `REF-{base36}-{random}` |

**Response 201 (Deposit/Withdrawal):**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "transaction_id": "TXN-2X4H8M",
    "account_id": "uuid",
    "type": "deposit",
    "amount": 500.00,
    "balance_before": 1000.00,
    "balance_after": 1500.00,
    "reference": "REF-2X4H8M-AB12",
    "description": "Payroll deposit",
    "status": "completed",
    "created_at": "2026-03-03T10:00:00Z"
  }
}
```

**Response 201 (Transfer):**
```json
{
  "success": true,
  "transfer_out": { "...source transaction..." },
  "transfer_in": { "...destination transaction..." }
}
```

**curl Examples:**

```bash
# Deposit
curl -s -X POST http://localhost:3000/api/transactions \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "ACCOUNT_UUID",
    "type": "deposit",
    "amount": 500.00,
    "description": "Payroll deposit"
  }' | jq

# Withdrawal
curl -s -X POST http://localhost:3000/api/transactions \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "ACCOUNT_UUID",
    "type": "withdrawal",
    "amount": 100.00,
    "description": "ATM withdrawal"
  }' | jq

# Transfer between accounts
curl -s -X POST http://localhost:3000/api/transactions \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "SOURCE_ACCOUNT_UUID",
    "type": "transfer_out",
    "amount": 250.00,
    "counterparty_account_id": "DESTINATION_ACCOUNT_UUID",
    "description": "Savings transfer"
  }' | jq
```

**Response 400 (Insufficient Balance):**
```json
{
  "error": "Insufficient balance",
  "detail": "Available: $1000.00, Requested: $1500.00"
}
```

**Audit Log:**
- Deposit: `transaction.deposit` with `{ transaction_id, amount, account_id, balance_after }`
- Withdrawal: `transaction.withdrawal` with `{ transaction_id, amount, account_id, balance_after }`
- Transfer: `transaction.transfer` with `{ amount, from, to, reference }`

---

### GET /api/transactions/[id]

Get a single transaction with account and customer details.

**curl Example:**

```bash
curl -s -b "$COOKIE" http://localhost:3000/api/transactions/TRANSACTION_UUID | jq
```

**Response 200:**
```json
{
  "transaction": {
    "...all transaction fields...",
    "accounts": {
      "account_number": "1234567890",
      "account_type": "checking",
      "customers": {
        "first_name": "John",
        "last_name": "Smith"
      }
    }
  }
}
```

---

## Dashboard

### GET /api/dashboard/stats

Get aggregate dashboard statistics.

**Copilot Tool:** `get_dashboard_stats`

**curl Example:**

```bash
curl -s -b "$COOKIE" http://localhost:3000/api/dashboard/stats | jq
```

**Response 200:**
```json
{
  "stats": {
    "customers": {
      "total": 142,
      "verified": 138,
      "pending": 4
    },
    "accounts": {
      "total": 201,
      "checking": 120,
      "savings": 81,
      "active": 198,
      "frozen": 3,
      "totalBalance": 2450000.00
    },
    "transactions": {
      "todayCount": 47,
      "todayVolume": 125430.00
    }
  }
}
```

---

## Copilot

### POST /api/copilot

Main copilot endpoint. Accepts a user message, runs the agentic loop (up to 4 iterations of Claude + tool calls), and streams the response via SSE.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | yes | User's natural language message |
| history | array | no | Previous messages: `[{ role: "user"|"assistant", content: "..." }]` |
| context | object | no | Current page context: `{ page: "/dashboard" }` |

**Response:** Server-Sent Events stream

**SSE Events:**

1. **Text chunks** (repeated):
```
data: {"type":"text","text":"Hello "}
```

2. **Completion** (final):
```
data: {"type":"done","pendingActions":[{"id":"toolu_xxx","name":"deposit","input":{"account_id":"uuid","amount":500},"status":"pending"}]}
```

**Agentic Loop:**
1. User message + history + system prompt + tools sent to Claude
2. If Claude calls a READ tool → executed automatically, result fed back
3. If Claude calls a WRITE tool → queued in `pendingActions`, Claude told "awaiting approval"
4. Loop continues up to 4 iterations
5. Final text streamed word-by-word via SSE (25ms interval)

---

### POST /api/copilot/execute

Execute an approved copilot action (write tool).

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| toolCallId | string | yes | The tool call ID from pendingActions |
| name | string | yes | Tool name (e.g., `deposit`, `create_customer`) |
| input | object | yes | Tool input parameters |

**Response 200:**
```json
{
  "success": true,
  "result": { "...created/updated entity..." },
  "toolCallId": "toolu_xxx",
  "message": "Deposited **$500.00** into account 1234567890. New balance: **$1500.00**."
}
```

**Response 402 (Free Limit):**
```json
{
  "error": "free_limit_reached",
  "upgrade_prompt": true,
  "message": "You've used all 10 free AI actions.",
  "write_count": 10,
  "limit": 10
}
```

---

## Copilot Tool ↔ API Mapping

This table maps each copilot tool to its underlying API endpoint and operation, useful for guardrails monitoring.

| Copilot Tool | Type | API Endpoint | HTTP Method | Operation |
|-------------|------|-------------|-------------|-----------|
| `search_customers` | READ | /api/customers | GET | List/search customers |
| `get_customer_details` | READ | /api/customers/[id] | GET | Get customer + accounts |
| `search_accounts` | READ | /api/accounts | GET | List/search accounts |
| `get_account_balance` | READ | /api/accounts/[id] | GET | Get account balance |
| `get_transaction_history` | READ | /api/transactions | GET | List transactions |
| `get_dashboard_stats` | READ | /api/dashboard/stats | GET | Aggregate metrics |
| `search_transactions` | READ | /api/transactions | GET | Search by reference |
| `create_customer` | WRITE | /api/customers | POST | Register customer |
| `open_account` | WRITE | /api/accounts | POST | Open account |
| `deposit` | WRITE | /api/transactions | POST | Deposit funds |
| `withdraw` | WRITE | /api/transactions | POST | Withdraw funds |
| `transfer` | WRITE | /api/transactions | POST | Transfer funds |
| `update_account_status` | WRITE | /api/accounts/[id] | PATCH | Freeze/unfreeze/close |
| `seed_test_data` | WRITE | (batch) | POST | Generate sample customers, accounts, and transactions |

**Key for guardrails:**
- READ tools are auto-executed by the copilot backend (no user approval needed)
- WRITE tools require explicit user approval via the action card UI before execution
- All WRITE operations generate audit log entries
- All WRITE operations invalidate the copilot context cache

---

## External Chat API (v1)

Programmatic REST interface for copilot interaction. Returns JSON (not SSE). Ideal for integrating the copilot into external apps, scripts, or workflows.

### POST /api/v1/chat

Send a message to the copilot and receive a JSON response with any pending write actions.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | yes | Natural language message |
| history | array | no | Prior messages: `[{ role: "user"|"assistant", content: "..." }]` |
| conversation_id | string | no | Track conversation context (returned if not provided) |

**curl Examples:**

```bash
# Simple query
curl -s -X POST http://localhost:3000/api/v1/chat \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{ "message": "How many customers do we have?" }' | jq

# Query with conversation history
curl -s -X POST http://localhost:3000/api/v1/chat \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me their accounts",
    "history": [
      { "role": "user", "content": "Who is John Smith?" },
      { "role": "assistant", "content": "John Smith is a verified customer with ID CUST-2X4H8K." }
    ],
    "conversation_id": "conv-abc123"
  }' | jq

# Request a write action (will return pending_actions)
curl -s -X POST http://localhost:3000/api/v1/chat \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Deposit $500 into account 1234567890" }' | jq

# Seed test data
curl -s -X POST http://localhost:3000/api/v1/chat \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Generate test data with 3 customers, 2 accounts each, and 5 transactions per account" }' | jq
```

**Response 200:**
```json
{
  "response": "You currently have 142 customers, with 138 verified.",
  "pending_actions": [],
  "conversation_id": "conv-abc123"
}
```

**Response 200 (with pending write action):**
```json
{
  "response": "I'll deposit $500.00 into account 1234567890. Please approve to proceed.",
  "pending_actions": [
    {
      "id": "toolu_01ABC123",
      "name": "deposit",
      "input": { "account_id": "uuid", "amount": 500, "description": "Deposit" }
    }
  ],
  "conversation_id": "conv-abc123"
}
```

**Agentic Loop:** Same as `/api/copilot` — up to 4 iterations. READ tools are auto-executed; WRITE tools are queued in `pending_actions` for explicit approval via the execute endpoint.

---

### POST /api/v1/chat/execute

Execute an approved action from a `/api/v1/chat` response.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Tool name from `pending_actions` (e.g., `deposit`, `create_customer`) |
| input | object | yes | Tool input from `pending_actions` |
| action_id | string | no | Tool call ID from `pending_actions[].id` for tracking |

**curl Examples:**

```bash
# Execute a pending deposit
curl -s -X POST http://localhost:3000/api/v1/chat/execute \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "action_id": "toolu_01ABC123",
    "name": "deposit",
    "input": { "account_id": "ACCOUNT_UUID", "amount": 500, "description": "Deposit" }
  }' | jq

# Execute a pending customer creation
curl -s -X POST http://localhost:3000/api/v1/chat/execute \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "create_customer",
    "input": { "first_name": "Jane", "last_name": "Doe", "email": "jane@example.com" }
  }' | jq

# Execute seed test data
curl -s -X POST http://localhost:3000/api/v1/chat/execute \
  -b "$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "seed_test_data",
    "input": { "customers": 5, "accounts_per_customer": 2, "transactions_per_account": 4 }
  }' | jq
```

**Response 200:**
```json
{
  "success": true,
  "result": { "...created/updated entity..." },
  "action_id": "toolu_01ABC123",
  "message": "Deposited **$500.00** into account 1234567890. New balance: **$1,500.00**."
}
```

**Response 402 (Free Limit):**
```json
{
  "error": "free_limit_reached",
  "message": "You've used all 10 free AI actions. Add your own API key in Settings to continue.",
  "write_count": 10,
  "limit": 10
}
```

---

## Audit Log Schema

Every write operation generates an audit log entry via the `insert_audit_log()` stored procedure.

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Auto-generated |
| organization_id | uuid | The org that owns the data |
| user_id | uuid | The authenticated user who performed the action |
| action | string | Action identifier (see table below) |
| entity_type | string | `customer`, `account`, `transaction` |
| entity_id | string | UUID of the affected entity |
| old_values | jsonb | Previous state (for updates) |
| new_values | jsonb | New state |
| created_at | timestamptz | When the action occurred |

**Action Types:**

| Action | Trigger |
|--------|---------|
| `customer.created` | New customer registered |
| `customer.updated` | Customer fields modified |
| `account.created` | New account opened |
| `account.frozen` | Account frozen (security hold) |
| `account.unfrozen` | Account reactivated |
| `account.closed` | Account permanently closed |
| `transaction.deposit` | Deposit processed |
| `transaction.withdrawal` | Withdrawal processed |
| `transaction.transfer` | Transfer between accounts |
| `seed.test_data` | Batch test data generation |

---

## ID Generation Patterns

| Entity | Prefix | Format | Example |
|--------|--------|--------|---------|
| Customer | CUST- | `CUST-{Date.now().toString(36).toUpperCase()}` | `CUST-2X4H8K` |
| Account | ACCT- | `ACCT-{Date.now().toString(36).toUpperCase()}` | `ACCT-2X4H8L` |
| Transaction | TXN- | `TXN-{Date.now().toString(36).toUpperCase()}` | `TXN-2X4H8M` |
| Reference | REF- | `REF-{base36}-{random4}` | `REF-2X4H8M-AB12` |
| Account Number | - | 10-digit numeric | `1234567890` |
