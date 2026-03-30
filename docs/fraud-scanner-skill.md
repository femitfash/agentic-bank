# Building an Agentic Fraud Scanner

A comprehensive blueprint for building an LLM-powered fraud detection agent that fetches anonymized bank transactions, analyzes them against a pattern library using Claude, and reports flagged transactions via webhook. Supports scheduled execution and custom detection rules.

---

## 1. Architecture Overview

### Data Flow

```
Schedule triggers scan (cron: every 5min / 10min / hourly / daily)
  -> Fetch anonymized transaction batch from AgenticBank API
    -> GET /api/v1/fraud-detection/batch?user_id=X&batch_size=50
    -> Receive: { batch_id, transactions[], webhook_url }
  -> Build analysis prompt:
    -> Inject fraud pattern library (built-in + custom rules)
    -> Inject transaction batch as structured JSON
  -> Call Claude API with system prompt + transaction data
    -> Claude reasons about each transaction against all patterns
    -> Returns: JSON array of { transaction_id, risk_score, reason }
  -> Validate and filter results (scores >= threshold)
  -> Submit flagged transactions via webhook
    -> POST /api/v1/fraud-detection/webhook
    -> { batch_id, flagged_transactions, scanner_id, scanned_at }
  -> Log results, wait for next scheduled run
```

### File Structure

```
fraud-scanner/
  src/
    index.ts                    # Entry point: CLI args, scheduling, main loop
    config.ts                   # Environment + config loading
    api-client.ts               # HTTP calls to batch, webhook, reports endpoints
    analyzer.ts                 # Claude API call, prompt building, response parsing
    patterns/
      library.ts                # Built-in fraud pattern library
      custom-loader.ts          # Load + validate + merge custom rules
      types.ts                  # FraudPattern, FlaggedTransaction, BatchResponse interfaces
    prompt.ts                   # System prompt template builder
  custom-rules.json             # User-provided custom rules (optional)
  .env                          # Environment variables
  package.json
  tsconfig.json
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Standalone Node.js script** over API route | Scanner is headless and scheduled; no HTTP server needed. Simpler deployment as cron job or long-running process. |
| **LLM reasoning** over threshold/regex rules | Catches complex multi-signal patterns (velocity + time + merchant combined). Handles novel fraud without code changes. |
| **Full batch in single prompt** over per-transaction calls | Enables cross-transaction pattern detection (velocity, draining, behavioral baseline). More token-efficient. |
| **Pattern library as prompt injection** over tool definitions | Holistic reasoning requires full context in a single pass. Tools would fragment the analysis. |
| **node-cron** over external scheduler | Zero-dependency scheduling within the process. Replaceable with OS cron, Vercel Cron, or CloudWatch for production. |
| **Custom rules as JSON file** over editing source | Non-developers can add rules. Git-friendly separation of built-in vs. organization-specific patterns. |
| **Configurable threshold** (default 40) | Different orgs have different risk tolerances. Compliance-heavy orgs want lower; high-volume merchants want higher. |

---

## 2. Prerequisites & Configuration

### Dependencies

```bash
mkdir fraud-scanner && cd fraud-scanner
npm init -y
npm install @anthropic-ai/sdk node-cron zod
npm install -D typescript @types/node tsx
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

### Environment Variables

**File**: `.env`

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
FRAUD_API_BASE_URL=http://localhost:3000
FRAUD_SCANNER_API_KEY=fraud-sim-key-2026

# Scanner identity
SCANNER_ID=blue-team-scanner-v1

# Scheduling (cron expression or preset name)
SCAN_SCHEDULE=10min

# Users to scan (comma-separated anonymized user IDs)
SCAN_USER_IDS=dab208a0153acc8b

# Detection threshold (0-100, only flag transactions scoring above this)
RISK_THRESHOLD=40

# Batch size per scan
BATCH_SIZE=50

# Optional: path to custom rules JSON
CUSTOM_RULES_PATH=./custom-rules.json
```

### Configuration Module

**File**: `src/config.ts`

```typescript
import { config } from "dotenv";
config();

const SCHEDULE_PRESETS: Record<string, string> = {
  "5min":   "*/5 * * * *",
  "10min":  "*/10 * * * *",
  "15min":  "*/15 * * * *",
  "30min":  "*/30 * * * *",
  "hourly": "0 * * * *",
  "daily":  "0 6 * * *",
};

export interface ScanConfig {
  anthropicApiKey: string;
  apiBaseUrl: string;
  scannerApiKey: string;
  scannerId: string;
  schedule: string;           // Resolved cron expression
  userIds: string[];
  riskThreshold: number;
  batchSize: number;
  customRulesPath: string | null;
}

export function loadConfig(): ScanConfig {
  const scheduleInput = process.env.SCAN_SCHEDULE || "10min";
  const schedule = SCHEDULE_PRESETS[scheduleInput] || scheduleInput; // Allow raw cron

  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    apiBaseUrl: process.env.FRAUD_API_BASE_URL || "http://localhost:3000",
    scannerApiKey: process.env.FRAUD_SCANNER_API_KEY!,
    scannerId: process.env.SCANNER_ID || "fraud-scanner-agent",
    schedule,
    userIds: (process.env.SCAN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean),
    riskThreshold: Number(process.env.RISK_THRESHOLD) || 40,
    batchSize: Math.min(Number(process.env.BATCH_SIZE) || 50, 200),
    customRulesPath: process.env.CUSTOM_RULES_PATH || null,
  };
}
```

---

## 3. Fraud Pattern Library

The pattern library is the core knowledge base. Each pattern is a structured object with an LLM-readable description that Claude uses to evaluate transactions.

**File**: `src/patterns/types.ts`

```typescript
export interface FraudPattern {
  id: string;                // Unique identifier (e.g., "amt_001")
  category: string;          // Category name for grouping
  name: string;              // Human-readable pattern name
  description: string;       // LLM-readable prompt describing the pattern
  severity_weight: number;   // 1-5, guidance for the LLM on base severity
  examples: string[];        // Concrete examples of suspicious descriptions
}

export interface FlaggedTransaction {
  transaction_id: string;
  risk_score: number;        // 0-100
  reason: string;
}

export interface AnonymizedTransaction {
  transaction_id: string;
  type: string;              // "deposit" | "withdrawal" | "transfer_out" | "transfer_in"
  amount: number;
  balance_before: number;
  balance_after: number;
  account_id: string;        // Pseudonymized (SHA-256 hash, 16 chars)
  counterparty_account_id: string | null;
  description: string;
  status: string;
  created_at: string;        // ISO 8601
}

export interface BatchResponse {
  batch_id: string;
  user_id: string;
  transaction_count: number;
  transactions: AnonymizedTransaction[];
  webhook_url: string;
  created_at: string;
}
```

**File**: `src/patterns/library.ts`

```typescript
import { FraudPattern } from "./types";

export const FRAUD_PATTERN_LIBRARY: FraudPattern[] = [

  // ═══════════════════════════════════════════
  // CATEGORY: Amount Anomalies
  // ═══════════════════════════════════════════

  {
    id: "amt_001",
    category: "Amount Anomalies",
    name: "Unusually large single transaction",
    description:
      "A single withdrawal or transfer that is 3x or more the user's typical maximum transaction amount. " +
      "Compare the transaction amount against the baseline established by other transactions in the batch. " +
      "Normal checking account withdrawals rarely exceed $200-$500 for everyday users.",
    severity_weight: 4,
    examples: [
      "Counter Withdrawal - Branch #9912 for $7,400",
      "Wire Transfer for $8,750 when typical max is $200",
    ],
  },
  {
    id: "amt_002",
    category: "Amount Anomalies",
    name: "Structured amounts below reporting thresholds",
    description:
      "Transactions deliberately structured just below the $10,000 Currency Transaction Report (CTR) threshold. " +
      "Look for amounts like $9,500, $9,800, $9,999. Multiple such transactions across days suggest intentional structuring " +
      "to avoid regulatory reporting — a federal crime known as 'structuring' or 'smurfing'.",
    severity_weight: 5,
    examples: [
      "Cash deposit of $9,500",
      "Wire transfer of $9,900",
      "Two withdrawals of $4,900 on the same day",
    ],
  },
  {
    id: "amt_003",
    category: "Amount Anomalies",
    name: "Round-number large transfers",
    description:
      "Large transfers in exact round amounts ($5,000, $10,000, $15,000, $25,000) to unfamiliar recipients. " +
      "Legitimate payments are rarely perfectly round. Round-number large transfers to entities like " +
      "'Holdings Ltd', 'Offshore', or unfamiliar companies are highly suspicious.",
    severity_weight: 4,
    examples: [
      "Wire Transfer - Offshore Holdings Ltd - Cayman Islands for $15,000",
      "Transfer of exactly $10,000 to unknown entity",
    ],
  },

  // ═══════════════════════════════════════════
  // CATEGORY: Velocity Anomalies
  // ═══════════════════════════════════════════

  {
    id: "vel_001",
    category: "Velocity Anomalies",
    name: "Rapid successive ATM withdrawals",
    description:
      "Multiple ATM withdrawals within a short window (e.g., 3+ within 30 minutes). This pattern suggests " +
      "a cloned card being used at multiple ATMs, or account takeover. Pay attention to sequential ATM IDs " +
      "that are different (suggesting movement between machines) and identical amounts (suggesting max-per-txn limit).",
    severity_weight: 5,
    examples: [
      "5 ATM withdrawals of $400 each within 30 minutes at Unknown ATM #8800-#8804",
      "3 ATM withdrawals in 15 minutes from different bank ATMs",
    ],
  },
  {
    id: "vel_002",
    category: "Velocity Anomalies",
    name: "Transaction velocity spike",
    description:
      "Significantly more transactions in a short period than the user's baseline. If a user typically " +
      "makes 2-3 transactions per day, 8+ transactions within 2 hours is a velocity anomaly. " +
      "Especially suspicious when combined with small, similar amounts across different merchants.",
    severity_weight: 4,
    examples: [
      "8 purchases of $15-$30 each within 2 hours at gift card kiosks",
      "12 transactions in one afternoon when baseline is 2-3 per day",
    ],
  },
  {
    id: "vel_003",
    category: "Velocity Anomalies",
    name: "Card testing / gift card loading pattern",
    description:
      "Multiple small-value purchases in rapid succession, often at gift card merchants, prepaid card stores, " +
      "or digital wallet loading services. Fraudsters test stolen cards with small purchases before making large ones, " +
      "or load stolen funds onto untraceable gift cards to launder money.",
    severity_weight: 5,
    examples: [
      "POS Purchase - Gift Card Kiosk A for $24.99",
      "POS Purchase - Online Prepaid #1 for $19.99",
      "POS Purchase - Digital Wallet Load for $29.99",
      "POS Purchase - Prepaid Card Store for $15.00",
    ],
  },

  // ═══════════════════════════════════════════
  // CATEGORY: Temporal Anomalies
  // ═══════════════════════════════════════════

  {
    id: "tmp_001",
    category: "Temporal Anomalies",
    name: "Odd-hour transactions",
    description:
      "Significant transactions occurring between 1:00 AM and 5:00 AM when the user's transaction history " +
      "shows no such pattern. Legitimate late-night activity exists (online shopping, entertainment), but " +
      "large withdrawals, wire transfers, or foreign purchases at 3 AM are highly suspicious — especially " +
      "if the user's established pattern is daytime-only activity.",
    severity_weight: 3,
    examples: [
      "Online Purchase - ElectroMart - Dubai, UAE at 2:30 AM",
      "$2,500 withdrawal at 3:15 AM",
      "Wire transfer at 4:00 AM to unfamiliar entity",
    ],
  },
  {
    id: "tmp_002",
    category: "Temporal Anomalies",
    name: "Weekend/holiday pattern break",
    description:
      "Large transactions on days when the user typically has minimal or no activity. If the user's " +
      "pattern shows activity only on weekdays, large weekend transactions are anomalous. " +
      "Consider this in combination with other signals — a weekend grocery run is normal, " +
      "a weekend $10,000 wire transfer is not.",
    severity_weight: 2,
    examples: [
      "Large wire transfer on Sunday at 11 PM",
      "$5,000 counter withdrawal on a holiday",
    ],
  },

  // ═══════════════════════════════════════════
  // CATEGORY: Geographic Anomalies
  // ═══════════════════════════════════════════

  {
    id: "geo_001",
    category: "Geographic Anomalies",
    name: "Foreign location inconsistency",
    description:
      "Transactions in countries or cities that are inconsistent with the user's established domestic pattern. " +
      "If all prior transactions are at US merchants and suddenly there are purchases in Lagos (Nigeria), " +
      "Bangkok (Thailand), Dubai (UAE), Moscow (Russia), or Shenzhen (China), this is a strong signal of " +
      "card compromise or account takeover. Look for location names in the transaction description field.",
    severity_weight: 5,
    examples: [
      "POS Purchase - Electronics Mega Store - Lagos, Nigeria",
      "POS Purchase - Luxury Goods - Bangkok, Thailand",
      "Online Purchase - ElectroMart - Dubai, UAE",
      "Online Purchase - ElectroMart - Moscow, Russia",
    ],
  },
  {
    id: "geo_002",
    category: "Geographic Anomalies",
    name: "Impossible travel",
    description:
      "Transactions in geographically distant locations within a timeframe that makes physical travel impossible. " +
      "For example, a POS purchase in New York at 2:00 PM followed by a POS purchase in Lagos at 3:00 PM " +
      "the same day. This definitively indicates card cloning or account compromise.",
    severity_weight: 5,
    examples: [
      "Purchase in New York at 14:00, purchase in London at 16:00 same day",
      "ATM withdrawal in Chicago at 10:00, ATM withdrawal in Miami at 11:30",
    ],
  },

  // ═══════════════════════════════════════════
  // CATEGORY: Merchant / Counterparty Anomalies
  // ═══════════════════════════════════════════

  {
    id: "mrc_001",
    category: "Merchant/Counterparty Anomalies",
    name: "Cryptocurrency exchange transactions",
    description:
      "Large transfers to known or suspected cryptocurrency exchanges. Crypto exchanges are commonly used " +
      "to launder stolen funds because transactions become difficult to trace once converted to cryptocurrency. " +
      "Look for descriptions containing: 'Crypto', 'Exchange', 'Bitcoin', 'CryptoMix', 'Binance', etc.",
    severity_weight: 4,
    examples: [
      "Wire Transfer - CryptoMix Exchange",
      "Payment - Binance Holdings",
      "Transfer to CoinBase Pro",
    ],
  },
  {
    id: "mrc_002",
    category: "Merchant/Counterparty Anomalies",
    name: "Shell company indicators",
    description:
      "Payments to entities whose names suggest shell companies or opaque corporate structures. " +
      "Look for: 'Anonymous', 'Holdings', 'Offshore', 'Nominee', 'Bearer', generic names like " +
      "'Global Trading LLC', 'International Services Ltd'. These entities often exist solely " +
      "to layer illicit funds through seemingly legitimate transactions.",
    severity_weight: 4,
    examples: [
      "Payment - Anonymous Holding LLC",
      "Wire Transfer - Offshore Holdings Ltd - Cayman Islands",
      "Transfer - Global Services Nominee Ltd",
    ],
  },
  {
    id: "mrc_003",
    category: "Merchant/Counterparty Anomalies",
    name: "Gift card / prepaid aggregation",
    description:
      "Multiple purchases at gift card kiosks, prepaid card stores, or digital wallet loading services " +
      "within a short time window. Gift cards are a primary money laundering vehicle because they're " +
      "untraceable once purchased. This pattern is especially suspicious when combined with velocity anomalies.",
    severity_weight: 4,
    examples: [
      "POS Purchase - Gift Card Kiosk A",
      "POS Purchase - Gift Card Kiosk B",
      "POS Purchase - Prepaid Card Store",
      "POS Purchase - Gift Card Exchange",
      "POS Purchase - Virtual Card Service",
    ],
  },
  {
    id: "mrc_004",
    category: "Merchant/Counterparty Anomalies",
    name: "Offshore wire transfers",
    description:
      "Wire transfers to jurisdictions commonly associated with money laundering, tax evasion, or fraud. " +
      "High-risk jurisdictions include: Cayman Islands, British Virgin Islands, Panama, Seychelles, Belize, " +
      "Isle of Man, Jersey, Guernsey, Liechtenstein. Not all offshore transactions are fraudulent, " +
      "but combined with other signals (round amounts, unfamiliar recipients) they are very high risk.",
    severity_weight: 5,
    examples: [
      "Wire Transfer - Offshore Holdings Ltd - Cayman Islands",
      "International Wire - Panama City, Panama",
      "Transfer - BVI Corporate Services - British Virgin Islands",
    ],
  },

  // ═══════════════════════════════════════════
  // CATEGORY: Behavioral / Balance Anomalies
  // ═══════════════════════════════════════════

  {
    id: "bal_001",
    category: "Behavioral/Balance Anomalies",
    name: "Account draining pattern",
    description:
      "Progressive large withdrawals that significantly reduce the account balance over a short period. " +
      "Compare balance_before and balance_after across the batch chronologically. If the account starts at " +
      "$85,000 and drops to $5,000 through a series of large withdrawals over a few weeks, this suggests " +
      "either account takeover or money laundering. The rate of drainage matters — normal spending " +
      "gradually reduces balances; fraud drains them rapidly.",
    severity_weight: 4,
    examples: [
      "Balance drops from $85,000 to $20,000 in 2 weeks through wire transfers",
      "Series of $5,000+ withdrawals reducing balance by 70% in 10 days",
    ],
  },
  {
    id: "bhv_001",
    category: "Behavioral/Balance Anomalies",
    name: "Behavioral deviation from baseline",
    description:
      "Transactions that deviate significantly from the user's established spending patterns visible in the batch. " +
      "Establish a baseline from the majority of transactions (typical merchants, amounts, times, types) and " +
      "flag outliers. For example: if 90% of transactions are <$100 domestic POS purchases, a $5,000 international " +
      "wire transfer is a major deviation. Consider merchant categories, transaction types, amounts, and timing " +
      "together for holistic behavioral analysis.",
    severity_weight: 3,
    examples: [
      "User normally shops at US grocery stores; suddenly has $3,000 electronics purchase in Nigeria",
      "User averages $50/transaction; suddenly has $15,000 wire transfer",
    ],
  },

  // [TODO: Add domain-specific patterns for your organization]
  // Examples:
  // - Industry-specific fraud patterns (e-commerce chargebacks, insurance fraud, etc.)
  // - Regulatory-specific patterns (OFAC screening, PEP transactions, etc.)
  // - Organization-specific patterns (known bad actors, internal watchlists, etc.)
];
```

---

## 4. Custom Rules System

Allow organizations to add their own fraud detection rules without modifying the built-in library.

**File**: `custom-rules.json` (example)

```json
{
  "rules": [
    {
      "id": "custom_001",
      "category": "Custom",
      "name": "High-value international wire",
      "description": "Flag any wire transfer over $2,000 to an international destination. Our organization has no legitimate international wire transfer needs.",
      "severity_weight": 5,
      "examples": ["Wire Transfer - Any International Destination over $2,000"]
    },
    {
      "id": "custom_002",
      "category": "Custom",
      "name": "After-hours large transactions",
      "description": "Flag any transaction over $1,000 occurring after 8 PM or before 7 AM. Our account holders are a business that operates 7 AM - 8 PM only.",
      "severity_weight": 3,
      "examples": ["Any transaction > $1,000 between 20:00 and 07:00"]
    }
  ]
}
```

**File**: `src/patterns/custom-loader.ts`

```typescript
import { readFileSync, existsSync } from "fs";
import { z } from "zod";
import { FraudPattern } from "./types";
import { FRAUD_PATTERN_LIBRARY } from "./library";

const CustomRuleSchema = z.object({
  id: z.string().min(1),
  category: z.string().default("Custom"),
  name: z.string().min(1),
  description: z.string().min(10),
  severity_weight: z.number().min(1).max(5),
  examples: z.array(z.string()),
});

const CustomRulesFileSchema = z.object({
  rules: z.array(CustomRuleSchema),
});

export function loadPatternLibrary(customRulesPath: string | null): FraudPattern[] {
  const patterns = [...FRAUD_PATTERN_LIBRARY];

  if (!customRulesPath || !existsSync(customRulesPath)) {
    return patterns;
  }

  try {
    const raw = JSON.parse(readFileSync(customRulesPath, "utf-8"));
    const parsed = CustomRulesFileSchema.parse(raw);
    patterns.push(...parsed.rules);
    console.log(`Loaded ${parsed.rules.length} custom rules from ${customRulesPath}`);
  } catch (err) {
    console.error(`Failed to load custom rules: ${err}`);
    // Continue with built-in patterns only
  }

  return patterns;
}
```

---

## 5. System Prompt Template

The system prompt is dynamically assembled with the pattern library and transaction data injected at runtime.

**File**: `src/prompt.ts`

```typescript
import { FraudPattern, AnonymizedTransaction } from "./patterns/types";

function formatPatternLibrary(patterns: FraudPattern[]): string {
  const byCategory = patterns.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, FraudPattern[]>);

  let output = "";
  for (const [category, pats] of Object.entries(byCategory)) {
    output += `\n### ${category}\n`;
    for (const p of pats) {
      output += `\n**${p.id}: ${p.name}** (severity: ${p.severity_weight}/5)\n`;
      output += `${p.description}\n`;
      if (p.examples.length > 0) {
        output += `Examples: ${p.examples.join("; ")}\n`;
      }
    }
  }
  return output;
}

export function buildSystemPrompt(
  patterns: FraudPattern[],
  threshold: number
): string {
  const patternText = formatPatternLibrary(patterns);

  return `You are a financial fraud detection analyst. You analyze batches of anonymized bank transactions and identify potentially fraudulent activity.

## Your Task
Analyze each transaction in the batch against the Fraud Pattern Library below. For each suspicious transaction, determine:
1. Whether it matches any known fraud patterns
2. A risk_score from 0 to 100 (0 = clearly legitimate, 100 = almost certainly fraud)
3. A concise reason explaining which patterns triggered and why

## Scoring Guidelines
- 0-20: Normal transaction, no concerns
- 21-40: Minor anomaly, worth noting but likely legitimate
- 41-60: Moderate suspicion, one or more soft indicators
- 61-80: High suspicion, multiple indicators or one strong indicator
- 81-100: Critical, strong match to known fraud patterns

Only include transactions with risk_score >= ${threshold}.

## Critical Analysis Rules
1. **Analyze COLLECTIVELY, not individually.** A single $400 ATM withdrawal is normal. Five $400 ATM withdrawals within 30 minutes is a velocity anomaly. You must consider transaction clusters.
2. **Establish a behavioral baseline** from the batch. If most transactions are small POS purchases at US merchants, a large wire to an offshore entity is anomalous by deviation.
3. **The description field is your primary signal.** It contains merchant names, locations, and transaction types. Use it for geographic analysis, merchant category analysis, and counterparty identification.
4. **Use balance_before and balance_after** to detect account draining patterns across the batch chronologically.
5. **Use created_at timestamps** to detect temporal anomalies (odd hours) and velocity anomalies (rapid succession).
6. **Combine signals.** A transaction matching ONE pattern might score 45. A transaction matching THREE patterns (e.g., large amount + odd hour + foreign location) should score 85+.

## Fraud Pattern Library
${patternText}

## Required Output Format
Respond with ONLY a valid JSON array. No markdown fences, no explanation outside the JSON.

If suspicious transactions are found:
[
  {
    "transaction_id": "TXN-XXXXX",
    "risk_score": 85,
    "reason": "amt_001 + geo_001: $7,400 counter withdrawal (35x typical max of $200) at branch with no prior history"
  }
]

If no transactions meet the threshold, return an empty array: []

Reference pattern IDs in your reasons (e.g., "amt_001 + vel_002") so results are traceable to specific detection rules.`;
}

export function buildUserMessage(
  batchId: string,
  userId: string,
  transactions: AnonymizedTransaction[]
): string {
  return `## Transaction Batch for Analysis

Batch ID: ${batchId}
User ID: ${userId}
Transaction Count: ${transactions.length}
Date Range: ${transactions[0]?.created_at || "N/A"} to ${transactions[transactions.length - 1]?.created_at || "N/A"}

## Transactions
${JSON.stringify(transactions, null, 2)}`;
}
```

---

## 6. API Client

HTTP client for the three fraud detection endpoints.

**File**: `src/api-client.ts`

```typescript
import { BatchResponse, FlaggedTransaction } from "./patterns/types";
import { ScanConfig } from "./config";

export class FraudApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ScanConfig) {
    this.baseUrl = config.apiBaseUrl;
    this.apiKey = config.scannerApiKey;
  }

  private headers(): Record<string, string> {
    return {
      "x-scanner-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async fetchBatch(
    userId: string,
    batchSize: number,
    fromDate?: string,
    toDate?: string
  ): Promise<BatchResponse> {
    const params = new URLSearchParams({
      user_id: userId,
      batch_size: String(batchSize),
    });
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);

    const res = await fetch(
      `${this.baseUrl}/api/v1/fraud-detection/batch?${params}`,
      { headers: this.headers() }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Batch fetch failed (${res.status}): ${body.error || res.statusText}`);
    }

    return res.json();
  }

  async submitResults(
    batchId: string,
    flaggedTransactions: FlaggedTransaction[],
    scannerId: string
  ): Promise<{ success: boolean; received: number }> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/fraud-detection/webhook`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          batch_id: batchId,
          flagged_transactions: flaggedTransactions,
          scanner_id: scannerId,
          scanned_at: new Date().toISOString(),
        }),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Webhook submit failed (${res.status}): ${body.error || res.statusText}`);
    }

    return res.json();
  }

  async fetchReport(batchId: string): Promise<unknown> {
    const res = await fetch(
      `${this.baseUrl}/api/v1/fraud-detection/reports?batch_id=${batchId}`,
      { headers: this.headers() }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Report fetch failed (${res.status}): ${body.error || res.statusText}`);
    }

    return res.json();
  }
}
```

---

## 7. Analyzer — Core Agentic Scan Loop

The analyzer calls Claude with the full batch and pattern library, parses the structured JSON response, validates it, and returns flagged transactions.

**File**: `src/analyzer.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { FraudPattern, FlaggedTransaction, AnonymizedTransaction } from "./patterns/types";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

const FlaggedTransactionSchema = z.object({
  transaction_id: z.string(),
  risk_score: z.number().min(0).max(100),
  reason: z.string(),
});

const AnalysisResponseSchema = z.array(FlaggedTransactionSchema);

export class FraudAnalyzer {
  private client: Anthropic;
  private patterns: FraudPattern[];
  private threshold: number;

  constructor(apiKey: string, patterns: FraudPattern[], threshold: number) {
    this.client = new Anthropic({ apiKey });
    this.patterns = patterns;
    this.threshold = threshold;
  }

  async analyze(
    batchId: string,
    userId: string,
    transactions: AnonymizedTransaction[]
  ): Promise<FlaggedTransaction[]> {
    const systemPrompt = buildSystemPrompt(this.patterns, this.threshold);
    const userMessage = buildUserMessage(batchId, userId, transactions);

    // Call Claude
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",  // [TODO: Choose model — sonnet for speed, opus for depth]
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    // Extract text from response
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON response
    let parsed: unknown;
    try {
      // Handle potential markdown fences around JSON
      const jsonStr = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse Claude response as JSON:", text.slice(0, 500));
      return [];
    }

    // Validate with Zod
    const result = AnalysisResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Response validation failed:", result.error.issues);
      return [];
    }

    // Filter to only transactions that exist in the batch
    const validTxnIds = new Set(transactions.map((t) => t.transaction_id));
    const validated = result.data.filter((f) => {
      if (!validTxnIds.has(f.transaction_id)) {
        console.warn(`Ignoring flagged transaction ${f.transaction_id} — not in batch`);
        return false;
      }
      return f.risk_score >= this.threshold;
    });

    return validated;
  }
}
```

### The Complete Scan Function

**File**: `src/index.ts` (scan logic portion)

```typescript
import { ScanConfig } from "./config";
import { FraudApiClient } from "./api-client";
import { FraudAnalyzer } from "./analyzer";
import { FraudPattern } from "./patterns/types";

export interface ScanResult {
  userId: string;
  batchId: string;
  scanned: number;
  flagged: number;
  timestamp: string;
}

export async function runScan(
  userId: string,
  config: ScanConfig,
  apiClient: FraudApiClient,
  analyzer: FraudAnalyzer
): Promise<ScanResult> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Scanning user ${userId}...`);

  // Step 1: Fetch batch
  const batch = await apiClient.fetchBatch(userId, config.batchSize);
  console.log(`  Fetched batch ${batch.batch_id} with ${batch.transaction_count} transactions`);

  if (batch.transactions.length === 0) {
    console.log("  No transactions to analyze");
    return { userId, batchId: batch.batch_id, scanned: 0, flagged: 0, timestamp };
  }

  // Step 2: Analyze with Claude
  const flagged = await analyzer.analyze(batch.batch_id, userId, batch.transactions);
  console.log(`  Claude flagged ${flagged.length} transactions (threshold: ${config.riskThreshold})`);

  if (flagged.length > 0) {
    for (const f of flagged) {
      console.log(`    ${f.transaction_id}: score=${f.risk_score} — ${f.reason}`);
    }
  }

  // Step 3: Submit results via webhook
  const result = await apiClient.submitResults(batch.batch_id, flagged, config.scannerId);
  console.log(`  Webhook response: ${result.received} flagged transactions accepted`);

  return {
    userId,
    batchId: batch.batch_id,
    scanned: batch.transaction_count,
    flagged: flagged.length,
    timestamp,
  };
}
```

---

## 8. Scheduling & Entry Point

**File**: `src/index.ts` (full file)

```typescript
import cron from "node-cron";
import { loadConfig } from "./config";
import { FraudApiClient } from "./api-client";
import { FraudAnalyzer } from "./analyzer";
import { loadPatternLibrary } from "./patterns/custom-loader";
import { runScan, ScanResult } from "./scan"; // Extract runScan to scan.ts if preferred

const config = loadConfig();

// Validate configuration
if (!config.anthropicApiKey) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}
if (!config.scannerApiKey) {
  console.error("FRAUD_SCANNER_API_KEY is required");
  process.exit(1);
}
if (config.userIds.length === 0) {
  console.error("SCAN_USER_IDS is required (comma-separated anonymized user IDs)");
  process.exit(1);
}

// Initialize components
const patterns = loadPatternLibrary(config.customRulesPath);
const apiClient = new FraudApiClient(config);
const analyzer = new FraudAnalyzer(config.anthropicApiKey, patterns, config.riskThreshold);

console.log("=== Agentic Fraud Scanner ===");
console.log(`Scanner ID: ${config.scannerId}`);
console.log(`API Base:   ${config.apiBaseUrl}`);
console.log(`Users:      ${config.userIds.join(", ")}`);
console.log(`Threshold:  ${config.riskThreshold}`);
console.log(`Batch Size: ${config.batchSize}`);
console.log(`Patterns:   ${patterns.length} (${patterns.filter(p => p.category === "Custom").length} custom)`);
console.log();

// Mutex to prevent overlapping scans
let isScanning = false;

async function runAllScans(): Promise<void> {
  if (isScanning) {
    console.log("Previous scan still running, skipping...");
    return;
  }

  isScanning = true;
  const results: ScanResult[] = [];

  try {
    for (const userId of config.userIds) {
      try {
        const result = await runScan(userId, config, apiClient, analyzer);
        results.push(result);
      } catch (err) {
        console.error(`Scan failed for user ${userId}:`, err);
      }
    }

    // Summary
    const totalFlagged = results.reduce((sum, r) => sum + r.flagged, 0);
    const totalScanned = results.reduce((sum, r) => sum + r.scanned, 0);
    console.log(`\nScan complete: ${totalScanned} transactions scanned, ${totalFlagged} flagged across ${results.length} users\n`);
  } finally {
    isScanning = false;
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const isOnce = args.includes("--once");

if (isOnce) {
  // One-shot mode for testing
  console.log("Running one-shot scan...\n");
  runAllScans()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
} else {
  // Scheduled mode
  console.log(`Scheduling scans: ${config.schedule}`);
  console.log("Press Ctrl+C to stop\n");

  // Run immediately on startup
  runAllScans();

  // Schedule recurring scans
  cron.schedule(config.schedule, () => {
    runAllScans();
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down scanner...");
    process.exit(0);
  });
}
```

### Running the Scanner

```bash
# One-shot scan (for testing)
npx tsx src/index.ts --once

# Scheduled mode (uses SCAN_SCHEDULE from .env)
npx tsx src/index.ts

# Override schedule via env
SCAN_SCHEDULE=5min npx tsx src/index.ts
```

### package.json Scripts

```json
{
  "scripts": {
    "scan": "tsx src/index.ts",
    "scan:once": "tsx src/index.ts --once",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

---

## 9. Deployment Options

### Option A: PM2 (Recommended for VMs)

```bash
npm run build
pm2 start dist/index.js --name fraud-scanner
pm2 save
```

### Option B: Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY custom-rules.json ./
CMD ["node", "dist/index.js"]
```

```bash
docker build -t fraud-scanner .
docker run -d --env-file .env --name fraud-scanner fraud-scanner
```

### Option C: OS Cron (one-shot per execution)

```bash
# crontab -e
*/10 * * * * cd /path/to/fraud-scanner && node dist/index.js --once >> /var/log/fraud-scanner.log 2>&1
```

### Option D: Vercel Cron (if integrated into Next.js app)

```typescript
// app/api/cron/fraud-scan/route.ts
// [TODO: Adapt runScan() into a Next.js API route triggered by vercel.json cron config]
```

---

## 10. Expected Output

### One-Shot Scan

```
=== Agentic Fraud Scanner ===
Scanner ID: blue-team-scanner-v1
API Base:   http://localhost:3000
Users:      dab208a0153acc8b
Threshold:  40
Batch Size: 50
Patterns:   18 (0 custom)

Running one-shot scan...

[2026-03-23T14:30:00.000Z] Scanning user dab208a0153acc8b...
  Fetched batch BATCH-2K5F9X with 50 transactions
  Claude flagged 8 transactions (threshold: 40)
    TXN-ABC123: score=92 — amt_001 + geo_001: $7,400 counter withdrawal, 35x typical max
    TXN-DEF456: score=88 — geo_001 + bhv_001: POS purchase in Lagos, Nigeria, no prior intl activity
    TXN-GHI789: score=85 — vel_001: 5 ATM withdrawals of $400 within 30 min at sequential unknown ATMs
    TXN-JKL012: score=82 — mrc_002 + mrc_004 + amt_003: $15,000 wire to Offshore Holdings Ltd, Cayman Islands
    TXN-MNO345: score=78 — mrc_001: $5,200 wire to CryptoMix Exchange
    TXN-PQR678: score=72 — tmp_001 + geo_001: $1,875 purchase in Dubai at 2:30 AM
    TXN-STU901: score=65 — vel_003 + mrc_003: 8 gift card purchases in 2 hours
    TXN-VWX234: score=58 — mrc_002: $6,500 payment to Anonymous Holding LLC
  Webhook response: 8 flagged transactions accepted

Scan complete: 50 transactions scanned, 8 flagged across 1 users
```

---

## Appendix: Adding New Detection Rules

### Via Custom Rules JSON

1. Edit `custom-rules.json`
2. Add a new rule object following the schema
3. Restart the scanner — new rules are loaded on startup

### Via Built-in Library

1. Edit `src/patterns/library.ts`
2. Add a new `FraudPattern` object to the array
3. Use a unique `id` with your category prefix (e.g., `mrc_005` for a new merchant pattern)
4. Write a detailed `description` — this is what Claude reads, so be specific and give examples
5. Rebuild and restart

### Writing Good Pattern Descriptions

The `description` field is the most important part of each pattern. Claude uses it directly for reasoning. Good descriptions:

- **Explain what to look for** in concrete terms, not abstract concepts
- **Include thresholds** ("3x the typical maximum", "5+ within 30 minutes")
- **Explain why it's suspicious** so Claude can weigh signals appropriately
- **Mention which transaction fields** to examine (description, amount, created_at, balance_before/after)
- **Give context** about the fraud mechanism (e.g., why gift cards are used for laundering)
