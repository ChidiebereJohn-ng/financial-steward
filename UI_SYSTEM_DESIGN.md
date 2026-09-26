# UI System Design

## Navigation structure (PWA, mobile-first, installable)

Bottom nav (mobile) / side nav (desktop), 5 primary destinations:
1. **Health** (default landing)
2. **Ledger**
3. **Investor**
4. **Budgets & Goals**
5. **More** (Purchase Calculator, Categories, Liabilities, Digest, Settings)

## Screen 1 — Financial Health Dashboard (cumulative/progressive)
*Answers: "where do I stand."*
- Net worth trend line (Chart.js line chart, time range toggle: 3M/6M/1Y/All)
- This month's allocation waterfall (funnel/stacked bar showing inflow → 6 buckets)
- Savings + Investment rate this month vs. last (%)
- Budget adherence summary — small progress bars per category, worst 3 surfaced first
- Bucket runway indicator (Expenses bucket: "≈ X days at current pace")
- No single composite "score" — a row of honest KPIs instead

## Screen 2 — Ledger / Money Movement Dashboard (real-time)
*Answers: "what's moving right now."*
- Six bucket balance cards (live, from `bucket_ledger_entries`) — tap to drill into that bucket's ledger
- Inflow/Outflow bar chart, daily, last 30/90 days (mirrors the OFX-style reference layout)
- Recent transactions feed (last 10, link to full history)
- Quick actions: Add Transaction, Transfer Between Buckets, Import CSV

## Screen 3 — Transaction History (separate from both dashboards)
- Filterable table: date range, account, category, bucket, direction, amount range
- Column set: date, description, category, bucket, amount, direction
- Tap a row → Transaction Detail (edit, view audit log, view linked allocation_runs if inflow)

## Screen 4 — Add/Edit Transaction
- Direction toggle (Inflow/Outflow)
- Amount, currency, date, category (searchable dropdown, "+ Add category" inline)
- If category.bucket_is_flexible (Seed): bucket picker appears
- If inflow: "Use standing allocation rule" (default) vs "Custom split for this transaction" (override — six percentage inputs, must sum to 100)
- If inflow: Income Source dropdown
- Note / Purpose Label (purpose label required if category = Other)

## Screen 5 — Budgets
- Month selector
- Overall adherence % for the month, shown directly above the category list (never standalone — always paired with the breakdown below it, so it's immediately clear which category is driving the number)
- Per-category: planned amount input, actual (read-only), variance bar (green/amber/red)
- Planned-vs-actual bar chart across all categories for the month (Chart.js, mirrors the FinanceAI-style reference layout)
- Month-over-month overall adherence trend line (Chart.js), so it's visible whether budgeting is improving or slipping over time, not just this month in isolation
- "Copy last month's budget" quick action

## Screen 6 — Goals
- Card per goal: name, target amount, target date, linked bucket, progress bar (current bucket balance / target)
- Add Goal form

## Screen 7 — Investor Module
- Tabbed by market: NGX / Global / Crypto
- Holdings table: symbol, quantity, cost basis, current value (manual-entry badge on NGX rows, live-price badge on crypto/global rows), gain/loss
- "Update price" quick action per holding (writes to `investment_price_updates`)
- **Strategy Simulator** sub-screen: pick/build a strategy (staged: asset type → duration → expected return), input starting capital, see a projected capital curve (Chart.js) — clearly labeled "Projection, not a live position"

## Screen 8 — Purchase Calculator
- Two inputs: Item name, Cost
- Result: ratio %, tier label, color-coded band (green → red → dark red), based on the tier table in APP_LOGIC.md
- History list below (past calculations, sortable)

## Screen 9 — Liabilities
- Card per liability: name, current balance, interest rate, minimum payment, due date
- Simple add/edit form

## Screen 10 — Categories & Allocation Rules (Settings)
- Category list: name, bucket, edit/add
- Allocation Rule editor: 6 percentage sliders/inputs, live-validates sums to 100 (tithe+kingdom) and 100 (of remainder), "Save as new version" (never overwrites — always versions)
- Income Sources: simple list, add/edit

## Screen 11 — Research Digest
- Feed of digest_items, newest first, read/unread state
- Tap to expand summary + source link

## Design System (extracted from the three reference images)

This replaces vague "clean and modern" direction with actual values to build against.

**Color tokens**
- `--bg-page`: `#F8FAFC` (very light cool gray — not pure white, matches all three references' page background)
- `--bg-card`: `#FFFFFF`
- `--color-primary`: `#2563EB` (blue — used for primary buttons, active nav state, the Add/Transfer accent). This app is not OFX, so skip their orange — blue reads as trustworthy/neutral for a personal finance tool without borrowing another brand's identity
- `--color-positive`: `#16A34A` (inflow, gains, "on track" states)
- `--color-negative`: `#DC2626` (outflow, losses, over-budget states)
- `--color-text-primary`: `#0F172A`
- `--color-text-secondary`: `#64748B`
- `--radius-card`: `16px` (rounded corners on every card, matching the soft rounded style in all three references)
- `--shadow-card`: `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` (soft, barely-there — not a heavy drop shadow)

**Typography**
- Font: Inter (or system-ui fallback) — clean, no personality-driven display font
- Large balance/total numbers: 28–32px, bold (`font-weight: 700`), tabular-nums (so digits align in tables/charts)
- Card labels: 13–14px, `--color-text-secondary`, medium weight
- Section headers: 18–20px, semibold

**Layout patterns (pulled directly from the references)**
- **Stat card row**: 3–4 cards across the top of a dashboard, each a number + short label + small trend indicator (▲/▼ with %), exactly like the "Total Balance," "Revenue," "Active Accounts" row in the FinanceAI reference. Used at the top of both the Health and Ledger dashboards.
- **Insight/alert card**: icon + short headline + one line of supporting text, left-aligned, light tinted background per severity (used for budget-over-threshold warnings and digest previews) — mirrors the "AI Insights" panel style in the mobile reference (image 1), not its exact copy or AI-generated tone.
- **Two-column chart row**: on desktop, charts pair up side-by-side inside cards (Revenue & Expenses next to Spending by Category, in the FinanceAI reference) — apply the same pairing to Net Worth Trend next to Allocation Waterfall.
- **Navigation**: desktop = fixed left sidebar (icon + label, active item highlighted with a light blue background, not just a colored icon) as in the FinanceAI reference; mobile = fixed bottom tab bar with 5 icons + labels, active tab in `--color-primary`, as in the mobile reference.
- **Transaction row**: icon/avatar (category-colored circle) + merchant/description + category label (small, secondary) on the left, amount right-aligned and colored (green for inflow, dark/red for outflow) — this exact pattern from the mobile reference's "Transactions" list, reused everywhere a transaction list appears.

**Chart style**
- Bar charts: rounded top corners, generous gap between bars, no gridlines except a faint horizontal baseline (matches the "Daily Spending" and "Payment activity" bar charts across the references)
- Line charts: smooth (not jagged) line, light gradient area fill beneath it, single accent color, minimal axis labels (matches "Revenue & Expenses" line chart)
- All charts: no legend clutter — label directly on hover/tap (tooltip), not a permanent key, unless more than 2 series are shown

**What NOT to carry over**
- Skip OFX's orange brand color and card-mockup hero imagery — that's OFX's identity, not this app's
- Skip literal "AI-Powered Insights" branding language from the FinanceAI reference — keep insight cards, drop the AI-hype framing, consistent with keeping this app grounded rather than hyped
- Skip the multi-currency account switcher pattern (OFX) — this app tracks buckets, not multiple currency accounts, as the primary mental model

## Component notes
- Use one shared `<ChartCard>` wrapper around all Chart.js instances (title, chart, optional legend) for visual consistency
- Use one shared `<BucketBadge>` component (color-coded per bucket: Tithe, Kingdom, Savings, Invest, Charity, Expense) reused across Ledger, Transaction rows, and Budgets
- Color-code by bucket, not by arbitrary category — this keeps the six-bucket mental model visually consistent everywhere
- Light/dark mode: define a `--bg-page-dark` / `--bg-card-dark` etc. pair for every token above, switched via `prefers-color-scheme` (matches PWA best practice for install experience)


