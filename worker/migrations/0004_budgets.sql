-- ==============================================================================
-- Migration: 0004_budgets.sql
-- Module 4: Budgets (Adherence %, Category Variance, Charts)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,             -- 'YYYY-MM' format
  category_id INTEGER NOT NULL REFERENCES categories(id),
  planned_amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month, category_id)
);

CREATE INDEX IF NOT EXISTS idx_budgets_month_category ON budgets(month, category_id);
