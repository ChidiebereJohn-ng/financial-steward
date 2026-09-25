-- Migration 0001: Foundation
-- Reference / Configuration Tables and Seed Data

-- 1. Allocation Buckets
CREATE TABLE IF NOT EXISTS allocation_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,        -- 'tithe','kingdom','savings','invest','charity','expense'
  name TEXT NOT NULL,
  is_pass_through INTEGER NOT NULL DEFAULT 0, -- 1 for tithe/kingdom (released immediately, not held)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Versioned Allocation Rules
CREATE TABLE IF NOT EXISTS allocation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  tithe_pct REAL NOT NULL,
  kingdom_pct REAL NOT NULL,
  savings_pct REAL NOT NULL,       -- % of remainder after tithe+kingdom
  invest_pct REAL NOT NULL,
  charity_pct REAL NOT NULL,
  expense_pct REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,               -- NULL = current active rule
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  default_bucket_id INTEGER REFERENCES allocation_buckets(id), -- NULL if bucket is chosen per-transaction (e.g. Seed)
  bucket_is_flexible INTEGER NOT NULL DEFAULT 0, -- 1 for categories like Seed
  type TEXT NOT NULL DEFAULT 'expense', -- 'expense' | 'income'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Income Sources
CREATE TABLE IF NOT EXISTS income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,       -- Salary, Portfolio Income, Business Revenue, Gift, Other
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- bank, wallet, brokerage, crypto_wallet
  currency TEXT NOT NULL DEFAULT 'NGN',
  institution TEXT,
  last_reconciled_balance REAL,
  last_reconciled_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Authentication Credentials (WebAuthn Passkey + Recovery Hash for Single User)
CREATE TABLE IF NOT EXISTS auth_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  recovery_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SEED DATA

-- Initial 6 Buckets
INSERT OR IGNORE INTO allocation_buckets (key, name, is_pass_through) VALUES
  ('tithe', 'Tithe', 1),
  ('kingdom', 'Kingdom Investment', 1),
  ('savings', 'Savings', 0),
  ('invest', 'Investment', 0),
  ('charity', 'Charity', 0),
  ('expense', 'Expenses', 0);

-- Initial Allocation Rule v1 (10% Tithe, 20% Kingdom, 20% Savings, 20% Invest, 10% Charity, 50% Expense)
INSERT OR IGNORE INTO allocation_rules (version, tithe_pct, kingdom_pct, savings_pct, invest_pct, charity_pct, expense_pct, effective_from)
VALUES (1, 10, 20, 20, 20, 10, 50, date('now'));

-- Initial Categories
INSERT OR IGNORE INTO categories (name, default_bucket_id, bucket_is_flexible, type) VALUES
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

-- Initial Income Sources
INSERT OR IGNORE INTO income_sources (name) VALUES
  ('Salary'),
  ('Portfolio Income'),
  ('Business Revenue'),
  ('Gift'),
  ('Other');
