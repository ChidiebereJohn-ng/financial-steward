# API Design — Cloudflare Workers (Hono)

Base path: `/api`. All responses JSON. Single-user app — auth via WebAuthn session cookie/JWT, checked in Worker middleware on every route below.

## Transactions & Ledger

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/transactions` | List, paginated. Query params: `from`, `to`, `category_id`, `account_id`, `bucket_id`, `direction`, `min_amount`, `max_amount` |
| GET | `/api/transactions/:id` | Single transaction detail |
| POST | `/api/transactions` | Create a transaction. If `direction=inflow`, triggers the Allocation Engine (see APP_LOGIC.md) unless `override_split` is provided |
| PATCH | `/api/transactions/:id` | Edit a transaction — writes to `transaction_audit_log` for every changed field |
| DELETE | `/api/transactions/:id` | Soft-considered: reverses associated `bucket_ledger_entries`, logs the deletion |
| POST | `/api/transactions/import` | Upload CSV (multipart, stored to R2), returns `import_batch_id` |
| GET | `/api/imports/:id` | Import batch status, row errors |

## Buckets

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/buckets` | List all 6 buckets with current live balance (computed from `bucket_ledger_entries`) |
| GET | `/api/buckets/:id/ledger` | Full ledger entries for one bucket, paginated |
| POST | `/api/buckets/transfer` | Move funds between buckets — body: `from_bucket_id, to_bucket_id, amount, reason, date` |
| POST | `/api/buckets/adjust` | Manual balance adjustment (rare — correcting an error) |

## Allocation Rules

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/allocation-rules` | List all rule versions, with effective date ranges |
| GET | `/api/allocation-rules/current` | The active rule |
| POST | `/api/allocation-rules` | Create a new version (closes out the previous one's `effective_to`) |

## Categories & Income Sources

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create a category — `name`, `default_bucket_id` (nullable), `bucket_is_flexible` |
| PATCH | `/api/categories/:id` | Edit |
| GET | `/api/income-sources` | List |
| POST | `/api/income-sources` | Create |

## Budgets

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/budgets?month=YYYY-MM` | Planned vs actual per category for the month, plus `overall_adherence_pct` for that month |
| POST | `/api/budgets` | Set/update a planned amount for a category+month |
| GET | `/api/budgets/trend?from=YYYY-MM&to=YYYY-MM` | Month-over-month `overall_adherence_pct` series, for the adherence trend chart |

## Goals & Liabilities

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/goals` | List, with progress computed against linked bucket balance |
| POST | `/api/goals` | Create |
| PATCH | `/api/goals/:id` | Edit / mark complete |
| GET | `/api/liabilities` | List |
| POST | `/api/liabilities` | Create |
| PATCH | `/api/liabilities/:id` | Update balance/payment |

## Recurring Transactions

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/recurring` | List active recurring items, with `days_until_due` |
| POST | `/api/recurring` | Create |
| PATCH | `/api/recurring/:id` | Edit / deactivate |

## Investor Module

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/investments` | List holdings, grouped by market (NGX/global/crypto) |
| POST | `/api/investments` | Add a holding |
| POST | `/api/investments/:id/price-update` | Log a manual or API price update |
| GET | `/api/investments/live-prices?symbols=BTC,ETH` | Proxy to CoinGecko / equities API (server-side, cached in KV) |
| GET | `/api/strategies` | List strategy templates |
| POST | `/api/strategies` | Create a strategy with stages |
| POST | `/api/strategies/:id/simulate` | Run the compounding simulation, returns a stage-by-stage projection for charting |

## Purchase Calculator

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/purchase-calculator` | Body: `item, cost` → returns ratio, tier, and logs the calculation |
| GET | `/api/purchase-calculator/history` | Past calculations |

## Dashboards

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard/health` | Net worth trend, savings/investment rate, allocation adherence, budget adherence, bucket runway |
| GET | `/api/dashboard/ledger` | Real-time bucket balances, inflow/outflow chart data, recent transactions |

## Net Worth & Reconciliation

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/net-worth` | Snapshot history |
| POST | `/api/net-worth/snapshot` | Trigger a recompute-and-save (assets − liabilities, FX-normalized) |
| POST | `/api/accounts/:id/reconcile` | Body: `actual_balance, date` → sets `last_reconciled_*`, flags variance if mismatched |

## Digest

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/digest` | List digest items, newest first |
| PATCH | `/api/digest/:id` | Mark read |
| (internal) Cron | — | Worker cron handler generates new digest items via Claude API |

## Export

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/export?format=csv` | Full data export — transactions, buckets, investments, budgets |

## Conventions
- All list endpoints support `?limit=&cursor=` pagination.
- All mutating endpoints validate against D1 constraints and return `400` with a field-level error map on failure.
- Every write that affects a bucket balance goes through the ledger-entry writer (a shared internal function), never a direct `UPDATE` on a computed field — there is no stored bucket balance column, it's always summed from `bucket_ledger_entries` (or read from `monthly_summaries` for dashboard speed).
