# Traceability Matrix

Maps each requirement back to the tables, endpoints, and screens that implement it — use this to verify nothing discussed got dropped, and as a build checklist.

| # | Requirement | Database table(s) | API endpoint(s) | UI screen |
|---|---|---|---|---|
| 1 | Six-bucket allocation waterfall, dynamic percentages | `allocation_buckets`, `allocation_rules` | `GET/POST /api/allocation-rules` | Settings — Allocation Rule editor |
| 2 | Per-transaction allocation override | `transactions.is_override`, `allocation_runs` | `POST /api/transactions` (override_split) | Add Transaction |
| 3 | Tithe/Kingdom released immediately (pass-through) | `allocation_buckets.is_pass_through` | `POST /api/buckets/transfer` (used as payout debit) | Ledger — Bucket detail |
| 4 | Real-time inflow/outflow tracking, structured record | `transactions` | `GET/POST /api/transactions` | Ledger Dashboard, Transaction History |
| 5 | Two-dashboard structure (Health vs Money Movement) | `monthly_summaries`, `bucket_ledger_entries` | `GET /api/dashboard/health`, `GET /api/dashboard/ledger` | Health Dashboard, Ledger Dashboard |
| 6 | Category-level spend reflects on available bucket funds | `bucket_ledger_entries`, `categories.default_bucket_id` | `POST /api/transactions` | Add Transaction, Bucket detail |
| 7 | Extensible categories | `categories` | `GET/POST/PATCH /api/categories` | Settings — Categories |
| 8 | Seed sourced from any bucket per transaction | `categories.bucket_is_flexible` | `POST /api/transactions` (chosen_bucket_id) | Add Transaction |
| 9 | Offering fixed to Expenses bucket | `categories.default_bucket_id` | — (seed data) | — |
| 10 | Charity = gifts to people, distinct bucket | `allocation_buckets` | — | — |
| 11 | Business Expenses as a normal, filterable category | `categories`, `transactions.category_id` | `GET /api/transactions?category_id=` | Transaction History |
| 12 | Bucket-to-bucket transfers, tracked/visible | `bucket_transfers`, `bucket_ledger_entries` | `POST /api/buckets/transfer` | Ledger Dashboard — Transfer action |
| 13 | Income source labeling on inflows | `income_sources`, `transactions.income_source_id` | `GET/POST /api/income-sources` | Add Transaction |
| 14 | CSV/statement import, dedupe | `import_batches`, `transactions.external_id` | `POST /api/transactions/import` | Ledger Dashboard — Import action |
| 15 | Spending pattern analytics | `monthly_summaries` | `GET /api/dashboard/health` | Health Dashboard |
| 16 | Budgeting per category per month, overall adherence %, monthly performance charts | `budgets`, `monthly_summaries` | `GET/POST /api/budgets`, `GET /api/budgets/trend` | Budgets screen |
| 17 | Investor module — NGX, global, crypto | `investments`, `investment_price_updates` | `GET/POST /api/investments`, `.../price-update` | Investor Module |
| 18 | NGX manual pricing (no free live feed) | `investment_price_updates.source='manual'` | `POST /api/investments/:id/price-update` | Investor Module |
| 19 | Global/crypto live pricing | — (external API call) | `GET /api/investments/live-prices` | Investor Module |
| 20 | Investment strategy simulator (staged compounding) | `strategies`, `strategy_stages` | `GET/POST /api/strategies`, `POST .../simulate` | Investor Module — Simulator |
| 21 | Purchase risk calculator | `purchase_calculations` | `POST /api/purchase-calculator` | Purchase Calculator screen |
| 22 | Scheduled research digest | `digest_items` | `GET /api/digest` (+ Cron) | Digest screen |
| 23 | Liabilities tracking | `liabilities` | `GET/POST/PATCH /api/liabilities` | Liabilities screen |
| 24 | Recurring transactions / bill awareness | `recurring_transactions` | `GET/POST/PATCH /api/recurring` | Ledger Dashboard — Upcoming |
| 25 | Goals tied to buckets | `goals`, `goals.linked_bucket_id` | `GET/POST/PATCH /api/goals` | Goals screen |
| 26 | Transaction edit audit log | `transaction_audit_log` | `PATCH /api/transactions/:id` | Transaction detail — History |
| 27 | Full data export | — | `GET /api/export` | Settings |
| 28 | FX rate history for multi-currency net worth | `fx_rates` | (internal, used by net worth compute) | — |
| 29 | Account reconciliation | `accounts.last_reconciled_*` | `POST /api/accounts/:id/reconcile` | Account detail |
| 30 | WealthVault CSV migration | `transactions`, `bucket_ledger_entries`, `import_batches` | `POST /api/transactions/import` | Ledger Dashboard — Import |

## Gaps intentionally deferred
- Receipt/attachment storage — schema column reserved (`transactions.attachment_url`), feature not built in v1.
- Multi-tenant/team auth — explicitly out of scope, single-user by design.
- Pan-African markets beyond NGX — deferred until the user actually holds positions there.
