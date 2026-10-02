PRAGMA foreign_keys = OFF;

-- 1. Ledger and transaction data
DELETE FROM bucket_transfers;
DELETE FROM bucket_ledger_entries;
DELETE FROM allocation_runs;
DELETE FROM transaction_audit_log;
DELETE FROM transactions;

-- 2. Commitments, budgets, goals & liabilities
DELETE FROM recurring_transactions;
DELETE FROM budgets;
DELETE FROM goals;
DELETE FROM liabilities;

-- 3. Investment portfolio & price journals
DELETE FROM investment_price_updates;
DELETE FROM investments;

-- 4. Tools, imports, and summaries
DELETE FROM purchase_calculations;
DELETE FROM import_batches;
DELETE FROM net_worth_snapshots;
DELETE FROM monthly_summaries;

-- 5. Reset bank account balances to 0.0
UPDATE accounts SET last_reconciled_balance = 0.0;

-- 6. Reset auto-increment sequences
DELETE FROM sqlite_sequence WHERE name IN (
  'transactions',
  'allocation_runs',
  'bucket_ledger_entries',
  'bucket_transfers',
  'transaction_audit_log',
  'recurring_transactions',
  'budgets',
  'goals',
  'liabilities',
  'investments',
  'investment_price_updates',
  'purchase_calculations',
  'import_batches',
  'net_worth_snapshots',
  'monthly_summaries'
);

-- 7. Insert clean initial baseline net worth snapshot for today
INSERT INTO net_worth_snapshots (date, total_assets, total_liabilities, net_worth, base_currency)
VALUES (strftime('%Y-%m-%d', 'now'), 0.0, 0.0, 0.0, 'NGN');

PRAGMA foreign_keys = ON;
