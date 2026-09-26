-- ==============================================================================
-- Migration: 0005_commitments.sql
-- Module 5: Goals, Liabilities, Recurring Transactions & Reconciliation
-- ==============================================================================

-- 1. Goals (milestones dynamically linked to bucket balances)
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  target_date TEXT,
  linked_bucket_id INTEGER REFERENCES allocation_buckets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_linked_bucket ON goals(linked_bucket_id);

-- 2. Liabilities (debt tracking and amortization)
CREATE TABLE IF NOT EXISTS liabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- loan, credit facility, personal debt, mortgage
  principal REAL NOT NULL,
  current_balance REAL NOT NULL,
  interest_rate REAL,
  minimum_payment REAL,
  due_date TEXT,
  lender TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Recurring Transactions (commitments scanner & due date tracking)
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  bucket_id INTEGER REFERENCES allocation_buckets(id),
  account_id INTEGER REFERENCES accounts(id),
  direction TEXT NOT NULL,         -- 'inflow' | 'outflow'
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  frequency TEXT NOT NULL,         -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  next_due_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_transactions(active, next_due_date);
