# Project Progress & State Log

> Single source of truth across development sessions. Read this file and `IMPLEMENTATION_PLAN.md` at the start of every session before touching code. Update this file at the end of every module.

- **Architecture & Roadmap Blueprint:** [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
- **Database Schema Source:** [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md)
- **API Map:** [`API_DESIGN.md`](./API_DESIGN.md)
- **Core Algorithms:** [`APP_LOGIC.md`](./APP_LOGIC.md)
- **Traceability Matrix:** [`TRACEABILITY_MATRIX.md`](./TRACEABILITY_MATRIX.md)

---

## 1. Project Baseline (Architectural Decisions & Context)

This baseline documents core architectural decisions from the project specification files (`PROJECT.md`, `DATABASE_SCHEMA.md`, `API_DESIGN.md`, `APP_LOGIC.md`, `UI_SYSTEM_DESIGN.md`, `TRACEABILITY_MATRIX.md`, `HOSTING_CLOUDFLARE.md`, and WealthVault extraction specs). Future sessions starting at any module must adhere to these foundations.

### 1.1 The Six-Bucket Waterfall & Pass-Through Behavior
- **The Split Math:**
  Every gross inflow is partitioned in two phases:
  1. **Tithe:** 10% of gross inflow.
  2. **Kingdom Investment:** 20% of gross inflow.
  3. **Remainder Base (70% of gross):** Treated as the new 100% and distributed:
     - **Savings:** 20% of remainder (14% of gross)
     - **Investment:** 20% of remainder (14% of gross)
     - **Charity:** 10% of remainder (7% of gross)
     - **Expenses:** 50% of remainder (35% of gross)
- **Pass-Through Mechanics (`is_pass_through = 1`):**
  Tithe and Kingdom Investment are designated pass-through buckets. Funds allocated here are not intended to be accumulated long-term; they are scheduled for immediate release/payout. Payouts are recorded as standard `expense_debit` ledger entries against those buckets.
- **Reporting Invariant:** In the dashboard, Tithe and Kingdom buckets are expected to hover near ₦0. A non-zero balance is an explicit operational cue that a release/transfer has not yet been logged—never a database error or unallocated float.

### 1.2 Per-Transaction Allocation Override Mechanism
- **Standing Rule vs. One-Off Override:**
  The standing waterfall rule is versioned in `allocation_rules` (`tithe_pct`, `kingdom_pct`, `savings_pct`, `invest_pct`, `charity_pct`, `expense_pct`, `effective_from`, `effective_to`).
- **Override Execution:**
  For irregular or one-off inflows (e.g., specific gifts, asset liquidations, designated bonuses), the user may supply an explicit `override_split` at transaction entry.
- **Audit & Lineage Integrity:**
  When an override split is executed:
  - `transactions.is_override` is set to `1`.
  - `transactions.allocation_rule_version` is explicitly set to `NULL`.
  - The exact amounts distributed are stored in `allocation_runs` (one row per bucket per inflow).
  This guarantees historical reports can cleanly distinguish disciplined standing-rule inflows from discretionary one-off allocations.

### 1.3 Seed's Flexible Sourcing vs. Offering's Fixed Expenses Sourcing
- **Offering (`bucket_is_flexible = 0`):**
  Offering is treated as regular worship expenditure. It is assigned to category `Offering` with `default_bucket_id` hardcoded to the `expense` bucket.
- **Seed (`bucket_is_flexible = 1`):**
  Seed represents an intentional, sacrificial, or strategic spiritual pledge. It does not have a hardcoded default bucket (`default_bucket_id = NULL`).
- **UI & Ingestion Rule:**
  Whenever an outflow transaction selects category `Seed`, the UI mandates user selection of `chosen_bucket_id`. Seed may be funded from `savings`, `invest`, `expense`, or any other held bucket based on the user's specific stewardship conviction.

### 1.4 Append-Only Bucket Ledger & Audit Trail
- **No Stored Bucket Balance Column:**
  There is no mutable balance column on `allocation_buckets`. A bucket's live available balance is exclusively the scalar sum:
  $$\text{Balance} = \sum(\text{allocation\_credit} + \text{transfer\_in}) - \sum(\text{expense\_debit} + \text{transfer\_out}) \pm \text{manual\_adjustment}$$
- **Zero In-Place Mutation on Past Transactions:**
  If a transaction amount, category, or bucket is edited (`PATCH /api/transactions/:id`) or deleted:
  1. The original `bucket_ledger_entries` are never updated or deleted.
  2. Compensating/offsetting ledger entries are appended to reverse the previous credit/debit.
  3. New ledger entries reflecting the revised state are appended.
  4. Every modified field is recorded in `transaction_audit_log` (`changed_field`, `old_value`, `new_value`, `changed_at`).
  The ledger remains a strictly immutable, forensically auditable journal.

### 1.5 Overall Budget Adherence (%) Design
- **Rejection of Opaque Gamified Scores:**
  Adherence is calculated mathematically from monthly category variances:
  $$\text{Adherence \%} = 100 - \max\left(0, \frac{\text{Total Actual} - \text{Total Planned}}{\text{Total Planned}} \times 100\right)$$
  Clamped at $0\%$ (cannot be negative).
- **Mandatory Paired Presentation:**
  Adherence percentage is **never** presented as an isolated badge or metric in API responses or UI components. It is always coupled with the full per-category planned-vs-actual variance table and the worst three variance offenders surfaced first. The user is always one glance away from seeing exactly which line item caused an overage.

### 1.6 WealthVault Firestore Migration Nuances
- **Source Data Characteristics:**
  Source is Google Firestore NoSQL (`users/{uid}/transactions`). Extracted via standalone script into an RFC 4180 compliant CSV.
- **Critical Schema Quirks to Handle:**
  1. **Waterfall Snapshot Structure:** Inflows contain an embedded map `waterfallSnapshot: { tithe, kingdom, savings, invest, charity, expense }`. Outflows omit this field.
  2. **Subtype Overloading:** Bucket deployments and transfers in WealthVault were stored as `type: expense` with `transactionSubtype: 'bucket_deploy'` or `'bucket_transfer'`, using `fromBucketId` / `toBucketId` or `purposeLabel`.
  3. **Signed Numbers & Minor Units:** Firestore amounts may appear with arbitrary signs or strings; migration CSV normalizes via absolute value `formatAmount(Math.abs(num))`.
  4. **Date Serialization:** Timestamps in Firestore can be ISO strings, millisecond numbers, or `{ seconds, nanoseconds }` objects.
  5. **Deduplication:** Every row preserves `external_id` (Firestore document ID) mapped to `transactions.external_id` with a database-level `UNIQUE` constraint to prevent duplicate imports on rerun.

---

## 2. Module Execution Status

| # | Module | Status | Last Applied Migration | Test Suite State | Key Outputs |
|---|---|---|---|---|---|
| 1 | **Foundation** (D1 Schema + Seed, WebAuthn, Base Hono Worker) | **Completed** | `0001_foundation.sql` | 12/12 Passing | Live D1 `finance-app-db`, KV `CACHE`, Deployed Worker API |
| 2 | **Ledger + Allocation Engine** (Core Math, Bucket Ledger, Transfers) | **Completed** | `0002_ledger_allocation.sql` | 26/26 Passing | Core Ledger Schema, Waterfall Engine, Transfers, Reversal Immutability, Deployed API |
| 3 | **Two Dashboards** (Financial Health + Money Movement) | **Completed** | `0003_dashboards.sql` | 35/35 Passing | Precomputed Summaries, Net Worth Engine, Health & Ledger APIs, Nightly Cron Handler, React PWA Shell & Dashboards, Deployed API |
| 4 | **Budgets** (Adherence %, Category Variance, Charts) | **Completed** | `0004_budgets.sql` | 55/55 Passing | Budgets Table, Exact Clamped Adherence Math, Paired Non-Isolation Invariant, Copy Previous Month, Screen 5 Budgets, Deployed API |
| 5 | **Goals, Liabilities, Recurring, Reconciliation** | **Not Started** | None | Not Started | — |
| 6 | **Investor Module** (Holdings, NGX Manual, Live Crypto, Simulator) | **Not Started** | None | Not Started | — |
| 7 | **Purchase Calculator, Research Digest, CSV Export** | **Not Started** | None | Not Started | — |
| 8 | **WealthVault Data Migration** (Ingestion Pipeline, Reconciliation) | **Not Started** | None | Not Started | — |

---

## 3. Environment & Remote Setup State
- **GitHub Repository:** [`https://github.com/ChidiebereJohn-ng/financial-steward.git`](https://github.com/ChidiebereJohn-ng/financial-steward.git) (Branch: `main`)
- **Cloudflare Account:** `Chidieberejohnchukwuemeka@gmail.com's Account` (`95d2ef3d029c783cdccf9f223d30e123`)
- **Cloudflare D1 Database:** `finance-app-db` (`820fc652-b2c7-46db-9eb5-b9d504701b7a`)
- **Cloudflare KV Namespace:** `CACHE` (`a501583e975c4424ba3eb6a31abc1c2d`)
- **Deployed Worker Endpoint:** `https://personal-finance-app.chidieberejohnchukwuemeka.workers.dev`

---

## 4. Key Decisions & Technical Notes

### 4.1 Foundation (Module 1)
- **WASM SQLite for Local Testing:** Replaced `better-sqlite3` with `sql.js` (WebAssembly SQLite) to eliminate reliance on native C++ compilers on Windows Node v25, enabling instantaneous and deterministic test execution in any environment.
- **Reference Table Constraints:**
  - `Seed` category explicitly set to `bucket_is_flexible = 1` and `default_bucket_id = NULL`.
  - `Offering` category set to `bucket_is_flexible = 0` and defaulted to `expense` bucket.
  - Initial rule version 1 seeded (10% Tithe, 20% Kingdom, 20% Savings, 20% Invest, 10% Charity, 50% Expense).
- **Authentication:** Added `authMiddleware` supporting WebAuthn session cookies/Bearer tokens with KV verification, along with a dev bypass header (`x-dev-bypass: true`) for testing without biometric hardware.

### 4.2 Ledger + Allocation Engine (Module 2)
- **Zero-Drift Waterfall Split Math:** All gross inflow splits are computed in minor units (kobo/cents). Tithe (10%) and Kingdom (20%) are computed first, and the remaining 70% is distributed to Savings (20%), Investment (20%), Charity (10%), with the final Expenses bucket absorbing any odd rounding cent/kobo. This mathematically guarantees that $\sum \text{splits} \equiv \text{inflow amount}$ across arbitrary amounts.
- **Override Audit Lineage:** When a custom `override_split` is provided on an inflow, `transactions.is_override` is set to `1` and `transactions.allocation_rule_version` is set to `NULL`, with the exact applied bucket allocations recorded in `allocation_runs`.
- **Append-Only Ledger & Reversal Invariant:** `bucket_ledger_entries` is strictly append-only. When an existing transaction is edited (`PATCH /api/transactions/:id`) or deleted (`DELETE /api/transactions/:id`), the historical entries are never updated or deleted. Offsetting `manual_adjustment` entries are appended to reverse the previous credit/debit, new entries reflecting revised state are appended, and all field-level differences are written to `transaction_audit_log`.
- **Flexible Sourcing Enforcement:** Outflow transactions with `Seed` (`bucket_is_flexible = 1`) strictly require `chosen_bucket_id` at entry time. Outflows with fixed categories (e.g. `Offering`) automatically route to `category.default_bucket_id` (Expenses bucket).
- **Atomic Two-Legged Transfers:** `POST /api/buckets/transfer` generates balanced `transfer_out` and `transfer_in` entries linked in `bucket_transfers` within an atomic D1 batch. System-wide balance conservation is preserved ($\Delta = 0$).
- **Dynamic Scalar Balance:** There is no stored balance column on `allocation_buckets`. Live available balances are derived dynamically via:
  $$\text{Balance} = \sum(\text{allocation\_credit} + \text{transfer\_in}) - \sum(\text{expense\_debit} + \text{transfer\_out}) \pm \text{manual\_adjustment}$$

### 4.3 Two Dashboards & Analytics Engine (Module 3)
- **Precomputed Monthly Summaries (`monthly_summaries`):** Outflow categories and bucket allocations are precomputed by `refreshMonthlySummaries(db, month)` to accelerate dashboard response times. An atomic delete-and-reinsert batch pattern is used to guarantee idempotency and avoid stale rows on re-categorization or edits.
- **Multi-Currency Net Worth Engine (`computeNetWorth`):** Net worth aggregates foreign and local accounts, bucket balances, and investment valuations, converted to base currency (`NGN`) using the closest prior historical exchange rate from `fx_rates`. Defensive queries allow the engine to run smoothly before investment and liability tables are formally introduced.
- **Honest Metrics Design:**
  - Health Dashboard replaces opaque composite scores with an honest KPI quartet: Total Net Worth, Savings & Investment Rate (% this month vs. last month), Paired Budget Adherence, and Expenses Runway.
  - Paired Adherence Invariant: Budget adherence percentage is strictly rendered alongside the category variance list and worst 3 offenders.
  - Runway Indicator: Computed dynamically as $\text{Expenses Bucket Balance} / \text{Average Daily Outflow (past 30 days)}$ in days.
- **Cloudflare Scheduled Cron Handler:** Worker exports `handleScheduled(event, env, ctx)` responding to `"0 1 * * *"` to automatically recompute net worth snapshots and refresh monthly summaries nightly at 01:00 UTC.
- **Frontend PWA Architecture:** React 19 + TypeScript + Vite PWA in `/app` with responsive layout shell (desktop side navigation + mobile bottom navigation), design tokens for dark mode and the 6 bucket colors, shared `<ChartCard>` (Chart.js) and `<BucketBadge>` components, Screen 1 (Financial Health), and Screen 2 (Money Movement).

### 4.4 Budgets & Adherence Engine (Module 4)
- **Mathematical Adherence & Clamping Invariant:**
  Adherence percentage strictly computes:
  $$\text{Adherence \%} = 100 - \max\left(0, \frac{\text{Total Actual} - \text{Total Planned}}{\text{Total Planned}} \times 100\right)$$
  Clamped non-negatively at $0\%$ so catastrophic overages can never produce negative percentages. When total planned is 0, adherence defaults to $100\%$ if no funds were spent, or $0\%$ if unbudgeted outflows occurred.
- **Mandatory Paired Presentation Invariant:**
  `overall_adherence_pct` is strictly paired with the full category breakdown and the top 3 worst overage offenders in both API payloads and UI components. It is never exposed as a standalone badge or gamified score.
- **D1 Migration `0004_budgets.sql`:**
  Created `budgets` table (`id`, `month`, `category_id`, `planned_amount`, `created_at`, `UNIQUE(month, category_id)`) with supporting index `idx_budgets_month_category`. Applied both locally and remotely to `finance-app-db`.
- **Copy Previous Month Budget:**
  `copyPreviousMonthBudget(db, targetMonth)` calculates $M - 1$ (handling January to prior-year December boundaries) and upserts planned amounts idempotently into the target month.
- **Month-over-Month Adherence Trend:**
  `getBudgetTrend(db, fromMonth, toMonth)` produces chronological historical adherence data points for trend tracking across months.
- **Screen 5 (Budgets UI):**
  Built `app/src/screens/BudgetsScreen.tsx` featuring month stepper/selector, honest KPI summary row, paired worst offenders callout banner, FinanceAI-style rounded bar comparison chart (Planned vs. Actual spend), smooth adherence trend line chart, and an interactive category variance table with inline editing and one-click budget persistence. Mounted under the "Budgets & Goals" navigation tab.

---

## 5. Resume State & Next Step
- **Current Position:** Module 4: Budgets (Adherence %, Category Variance, Charts) complete, tested (55/55 passing), applied locally and remotely to `finance-app-db`, and deployed to Cloudflare Edge.
- **Last Applied Migration:** `0004_budgets.sql` (applied locally and remotely to `finance-app-db`).
- **Next Step:** Module 5: Goals, Liabilities, Recurring Transactions & Reconciliation
  - Author migration `worker/migrations/0005_commitments.sql` (`goals`, `liabilities`, `recurring_transactions`).
  - Implement `reconcileAccount(accountId, actualBalance, date)`.
  - Implement recurring commitment due-scan logic in scheduled cron handler.
  - Implement `GET/POST/PATCH /api/goals`, `GET/POST/PATCH /api/liabilities`, `GET/POST/PATCH /api/recurring`, and `POST /api/accounts/:id/reconcile`.
  - Build Screen 6 (Goals with bucket-linked progress), Screen 9 (Liabilities payment cards), and Account reconciliation UI.

