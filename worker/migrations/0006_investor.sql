-- Migration: 0006_investor.sql
-- Description: Investor module holdings, manual price journal, strategies, and staged compounding templates

-- 1. Strategy templates
CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Strategy stages (for staged compounding simulation)
CREATE TABLE IF NOT EXISTS strategy_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  stage_order INTEGER NOT NULL,
  asset_type TEXT NOT NULL,        -- mutual_fund, treasury_bill, equity, etc.
  duration_months INTEGER NOT NULL,
  expected_return_pct REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Investments holdings table
CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- equity, mutual_fund, treasury_bill, crypto
  symbol_or_name TEXT NOT NULL,
  market TEXT,                     -- NGX, global, crypto
  quantity REAL,
  cost_basis REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  current_value REAL,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Investment price update log (manual NGX journal or live API sync)
CREATE TABLE IF NOT EXISTS investment_price_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  price REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'api'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_investments_market ON investments(market);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type);
CREATE INDEX IF NOT EXISTS idx_investments_strategy ON investments(strategy_id);
CREATE INDEX IF NOT EXISTS idx_investments_account ON investments(account_id);
CREATE INDEX IF NOT EXISTS idx_price_updates_inv_date ON investment_price_updates(investment_id, date);
CREATE INDEX IF NOT EXISTS idx_strategy_stages_order ON strategy_stages(strategy_id, stage_order);

-- Seed Initial Strategies
INSERT INTO strategies (id, name, description) VALUES
  (1, 'Conservative Capital Preservation', 'Low-risk compounding rotating from Money Market Funds into FGN Treasury Bills.'),
  (2, 'Balanced Wealth Accumulator', 'Multi-asset staged compounding rotating through fixed income, NGX dividend equities, and global ETF exposure.');

INSERT INTO strategy_stages (strategy_id, stage_order, asset_type, duration_months, expected_return_pct) VALUES
  (1, 1, 'Money Market Fund', 6, 14.5),
  (1, 2, 'FGN Treasury Bill', 12, 18.0),
  (2, 1, 'High-Yield Fixed Income', 6, 16.0),
  (2, 2, 'NGX Dividend Equities', 12, 22.0),
  (2, 3, 'Global Index ETF', 18, 15.0);
