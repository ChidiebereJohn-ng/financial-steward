-- Migration 0003: Dashboards
-- Precomputed aggregates, Net Worth Snapshots, and FX Rates
-- Traceability Rows: 5, 11, 15, 28

-- 1. Precomputed Monthly Summaries (Performance optimization for dashboards)
CREATE TABLE IF NOT EXISTS monthly_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,             -- 'YYYY-MM'
  category_id INTEGER REFERENCES categories(id),
  bucket_id INTEGER REFERENCES allocation_buckets(id),
  total_amount REAL NOT NULL,
  refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month, category_id, bucket_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_summaries_month ON monthly_summaries(month);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_cat ON monthly_summaries(category_id);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_bucket ON monthly_summaries(bucket_id);

-- 2. Net Worth Snapshots (Cumulative historical trend tracking)
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- 'YYYY-MM-DD'
  total_assets REAL NOT NULL,
  total_liabilities REAL NOT NULL,
  net_worth REAL NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_date ON net_worth_snapshots(date);

-- 3. FX Rates (Multi-currency normalization table)
CREATE TABLE IF NOT EXISTS fx_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- 'YYYY-MM-DD'
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, from_currency, to_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON fx_rates(date, from_currency, to_currency);

-- 4. Baseline Seed FX Rates (As of Q3 2026 reference)
INSERT OR IGNORE INTO fx_rates (date, from_currency, to_currency, rate) VALUES
  ('2026-01-01', 'NGN', 'NGN', 1.0),
  ('2026-01-01', 'USD', 'NGN', 1600.0),
  ('2026-01-01', 'EUR', 'NGN', 1750.0),
  ('2026-01-01', 'GBP', 'NGN', 2100.0),
  ('2026-09-01', 'NGN', 'NGN', 1.0),
  ('2026-09-01', 'USD', 'NGN', 1650.0),
  ('2026-09-01', 'EUR', 'NGN', 1800.0),
  ('2026-09-01', 'GBP', 'NGN', 2150.0);
