# Database Schema — Cloudflare D1 (SQLite)

All tables use `id INTEGER PRIMARY KEY AUTOINCREMENT` unless noted. Timestamps are ISO 8601 strings. Amounts are stored as REAL (or INTEGER minor units if you prefer fixed-point — pick one convention and apply it everywhere).

## Reference / configuration tables

```sql
CREATE TABLE allocation_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,        -- 'tithe','kingdom','savings','invest','charity','expense'
  name TEXT NOT NULL,
  is_pass_through INTEGER NOT NULL DEFAULT 0, -- 1 for tithe/kingdom (released immediately, not held)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE allocation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  tithe_pct REAL NOT NULL,
  kingdom_pct REAL NOT NULL,
  savings_pct REAL NOT NULL,       -- % of remainder after tithe+kingdom
  invest_pct REAL NOT NULL,
  charity_pct REAL NOT NULL,
  expense_pct REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,               -- NULL = current
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  default_bucket_id INTEGER REFERENCES allocation_buckets(id), -- NULL if bucket is chosen per-transaction (e.g. Seed)
  bucket_is_flexible INTEGER NOT NULL DEFAULT 0, -- 1 for categories like Seed
  type TEXT NOT NULL DEFAULT 'expense', -- 'expense' | 'income'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,       -- Salary, Portfolio Income, Business Revenue, Gift, Other
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- bank, wallet, brokerage, crypto_wallet
  currency TEXT NOT NULL DEFAULT 'NGN',
  institution TEXT,
  last_reconciled_balance REAL,
  last_reconciled_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Ledger core

```sql
CREATE TABLE transactions (
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

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);

-- One row per bucket per inflow: the actual applied split (standing rule OR override)
CREATE TABLE allocation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  bucket_id INTEGER NOT NULL REFERENCES allocation_buckets(id),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only. Every credit, debit, and transfer against a bucket. Source of truth for "available funds."
CREATE TABLE bucket_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_id INTEGER NOT NULL REFERENCES allocation_buckets(id),
  transaction_id INTEGER REFERENCES transactions(id), -- NULL for manual adjustments
  entry_type TEXT NOT NULL,        -- 'allocation_credit' | 'expense_debit' | 'transfer_in' | 'transfer_out' | 'manual_adjustment'
  amount REAL NOT NULL,            -- always positive; entry_type determines credit/debit direction
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bucket_ledger_bucket ON bucket_ledger_entries(bucket_id);

-- Explicit record of a bucket-to-bucket movement (links the two ledger entries)
CREATE TABLE bucket_transfers (
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

-- Audit trail for edits to a transaction (preserves "perfect, structured record")
CREATE TABLE transaction_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  changed_field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Budgeting, goals, liabilities

```sql
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,             -- 'YYYY-MM'
  category_id INTEGER NOT NULL REFERENCES categories(id),
  planned_amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month, category_id)
);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  target_date TEXT,
  linked_bucket_id INTEGER REFERENCES allocation_buckets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE liabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- loan, credit facility, personal debt
  principal REAL NOT NULL,
  current_balance REAL NOT NULL,
  interest_rate REAL,
  minimum_payment REAL,
  due_date TEXT,
  lender TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE recurring_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  bucket_id INTEGER REFERENCES allocation_buckets(id),
  direction TEXT NOT NULL,
  amount REAL NOT NULL,
  frequency TEXT NOT NULL,         -- weekly, monthly, quarterly, yearly
  next_due_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Net worth, FX, reconciliation

```sql
CREATE TABLE net_worth_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  total_assets REAL NOT NULL,
  total_liabilities REAL NOT NULL,
  net_worth REAL NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE fx_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, from_currency, to_currency)
);
```

## Investor module

```sql
CREATE TABLE investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- equity, mutual_fund, treasury_bill, crypto
  symbol_or_name TEXT NOT NULL,
  market TEXT,                     -- NGX, global, crypto
  quantity REAL,
  cost_basis REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  current_value REAL,
  strategy_id INTEGER REFERENCES strategies(id),
  account_id INTEGER REFERENCES accounts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE investment_price_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investment_id INTEGER NOT NULL REFERENCES investments(id),
  date TEXT NOT NULL,
  price REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'api'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE strategy_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id),
  stage_order INTEGER NOT NULL,
  asset_type TEXT NOT NULL,        -- mutual_fund, treasury_bill, etc.
  duration_months INTEGER NOT NULL,
  expected_return_pct REAL NOT NULL
);
```

## Purchase calculator, digest, imports

```sql
CREATE TABLE purchase_calculations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  cost REAL NOT NULL,
  net_worth_at_time REAL NOT NULL,
  ratio_pct REAL NOT NULL,
  tier_result TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE digest_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  read_status INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL,            -- pending, completed, failed
  error_log TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Precomputed aggregates (performance)

```sql
CREATE TABLE monthly_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,             -- 'YYYY-MM'
  category_id INTEGER REFERENCES categories(id),
  bucket_id INTEGER REFERENCES allocation_buckets(id),
  total_amount REAL NOT NULL,
  refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month, category_id, bucket_id)
);
```
Refreshed by a Cron Trigger — dashboards read from this table, not raw `transactions`, for speed.

## Seed data (initial rows)

```sql
INSERT INTO allocation_buckets (key, name, is_pass_through) VALUES
  ('tithe', 'Tithe', 1),
  ('kingdom', 'Kingdom Investment', 1),
  ('savings', 'Savings', 0),
  ('invest', 'Investment', 0),
  ('charity', 'Charity', 0),
  ('expense', 'Expenses', 0);

INSERT INTO allocation_rules (version, tithe_pct, kingdom_pct, savings_pct, invest_pct, charity_pct, expense_pct, effective_from)
VALUES (1, 10, 20, 20, 20, 10, 50, date('now'));

INSERT INTO categories (name, default_bucket_id, bucket_is_flexible, type) VALUES
  ('Transportation', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Food', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Education', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Gifts', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Business Expenses', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Data Purchase', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Offering', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Seed', NULL, 1, 'expense'),
  ('Health', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Entertainment', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Gasoline', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Utilities & Bills', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense'),
  ('Home Expenses', (SELECT id FROM allocation_buckets WHERE key='expense'), 0, 'expense');
```
