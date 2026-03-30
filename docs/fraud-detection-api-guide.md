# Fraud Detection API — Developer Guide

## Quick Start

**Base URL:** `http://localhost:3000`
**Auth Header:** `x-scanner-api-key: fraud-sim-key-2026`

> After running the seed (Settings page or `npm run seed:fraud`), note the **anonymized user ID** from the output. Replace `<ANON_USER_ID>` below with that value.

---

## Endpoints

### 1. Fetch Transaction Batch

Retrieve anonymized transactions for scanning.

```bash
# First call — get the oldest transactions
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3030/api/v1/fraud-detection/batch?user_id=<ANON_USER_ID>&batch_size=50" \
  | jq .

# Subsequent calls — pass cursor from previous response to get the NEXT page
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3030/api/v1/fraud-detection/batch?user_id=<ANON_USER_ID>&batch_size=50&cursor=2026-02-14T23:34:32%2B00:00" \
  | jq .
```

**Response shape:**
```json
{
  "batch_id": "BATCH-XXXXX",
  "user_id": "<ANON_USER_ID>",
  "transaction_count": 50,
  "has_more": true,
  "next_cursor": "2026-02-14T23:34:32+00:00",
  "transactions": [
    {
      "transaction_id": "TXN-XXXXX",
      "type": "deposit|withdrawal|transfer_out|transfer_in",
      "amount": 3050.00,
      "balance_before": 5200.00,
      "balance_after": 8250.00,
      "account_id": "a1b2c3d4e5f6...",
      "counterparty_account_id": null,
      "description": "Direct Deposit - Payroll - TechCorp Inc",
      "status": "completed",
      "created_at": "2026-01-23T08:00:12Z",
      "metadata": {
        "ip_hash": "73.192.x.a3f1",
        "device_id": "d8f4a2b1c9e7abc1",
        "device_type": "mobile|desktop|atm|pos_terminal|branch_teller",
        "user_agent": "Mozilla/5.0 (iPhone; ...) AgenticBank/3.2.1",
        "channel": "online_banking|mobile_app|atm|pos|wire|branch|ach",
        "location": { "city": "New York", "region": "NY", "country": "US", "lat": 40.71, "lng": -74.01 },
        "country": "US",
        "mcc": "5411",
        "mcc_description": "Grocery Stores",
        "auth_method": "password|biometric|pin|chip|contactless|none",
        "is_international": false,
        "is_recurring": false,
        "risk_signals": {
          "vpn_detected": false,
          "tor_detected": false,
          "new_device": false,
          "unusual_location": false,
          "velocity_flag": false
        },
        "session_id": "a8b2c4d1e5f6...",
        "terminal_id": "POS-12345"
      }
    }
  ],
  "webhook_url": "http://localhost:3030/api/v1/fraud-detection/webhook",
  "created_at": "2026-03-23T..."
}
```

**Query Parameters:**
| Param | Required | Default | Description |
|---|---|---|---|
| `user_id` | Yes | — | Anonymized user ID (SHA-256 hash) |
| `batch_size` | No | 50 | Max transactions per batch (max 200) |
| `cursor` | No | — | ISO timestamp from previous `next_cursor` — returns transactions AFTER this time |
| `from_date` | No | — | ISO date, inclusive lower bound (use `cursor` instead for pagination) |
| `to_date` | No | — | ISO date, inclusive upper bound |

**Pagination flow:**
1. First call: omit `cursor` → returns the oldest `batch_size` transactions
2. Check `has_more` in response — if `true`, more transactions exist
3. Next call: pass `cursor=<next_cursor from previous response>` → returns the next page
4. Repeat until `has_more` is `false` or `transaction_count` is `0`

**Transaction Metadata Fields (PCI-DSS compliant):**

Each transaction includes a `metadata` object with context useful for fraud detection. No raw card numbers, CVV, PINs, or full track data are ever included.

| Field | Type | Description | Fraud Detection Use |
|---|---|---|---|
| `ip_hash` | string | Partially hashed IP (preserves network prefix) | Geo-mismatch, VPN/proxy detection |
| `device_id` | string | Hashed device fingerprint | New/unknown device detection |
| `device_type` | string | `mobile`, `desktop`, `atm`, `pos_terminal`, `branch_teller` | Channel consistency checks |
| `user_agent` | string | Browser/app user agent string | Bot detection, device spoofing |
| `channel` | string | `online_banking`, `mobile_app`, `atm`, `pos`, `wire`, `branch`, `ach` | Unusual channel for user |
| `location` | object | `{ city, region, country, lat, lng }` | Geographic anomalies, impossible travel |
| `country` | string | ISO 3166-1 alpha-2 (e.g., "US", "NG", "KY") | International transaction flag |
| `mcc` | string | 4-digit Merchant Category Code (ISO 18245) | High-risk MCC detection (6051=crypto, 5994=gift cards) |
| `mcc_description` | string | Human-readable MCC label | Pattern analysis |
| `auth_method` | string | `password`, `biometric`, `pin`, `chip`, `contactless`, `none` | Weak auth on high-value txn |
| `is_international` | boolean | Whether transaction crosses borders | Cross-border risk scoring |
| `is_recurring` | boolean | Whether this is a known recurring payment | Deviation from recurring pattern |
| `risk_signals` | object | Pre-computed risk indicators (see below) | Direct risk input |
| `session_id` | string | Hashed session identifier | Session hijacking detection |
| `terminal_id` | string? | POS/ATM terminal ID (null for online) | Cloned terminal detection |

**risk_signals sub-fields:**

| Signal | Type | Description |
|---|---|---|
| `vpn_detected` | boolean | Connection routed through known VPN |
| `tor_detected` | boolean | Connection from Tor exit node |
| `new_device` | boolean | Device not seen in user's history |
| `unusual_location` | boolean | Location inconsistent with user's profile |
| `velocity_flag` | boolean | Transaction frequency exceeds baseline |

---

### 2. Submit Scan Results (Webhook)

Post flagged transactions back after running your detection.

```bash
curl -s -X POST \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "batch_id": "<BATCH_ID_FROM_STEP_1>",
    "flagged_transactions": [
      {
        "transaction_id": "TXN-XXXXX",
        "risk_score": 92.5,
        "reason": "Large withdrawal outside normal pattern - $7,400 vs avg $85"
      },
      {
        "transaction_id": "TXN-YYYYY",
        "risk_score": 88.0,
        "reason": "Geographic anomaly - Lagos, Nigeria - no prior international activity"
      }
    ],
    "scanner_id": "blue-team-scanner-v1",
    "scanned_at": "2026-03-23T12:00:00Z"
  }' \
  "http://localhost:3000/api/v1/fraud-detection/webhook" \
  | jq .
```

**Request Body:**
| Field | Type | Description |
|---|---|---|
| `batch_id` | string | From the batch response |
| `flagged_transactions` | array | Transactions with risk assessments |
| `flagged_transactions[].transaction_id` | string | The `TXN-xxx` ID from batch data |
| `flagged_transactions[].risk_score` | number | 0-100 (higher = more suspicious) |
| `flagged_transactions[].reason` | string | Human-readable explanation |
| `scanner_id` | string | Identifier for your scanner instance |
| `scanned_at` | string | ISO 8601 timestamp of scan completion |

**Response:** `{ "success": true, "batch_id": "...", "received": 2 }`

---

### 3. View Reports

```bash
# List all batches
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3000/api/v1/fraud-detection/reports?user_id=<ANON_USER_ID>" \
  | jq .

# Get specific batch with full results
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3000/api/v1/fraud-detection/reports?batch_id=<BATCH_ID>" \
  | jq .

# Filter by status
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3000/api/v1/fraud-detection/reports?status=scanned" \
  | jq .
```

---

### 4. Feedback for Reinforcement Learning

Get validation feedback on your scan results — which transactions you correctly detected, missed, or falsely flagged. Use this to improve your detection model.

```bash
# Get all feedback (detected + missed + false positives)
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3030/api/v1/fraud-detection/feedback?fraud_ids=TXN-AAA,TXN-BBB,TXN-CCC" \
  | jq .

# Get only missed transactions (what you should have caught)
## Recommended: Auto ground truth (batch_id only)
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3030/api/v1/fraud-detection/feedback?batch_id=BATCH-XXXX" \
  | jq .

# Filter by status
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3030/api/v1/fraud-detection/feedback?batch_id=BATCH-XXXX&status=missed" \
  | jq .

# Legacy: manually provide fraud IDs (still supported)
curl -s \
  -H "x-scanner-api-key: fraud-sim-key-2026" \
  "http://localhost:3030/api/v1/fraud-detection/feedback?fraud_ids=TXN-AAA,TXN-BBB,TXN-CCC" \
  | jq .
```

**Query Parameters:**
| Param | Required | Description |
|---|---|---|
| `batch_id` | Yes* | Scanner batch ID — ground truth is loaded automatically from bank DB |
| `status` | No | Filter: `detected`, `missed`, or `false_positive` |
| `fraud_ids` | No* | Legacy: comma-separated ground truth IDs (overrides DB lookup) |
| `fraud_notes` | No | Legacy: URL-encoded JSON `{"TXN-XXX": "reason..."}` |

\* Either `batch_id` or `fraud_ids` must be provided. `batch_id` is recommended — it loads ground truth automatically.

**Response:**
```json
{
  "feedback": [
    {
      "transaction_id": "TXN-AAA",
      "status": "missed",
      "type": "withdrawal",
      "amount": 7400,
      "description": "Counter Withdrawal - Branch #9912",
      "created_at": "2026-02-07T14:23:00Z",
      "is_ground_truth_fraud": true,
      "ground_truth_note": "Large unusual withdrawal — $4K-$9.5K vs normal max ~$200",
      "scanner_flagged": false,
      "scanner_risk_score": null,
      "scanner_reason": null,
      "scanner_batch_id": null
    },
    {
      "transaction_id": "TXN-BBB",
      "status": "detected",
      "type": "withdrawal",
      "amount": 15000,
      "description": "Wire Transfer - Offshore Holdings Ltd - Cayman Islands",
      "created_at": "2026-03-08T15:42:00Z",
      "is_ground_truth_fraud": true,
      "ground_truth_note": "Round-number offshore wire — $15,000 to Cayman Islands",
      "scanner_flagged": true,
      "scanner_risk_score": 92.5,
      "scanner_reason": "amt_003 + mrc_004: Round $15K wire to offshore jurisdiction",
      "scanner_batch_id": "BATCH-XXXX"
    }
  ],
  "total": 2,
  "summary": {
    "ground_truth_count": 27,
    "detected": 1,
    "missed": 1,
    "false_positives": 0,
    "detection_rate": 50,
    "precision": 100
  }
}
```

**Reinforcement learning usage:**
1. After each scan, call `GET /feedback?batch_id=BATCH-XXXX` — ground truth is provided automatically
2. Use `is_ground_truth_fraud` and `ground_truth_note` to understand what each transaction actually was
3. Filter by `status=missed` to find transactions your model failed to catch
4. Analyze `ground_truth_note` for the specific fraud pattern (e.g., "offshore wire", "velocity attack")
5. Feed these labeled examples back into your model's training data or adjust detection rules
6. Use the `summary` to track detection rate and precision over time

---

## Scanner Agent Workflow

```
1. GET  /batch?user_id=X&batch_size=50       → receive first page of transactions + batch_id + next_cursor
2. (if has_more) GET /batch?...&cursor=<next_cursor>  → get next page (creates new batch_id)
3. Run fraud detection logic on each batch
4. POST /webhook                              → submit flagged transactions with risk scores
4. GET  /reports?batch_id=X               → verify results were stored
5. GET  /feedback?fraud_ids=X,Y,Z         → get reinforcement learning feedback
6. Repeat on schedule (e.g. every 15 min)
```

---

## Environment Variables

Add these to `.env.local` (already added by seed setup):

```
FRAUD_SCANNER_API_KEY=fraud-sim-key-2026
FRAUD_ANON_SALT=agentic-bank-anon-salt
```

---

## What the Anonymized Data Looks Like

The API **keeps** (useful for detection):
- Transaction amounts, balances
- Transaction type (deposit/withdrawal/transfer)
- Description (merchant names, locations)
- Timestamps (temporal patterns)
- Transaction ID (for correlation in webhook)
- **Metadata** — full transaction context (see fields table above):
  - IP hash (network prefix preserved), device fingerprint, user agent
  - Channel (ATM/POS/online/wire), auth method (PIN/chip/biometric)
  - Geolocation (city, country, lat/lng), MCC code + description
  - Risk signals (VPN, Tor, new device, unusual location, velocity)
  - Session ID, terminal ID

The API **removes/pseudonymizes** (PCI-DSS compliant):
- Real account UUIDs → SHA-256 hashed pseudonyms
- Customer names, emails, phone → completely removed
- Organization ID → removed
- Internal reference codes → removed
- Raw IP addresses → partially hashed (network prefix kept, host hashed)
- Device IDs, session IDs → hashed pseudonyms
- **Never included**: card numbers, CVV, PIN, full track data, magnetic stripe data

---

## Testing Your Scanner

The seed data contains a mix of normal and suspicious transactions. Use the **Feedback API** (endpoint #4 above) after each scan to measure your detection accuracy and identify missed patterns. Ground truth details are available to bank admins only via the Fraud Validation dashboard.
