-- Fraud Detection Simulation Tables
-- Run this migration in Supabase SQL Editor

-- Tracks each batch of transactions sent to fraud scanners
create table if not exists fraud_scan_batches (
  id uuid primary key default gen_random_uuid(),
  batch_id text unique not null,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id text not null,
  transaction_count integer not null default 0,
  first_txn_at timestamptz,
  last_txn_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'scanned', 'reviewed')),
  created_at timestamptz default now()
);

create index if not exists idx_fraud_batches_org on fraud_scan_batches(organization_id);
create index if not exists idx_fraud_batches_user on fraud_scan_batches(user_id);
create index if not exists idx_fraud_batches_status on fraud_scan_batches(status);

-- Individual flagged transactions from scanner reports
create table if not exists fraud_scan_results (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null references fraud_scan_batches(batch_id) on delete cascade,
  transaction_id text not null,
  risk_score numeric(5,2) not null check (risk_score >= 0 and risk_score <= 100),
  reason text not null,
  scanner_id text not null,
  scanned_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_fraud_results_batch on fraud_scan_results(batch_id);
create index if not exists idx_fraud_results_txn on fraud_scan_results(transaction_id);
create index if not exists idx_fraud_results_score on fraud_scan_results(risk_score desc);
