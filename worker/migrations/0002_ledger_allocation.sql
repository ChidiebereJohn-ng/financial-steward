-- Migration 0002: Ledger + Allocation Engine
-- Core ledger tables: transactions, allocation_runs, bucket_ledger_entries, bucket_transfers, transaction_audit_log

-- 1. Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,                -- source system ID (e.g. WealthVault), for dedupe
  date TEXT NOT NULL,
  direction TEXT NOT NULL,         -- 'inflow' | 'outflow'
  subtype TEXT,                    -- NULL | 'bucket_deploy' | 'bucket_transfer'
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  category_id INTEGER REFERENCES categories(id),
  account_id INTEGER REFERENCES accounts(id),
  income_source_id INTEGER REFERENCES income_sources(id), -- inflow only
  note TEXT,
  purpose_label TEXT,              -- required when category = 'other' or subtype = 'bucket_deploy'
  allocation_rule_version INTEGER, -- which rule version applied (inflow only, if not overridden)
  is_override INTEGER NOT NULL DEFAULT 0, -- 1 if this inflow used a custom one-off split
  attachment_url TEXT,             -- optional, R2 object URL (deferred feature — column reserved)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(external_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- 2. Allocation Runs
-- One row per bucket per inflow: the actual applied split (standing rule OR override)
CREATE TABLE IF NOT EXISTS allocation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  bucket_id INTEGER NOT NULL REFERENCES allocation_buckets(id),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_allocation_runs_tx ON allocation_runs(transaction_id);

-- 3. Bucket Ledger Entries
-- Append-only. Every credit, debit, and transfer against a bucket. Source of truth for "available funds."
CREATE TABLE IF NOT EXISTS bucket_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_id INTEGER NOT NULL REFERENCES allocation_buckets(id),
  transaction_id INTEGER REFERENCES transactions(id), -- NULL for manual adjustments
  entry_type TEXT NOT NULL,        -- 'allocation_credit' | 'expense_debit' | 'transfer_in' | 'transfer_out' | 'manual_adjustment'
  amount REAL NOT NULL,            -- always positive; entry_type determines credit/debit direction (manual_adjustment can be signed or positive)
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bucket_ledger_bucket ON bucket_ledger_entries(bucket_id);
CREATE INDEX IF NOT EXISTS idx_bucket_ledger_transaction ON bucket_ledger_entries(transaction_id);

-- 4. Bucket Transfers
-- Explicit record of a bucket-to-bucket movement (links the two ledger entries)
CREATE TABLE IF NOT EXISTS bucket_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_bucket_id INTEGER NOT NULL REFERENCES allocation_buckets(id),
  to_bucket_id INTEGER NOT NULL REFERENCES allocation_buckets(id),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  reason TEXT,
  from_ledger_entry_id INTEGER REFERENCES bucket_ledger_entries(id),
  to_ledger_entry_id INTEGER REFERENCES bucket_ledger_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bucket_transfers_date ON bucket_transfers(date);

-- 5. Transaction Audit Log
-- Audit trail for edits to a transaction (preserves "perfect, structured record")
CREATE TABLE IF NOT EXISTS transaction_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  changed_field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_transaction ON transaction_audit_log(transaction_id);
