# Transaction Curl Commands for Postman / External Testing

**Base URL:** `http://localhost:3000`

> These hit `POST /api/transactions` which requires auth. In dev mode, auth is automatic.
> Replace `<CHECKING_ACCOUNT_ID>` and `<SAVINGS_ACCOUNT_ID>` with the real UUIDs from your seed output.

---

## 10 Normal (Good) Transactions

### 1. Payroll Direct Deposit
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "deposit",
    "amount": 3150.00,
    "description": "Direct Deposit - Payroll - TechCorp Inc"
  }' | jq .
```

### 2. Rent Payment
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 1450.00,
    "description": "Rent Payment - Oakwood Apartments"
  }' | jq .
```

### 3. Grocery Shopping
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 87.43,
    "description": "POS Purchase - Whole Foods Market"
  }' | jq .
```

### 4. Electric Utility Bill
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 142.67,
    "description": "Utility Payment - ConEd Electric"
  }' | jq .
```

### 5. Netflix Subscription
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 15.99,
    "description": "Recurring - Netflix"
  }' | jq .
```

### 6. Gas Station Fill-Up
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 52.30,
    "description": "POS Purchase - Shell Gas Station"
  }' | jq .
```

### 7. ATM Withdrawal
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 80.00,
    "description": "ATM Withdrawal - Chase ATM #4521"
  }' | jq .
```

### 8. Restaurant Lunch
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 34.50,
    "description": "POS Purchase - Chipotle Mexican Grill"
  }' | jq .
```

### 9. Transfer to Savings
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "transfer_out",
    "amount": 350.00,
    "description": "Monthly Transfer to Savings",
    "counterparty_account_id": "<SAVINGS_ACCOUNT_ID>"
  }' | jq .
```

### 10. Coffee Shop
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 6.75,
    "description": "POS Purchase - Starbucks #1142"
  }' | jq .
```

---

## 10 Suspicious / Fraudulent Transactions

### 11. Unusually Large Withdrawal
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 8750.00,
    "description": "Counter Withdrawal - Branch #9912"
  }' | jq .
```

### 12. Wire to Offshore Account
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 15000.00,
    "description": "Wire Transfer - Offshore Holdings Ltd - Cayman Islands"
  }' | jq .
```

### 13. Crypto Exchange Transfer
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 5200.00,
    "description": "Wire Transfer - CryptoMix Exchange"
  }' | jq .
```

### 14. Foreign POS - Geographic Anomaly
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 2340.00,
    "description": "POS Purchase - Electronics Mega Store - Lagos, Nigeria"
  }' | jq .
```

### 15. Suspicious Shell Company
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 6500.00,
    "description": "Payment - Anonymous Holding LLC"
  }' | jq .
```

### 16. Rapid ATM Withdrawal #1 (part of velocity cluster)
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 400.00,
    "description": "ATM Withdrawal - Unknown ATM #8800"
  }' | jq .
```

### 17. Rapid ATM Withdrawal #2 (part of velocity cluster)
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 400.00,
    "description": "ATM Withdrawal - Unknown ATM #8801"
  }' | jq .
```

### 18. Gift Card Velocity - Structuring Pattern
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 24.99,
    "description": "POS Purchase - Gift Card Kiosk A"
  }' | jq .
```

### 19. Late-Night Foreign Purchase
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 1875.00,
    "description": "Online Purchase - ElectroMart - Dubai, UAE"
  }' | jq .
```

### 20. Luxury Goods - Foreign Location
```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<CHECKING_ACCOUNT_ID>",
    "type": "withdrawal",
    "amount": 3200.00,
    "description": "POS Purchase - Luxury Goods - Bangkok, Thailand"
  }' | jq .
```

---

## Quick Reference: Why Each Fraudulent Transaction is Suspicious

| # | Signal | Red Flags |
|---|---|---|
| 11 | Large withdrawal | $8,750 — far exceeds normal withdrawal pattern ($40-$200) |
| 12 | Offshore wire | $15,000 round number to Cayman Islands |
| 13 | Crypto exchange | $5,200 to unregulated exchange |
| 14 | Geographic anomaly | Lagos, Nigeria — no prior international transactions |
| 15 | Shell company | $6,500 to "Anonymous Holding LLC" |
| 16 | Velocity / rapid ATM | $400 from unknown ATM — part of rapid cluster |
| 17 | Velocity / rapid ATM | $400 from different unknown ATM — within minutes of #16 |
| 18 | Gift card structuring | Small gift card purchases — often used to launder funds |
| 19 | Late-night + foreign | $1,875 foreign online purchase (would be ~3 AM local time) |
| 20 | Foreign luxury goods | $3,200 in Bangkok — geographic anomaly + high value |
