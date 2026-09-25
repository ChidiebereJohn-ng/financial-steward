# App Logic — Core Algorithms

## 1. Allocation Engine

Triggered on every `POST /api/transactions` where `direction = 'inflow'`.

```
function runAllocation(transaction, overrideSplit = null):
  rule = overrideSplit ?? getCurrentAllocationRule()

  tithe_amt   = transaction.amount * rule.tithe_pct / 100
  kingdom_amt = transaction.amount * rule.kingdom_pct / 100
  remainder   = transaction.amount - tithe_amt - kingdom_amt   # the "new 100%"

  savings_amt = remainder * rule.savings_pct / 100
  invest_amt  = remainder * rule.invest_pct / 100
  charity_amt = remainder * rule.charity_pct / 100
  expense_amt = remainder * rule.expense_pct / 100

  for each (bucket, amount) in [tithe, kingdom, savings, invest, charity, expense]:
    insert allocation_runs (transaction_id, bucket_id, amount)
    insert bucket_ledger_entries (bucket_id, transaction_id, entry_type='allocation_credit', amount, date)

  transaction.is_override = (overrideSplit != null)
  transaction.allocation_rule_version = rule.version   # or NULL if override
```

**Pass-through buckets (Tithe, Kingdom):** immediately after the credit above, the UI prompts (or the user separately logs) the actual payout — e.g. "Tithe → Church, ₦X" — which is a normal `expense_debit` entry against the `tithe` bucket. These buckets are expected to sit near-zero; a non-zero Tithe/Kingdom balance in the dashboard is a signal the payout hasn't been logged yet, not an error.

**Override vs standing rule:** if the user supplies a custom split for one inflow, `allocation_rule_version` is left NULL on that transaction and `is_override = 1`, so reporting can distinguish "ran under the standing rule" from "one-off decision."

## 2. Category Spend → Bucket Debit

When a transaction with `direction = 'outflow'` is created:

```
function recordExpense(transaction):
  category = getCategory(transaction.category_id)

  if category.bucket_is_flexible:      # e.g. Seed
    bucket = transaction.chosen_bucket_id   # required input from the user at entry time
  else:
    bucket = category.default_bucket_id

  insert bucket_ledger_entries (bucket_id=bucket, transaction_id, entry_type='expense_debit', amount, date)
```

A bucket's **available balance** is always:
```
SUM(amount WHERE entry_type IN ('allocation_credit','transfer_in'))
  - SUM(amount WHERE entry_type IN ('expense_debit','transfer_out'))
  ± manual_adjustment entries
```
computed live for the Ledger dashboard, and cached daily into `monthly_summaries` for the Health dashboard.

## 3. Bucket Transfers

```
function transferBetweenBuckets(fromBucket, toBucket, amount, reason, date):
  outEntry = insert bucket_ledger_entries (bucket_id=fromBucket, entry_type='transfer_out', amount, date, note=reason)
  inEntry  = insert bucket_ledger_entries (bucket_id=toBucket,   entry_type='transfer_in',  amount, date, note=reason)
  insert bucket_transfers (fromBucket, toBucket, amount, date, reason, outEntry.id, inEntry.id)
```
Both legs are always created together, inside one D1 transaction (all-or-nothing).

## 4. Transaction Edits & Audit Log

```
function editTransaction(id, changes):
  old = getTransaction(id)
  for field, newValue in changes:
    if old[field] != newValue:
      insert transaction_audit_log (transaction_id=id, changed_field=field, old_value=old[field], new_value=newValue)
  update transactions set changes where id = id

  if amount or category or bucket changed and transaction was already allocated/debited:
    reverse the original bucket_ledger_entries (insert offsetting entries, don't delete)
    re-run allocation or expense-debit logic with new values
```
Ledger entries are never deleted or mutated — corrections are always offsetting entries, so the ledger stays a true append-only record even when transactions get edited.

## 5. Purchase Risk Calculator

```
function calculatePurchaseRisk(cost):
  netWorth = getLatestNetWorthSnapshot().net_worth
  ratio = (cost / netWorth) * 100

  tier =
    ratio < 1        -> "Safe"
    ratio < 5        -> "Comfortable"
    ratio < 10       -> "Major Purchase"
    ratio < 20       -> "Good Reason to Purchase"
    ratio < 30       -> "Call a Family Member"
    ratio <= 50       -> "Whatever You Bought Owns You"
    ratio > 50       -> "Call Your Ancestors"

  insert purchase_calculations (item, cost, net_worth_at_time=netWorth, ratio_pct=ratio, tier_result=tier, date)
  return { ratio, tier }
```
Net worth is always the last **snapshot**, never a live recompute mid-calculation — so the result is reproducible and auditable later.

## 6. Net Worth Computation (multi-currency)

```
function computeNetWorth(asOfDate):
  assets = sum(account balances + investment current_values + bucket balances), each converted to NGN
           using the fx_rate for (currency -> NGN) on or nearest before asOfDate
  liabilities = sum(liabilities.current_balance), same FX conversion
  net_worth = assets - liabilities
  insert net_worth_snapshots (date=asOfDate, total_assets=assets, total_liabilities=liabilities, net_worth)
```
Runs on-demand (before a purchase calculation) and on a schedule (nightly Cron Trigger) so the trend line in the Health dashboard has regular data points even on days with no user action.

## 7. Investment Strategy Simulator

```
function simulateStrategy(strategyId, startingCapital):
  stages = getStrategyStages(strategyId), ordered by stage_order
  capital = startingCapital
  timeline = []
  for stage in stages:
    capital = capital * (1 + stage.expected_return_pct / 100)
    timeline.append({ stage: stage.asset_type, months: stage.duration_months, capital })
  return timeline
```
Example: Mutual Fund (6mo, +15%) → Treasury Bill (3mo, +17%) → ... produces a stage-by-stage capital curve, charted with Chart.js. This is a **projection tool**, not a live-tracked investment — actual holdings are tracked separately in `investments`.

## 8. Budget Variance

```
function getBudgetVariance(month):
  for each category with a budget row for `month`:
    actual = SUM(transactions.amount WHERE category_id=category, direction='outflow', month matches)
    variance_pct = (actual - planned_amount) / planned_amount * 100
  return list of { category, planned, actual, variance_pct }
```
Alert threshold (80%/100%) evaluated client-side or in a lightweight Worker check, surfaced as an in-app banner.

## 8b. Overall Budget Adherence (%)

Rather than a single opaque "score," this is a transparent aggregate computed from the same per-category variance data:

```
function getOverallAdherence(month):
  categories = getBudgetVariance(month)   # from step 8, per-category planned/actual
  totalPlanned = SUM(categories.planned)
  totalActual  = SUM(categories.actual)
  adherence_pct = 100 - MAX(0, (totalActual - totalPlanned) / totalPlanned * 100)
  # clamp at 0 (can't be "negative adherence") — a category running over just pulls the number down, it never hides which one
  return { adherence_pct, categories }   # categories array always returned alongside, never adherence_pct alone
```
The API and UI always show this figure **together with** the per-category breakdown it was built from — never as a standalone badge — so "87% adherence" is always one tap away from "here's exactly which category caused the other 13%."

For the month-over-month trend, the same `adherence_pct` is computed and stored per month (via the nightly Cron Trigger that refreshes `monthly_summaries`) so the Budgets screen can chart it over time without recomputing history on every load.

## 9. Recurring Transaction Reminders

Nightly Cron Trigger scans `recurring_transactions` where `next_due_date <= today + 3 days` and `active = 1`, surfaces them in the Ledger dashboard as "upcoming commitments." On confirmation, it creates the actual `transactions` row and advances `next_due_date` by `frequency`.

## 10. Account Reconciliation

```
function reconcileAccount(accountId, actualBalance, date):
  computedBalance = SUM(transactions.amount, signed by direction, WHERE account_id=accountId)
  variance = actualBalance - computedBalance
  update accounts set last_reconciled_balance=actualBalance, last_reconciled_date=date
  if variance != 0: flag for the user to investigate (surfaced in dashboard, not silently accepted)
```

## 11. Research Digest Generation (Cron Trigger)

Weekly: Worker calls Claude API with configured topics (e.g. "treasury bill strategy Nigeria," "how PiggyVest generates revenue"), stores the resulting summary + source links in `digest_items`. Kept deliberately simple — no autonomous browsing agent, just a scheduled summarization call.
