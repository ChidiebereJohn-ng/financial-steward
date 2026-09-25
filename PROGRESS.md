# Project Progress & State Log

> Single source of truth across development sessions. Read this file at the start of every session before touching code. Update it at the end of every module.

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
| 1 | **Foundation** (D1 Schema + Seed, WebAuthn, Base Hono Worker) | **Not Started** | None | Not Started | — |
| 2 | **Ledger + Allocation Engine** (Core Math, Bucket Ledger, Transfers) | **Not Started** | None | Not Started | — |
| 3 | **Two Dashboards** (Financial Health + Money Movement) | **Not Started** | None | Not Started | — |
| 4 | **Budgets** (Adherence %, Category Variance, Charts) | **Not Started** | None | Not Started | — |
| 5 | **Goals, Liabilities, Recurring, Reconciliation** | **Not Started** | None | Not Started | — |
| 6 | **Investor Module** (Holdings, NGX Manual, Live Crypto, Simulator) | **Not Started** | None | Not Started | — |
| 7 | **Purchase Calculator, Research Digest, CSV Export** | **Not Started** | None | Not Started | — |
| 8 | **WealthVault Data Migration** (Ingestion Pipeline, Reconciliation) | **Not Started** | None | Not Started | — |

---

## 3. Resume State & Next Step
- **Current Position:** Pre-implementation / Planning approved.
- **Next Step:** Execute Module 1: Foundation (D1 migrations setup, seed data script, WebAuthn session middleware, Hono Worker structure).
