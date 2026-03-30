import crypto from "crypto";

const ANON_SALT = process.env.FRAUD_ANON_SALT || "agentic-bank-anon-salt";

/**
 * Deterministic pseudonymization — same input always produces the same output
 * so scanners can correlate across batches.
 */
export function pseudonymizeId(realId: string): string {
  return crypto.createHash("sha256").update(realId + ANON_SALT).digest("hex").slice(0, 16);
}

function hashIp(ip: string): string {
  // Preserve network prefix for geographic analysis, hash the host part
  const parts = ip.split(".");
  if (parts.length === 4) {
    const hostHash = crypto.createHash("sha256").update(parts[2] + "." + parts[3] + ANON_SALT).digest("hex").slice(0, 4);
    return `${parts[0]}.${parts[1]}.x.${hostHash}`;
  }
  return crypto.createHash("sha256").update(ip + ANON_SALT).digest("hex").slice(0, 12);
}

export interface AnonymizedMetadata {
  ip_hash: string;
  device_id: string;
  device_type: string;
  user_agent: string;
  channel: string;
  location: { city: string; region: string; country: string; lat: number; lng: number };
  country: string;
  mcc: string;
  mcc_description: string;
  auth_method: string;
  is_international: boolean;
  is_recurring: boolean;
  risk_signals: { vpn_detected: boolean; tor_detected: boolean; new_device: boolean; unusual_location: boolean; velocity_flag: boolean };
  session_id: string;
  terminal_id: string | null;
}

export interface AnonymizedTransaction {
  transaction_id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  account_id: string;
  counterparty_account_id: string | null;
  description: string;
  status: string;
  created_at: string;
  metadata: AnonymizedMetadata | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function anonymizeTransaction(txn: Record<string, any>): AnonymizedTransaction {
  let metadata: AnonymizedMetadata | null = null;

  if (txn.metadata && typeof txn.metadata === "object") {
    const m = txn.metadata;
    metadata = {
      ip_hash: m.ip_address ? hashIp(m.ip_address) : "",
      device_id: m.device_id ? pseudonymizeId(m.device_id) : "",
      device_type: m.device_type || "",
      user_agent: m.user_agent || "",
      channel: m.channel || "",
      location: m.location || null,
      country: m.country || "",
      mcc: m.mcc || "",
      mcc_description: m.mcc_description || "",
      auth_method: m.auth_method || "",
      is_international: !!m.is_international,
      is_recurring: !!m.is_recurring,
      risk_signals: m.risk_signals || {},
      session_id: m.session_id ? pseudonymizeId(m.session_id) : "",
      terminal_id: m.terminal_id || null,
    };
  }

  return {
    transaction_id: txn.transaction_id,
    type: txn.type,
    amount: Number(txn.amount),
    balance_before: Number(txn.balance_before),
    balance_after: Number(txn.balance_after),
    account_id: pseudonymizeId(txn.account_id),
    counterparty_account_id: txn.counterparty_account_id
      ? pseudonymizeId(txn.counterparty_account_id)
      : null,
    description: txn.description,
    status: txn.status,
    created_at: txn.created_at,
    metadata,
  };
}
