# Project.md — Personal Finance Stewardship App

## What this is
A personal finance PWA for a single user. It is not a generic budgeting app — it enforces a **custom allocation waterfall** on every inflow (Tithe → Kingdom Investment → Savings/Investment/Charity/Expenses), tracks money at the **bucket level** (not just the account level), and gives an honest, non-hyped view of financial health and growth over time.

## Guiding principles
- **Honest over flashy.** No gamified "scores" that oversimplify. Real numbers, real trends.
- **Auditable, not just recorded.** Every movement of money — allocation, spend, transfer between buckets, edit to a past transaction — leaves a trace. Nothing silently overwrites history.
- **Manual where live data doesn't exist.** NGX has no reliable free API. Rather than fake real-time tracking, the app is explicit about what's manual vs automated.
- **Single user, lean infrastructure.** No multi-tenant auth system, no service sprawl. One Worker, one D1 database, one R2 bucket.
- **Configurable, not hardcoded.** Allocation percentages, categories, and strategies all change as the user's financial life grows — the schema is built to version and extend, not to be edited by hand later.

## Core concept: the Six-Bucket Waterfall
Every inflow is split:
1. **Tithe** — 10% of gross inflow, released/paid out immediately
2. **Kingdom Investment** — 20% of gross inflow, released/paid out immediately
3. The remaining 70% becomes the new 100%, split:
   - **Savings** — 20%
   - **Investment** — 20%
   - **Charity** — 10%
   - **Expenses** — 50%

This is the **default standing rule**, but it is versioned (changes as cashflow grows) and can be **overridden per-transaction** for one-off inflows.

## Modules
1. Allocation Engine (waterfall + bucket ledger)
2. Ledger (transactions, CSV import, dedupe)
3. Two Dashboards — Financial Health (cumulative) and Money Movement (real-time ledger)
4. Analytics (spending patterns, Chart.js visualizations)
5. Budgeting (per category, per month)
6. Investor Module (NGX + global stocks + crypto, manual-first)
7. Purchase Risk Calculator (cost ÷ net worth → tier)
8. Research Digest (scheduled, AI-summarized)
9. Goals, Liabilities, Recurring Transactions, Reconciliation

## Tech stack
- **Frontend:** React (Vite) PWA, Tailwind, Chart.js, service worker (offline-first, installable)
- **Backend:** Cloudflare Workers (Hono routing)
- **Database:** Cloudflare D1 (SQLite)
- **File storage:** Cloudflare R2 (CSV imports, exports)
- **Config/cache:** Cloudflare KV (FX rate cache, market price cache)
- **Scheduled jobs:** Cloudflare Cron Triggers (monthly summaries, research digest, recurring transaction reminders)
- **Auth:** WebAuthn passkey (device biometric), password fallback for recovery — single user, no roles/teams
- **AI:** Claude API call from a Worker, for research digest summarization

## Data migration
Source: **WealthVault** (Firestore-backed), same 6-bucket structure. Transactions-only migration via CSV — see `wealthvault-migration-spec.md` for the exact extraction format.

## Companion files
- `DATABASE_SCHEMA.md` — full D1 table definitions
- `API_DESIGN.md` — Worker route map
- `APP_LOGIC.md` — the algorithms (allocation engine, purchase calculator, strategy simulator, reconciliation)
- `UI_SYSTEM_DESIGN.md` — screens, navigation, components
- `TRACEABILITY_MATRIX.md` — requirement → table → endpoint → screen mapping
- `HOSTING_CLOUDFLARE.md` — deployment setup
