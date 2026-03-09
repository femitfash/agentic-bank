-- ============================================================================
-- Agentic Bank — Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- 1. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 2. Users (references auth.users)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'teller' check (role in ('owner', 'admin', 'teller')),
  created_at timestamptz default now()
);

-- 3. Customers
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id text unique not null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address jsonb default '{}'::jsonb,
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'verified', 'rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_customers_org on customers(organization_id);
create index if not exists idx_customers_email on customers(email);
create index if not exists idx_customers_name on customers(organization_id, last_name, first_name);

-- 4. Accounts
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  account_id text unique not null,
  customer_id uuid not null references customers(id) on delete cascade,
  account_number text unique not null,
  account_type text not null check (account_type in ('checking', 'savings')),
  balance numeric(15, 2) not null default 0.00,
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_accounts_org on accounts(organization_id);
create index if not exists idx_accounts_customer on accounts(customer_id);
create index if not exists idx_accounts_number on accounts(account_number);

-- 5. Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  transaction_id text unique not null,
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'transfer_out', 'transfer_in')),
  amount numeric(15, 2) not null check (amount > 0),
  balance_before numeric(15, 2) not null,
  balance_after numeric(15, 2) not null,
  counterparty_account_id uuid references accounts(id),
  reference text not null,
  description text default '',
  status text not null default 'completed' check (status in ('completed', 'failed', 'reversed')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_transactions_org on transactions(organization_id);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_date on transactions(created_at desc);
create index if not exists idx_transactions_reference on transactions(reference);

-- 6. Audit Log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_org on audit_log(organization_id);
create index if not exists idx_audit_log_entity on audit_log(entity_type, entity_id);

-- 7. Stored procedure for audit logging
create or replace function insert_audit_log(
  p_org_id uuid,
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_old_values jsonb default null,
  p_new_values jsonb default null
) returns void as $$
begin
  insert into audit_log (organization_id, user_id, action, entity_type, entity_id, old_values, new_values)
  values (p_org_id, p_user_id, p_action, p_entity_type, p_entity_id, p_old_values, p_new_values);
end;
$$ language plpgsql security definer;

-- 8. Auto-update updated_at triggers
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function update_updated_at();

create trigger trg_accounts_updated_at
  before update on accounts
  for each row execute function update_updated_at();
