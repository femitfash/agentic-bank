-- Add metadata JSONB column to transactions table
-- Run this in Supabase SQL Editor after the initial migration
--
-- Stores PCI-DSS compliant transaction context:
-- NO raw card numbers, CVV, full track data, or PIN blocks
-- YES to: IP, device, geo, channel, MCC, auth method, risk signals

alter table transactions
  add column if not exists metadata jsonb default '{}'::jsonb;

-- Index for querying by channel or country
create index if not exists idx_transactions_metadata_channel
  on transactions ((metadata->>'channel'));
create index if not exists idx_transactions_metadata_country
  on transactions ((metadata->>'country'));

comment on column transactions.metadata is
'PCI-DSS compliant transaction context. Fields:
  - ip_address: originating IP (IPv4/IPv6)
  - device_id: hashed device fingerprint
  - device_type: mobile | desktop | atm | pos_terminal | branch_teller
  - user_agent: browser/app user agent string
  - channel: online_banking | mobile_app | atm | pos | wire | branch | ach
  - location: { city, region, country, lat, lng }
  - country: ISO 3166-1 alpha-2 country code
  - mcc: ISO 18245 merchant category code (4-digit)
  - mcc_description: human-readable MCC label
  - auth_method: password | biometric | pin | chip | contactless | none
  - is_international: boolean
  - is_recurring: boolean
  - risk_signals: { vpn_detected, tor_detected, new_device, unusual_location, velocity_flag }
  - session_id: hashed session identifier
  - terminal_id: POS/ATM terminal identifier
';
