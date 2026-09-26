-- Migration: 0007_tools.sql
-- Module 7: Purchase Calculator, Research Digest & CSV Import/Export Batches

-- 1. Purchase calculations history table
CREATE TABLE IF NOT EXISTS purchase_calculations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  cost REAL NOT NULL,
  net_worth_at_time REAL NOT NULL,
  ratio_pct REAL NOT NULL,
  tier_result TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_calc_created ON purchase_calculations(created_at DESC);

-- 2. Financial research digest items
CREATE TABLE IF NOT EXISTS digest_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  read_status INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_digest_items_created ON digest_items(created_at DESC);

-- 3. CSV Import batches (Module 7/8 foundation)
CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL,            -- 'pending', 'completed', 'failed'
  error_log TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_import_batches_imported ON import_batches(imported_at DESC);

-- Initial curated financial research digest items
INSERT INTO digest_items (topic, summary, source_url, read_status, created_at)
VALUES 
  (
    'Central Bank of Nigeria Monetary Policy Rate & T-Bills',
    'CBN yields on 364-day Nigerian Treasury Bills remain elevated above 19-21%, presenting an attractive fixed-income sanctuary for preserving cash runway and buffering against inflation without capital impairment.',
    'https://www.cbn.gov.ng',
    0,
    datetime('now', '-2 days')
  ),
  (
    'NGX Equities & Dividend Yield Opportunities',
    'Tier-1 banking tickers and industrial leaders on the Nigerian Exchange offer sustainable dividend yields between 12-16% with resilient balance sheets, suitable for disciplined long-term capital compounding.',
    'https://ngxgroup.com',
    0,
    datetime('now', '-5 days')
  ),
  (
    'Dollar Cost Averaging & Multi-Currency Diversification',
    'Systematic dollar-cost averaging into global broad-market index ETFs (e.g. S&P 500 / VOO) mitigates localized currency devaluation risks while capturing compounding global economic productivity.',
    'https://www.investopedia.com/terms/d/dollarcostaveraging.asp',
    1,
    datetime('now', '-8 days')
  );
