-- Add time range columns to fraud_scan_batches
-- This enables accurate batch scope reconstruction for validation
-- Run this in Supabase SQL Editor

ALTER TABLE fraud_scan_batches
  ADD COLUMN IF NOT EXISTS first_txn_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_txn_at timestamptz;
