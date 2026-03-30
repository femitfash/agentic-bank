-- Ground Truth table for fraud validation
-- Stores known fraudulent transaction IDs so the feedback API
-- can provide ground truth without requiring fraud_ids in the request.

create table if not exists fraud_ground_truth (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  transaction_id text not null,
  is_fraud boolean not null default true,
  note text,
  created_at timestamptz default now(),
  unique(organization_id, transaction_id)
);

create index if not exists idx_ground_truth_org on fraud_ground_truth(organization_id);
create index if not exists idx_ground_truth_txn on fraud_ground_truth(transaction_id);
