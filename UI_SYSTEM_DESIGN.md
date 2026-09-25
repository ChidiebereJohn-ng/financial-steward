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

## Component notes
- Use one shared `<ChartCard>` wrapper around all Chart.js instances (title, chart, optional legend) for visual consistency
- Use one shared `<BucketBadge>` component (color-coded per bucket: Tithe, Kingdom, Savings, Invest, Charity, Expense) reused across Ledger, Transaction rows, and Budgets
- Color-code by bucket, not by arbitrary category — this keeps the six-bucket mental model visually consistent everywhere
- Design direction: clean, data-forward, generous white space (closer to the OFX/FinanceAI reference screenshots than a busy consumer banking app) — numbers and trends are the content, chrome stays minimal
- Light/dark mode supported via CSS custom properties (matches PWA best practice for install experience)
