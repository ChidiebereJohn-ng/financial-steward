import type {
  BucketWithBalance,
  HealthDashboardData,
  LedgerDashboardData,
  NetWorthSnapshot,
  Transaction,
} from '../types';
import { getBucketBalances } from './ledger';

/**
 * Retrieves the applicable FX rate to convert fromCurrency to toCurrency on or nearest before asOfDate.
 * Defaults to 1.0 if fromCurrency === toCurrency or if no specific rate is configured.
 */
export async function getFxRate(
  db: D1Database,
  fromCurrency: string,
  toCurrency: string = 'NGN',
  asOfDate?: string
): Promise<number> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return 1.0;
  }

  const date = asOfDate || new Date().toISOString().split('T')[0];

  // 1. Direct rate lookup
  const directRate = await db
    .prepare(
      `SELECT rate FROM fx_rates 
       WHERE from_currency = ? AND to_currency = ? AND date <= ? 
       ORDER BY date DESC LIMIT 1`
    )
    .bind(from, to, date)
    .first<{ rate: number }>();

  if (directRate && directRate.rate > 0) {
    return directRate.rate;
  }

  // 2. Inverse rate lookup
  const inverseRate = await db
    .prepare(
      `SELECT rate FROM fx_rates 
       WHERE from_currency = ? AND to_currency = ? AND date <= ? 
       ORDER BY date DESC LIMIT 1`
    )
    .bind(to, from, date)
    .first<{ rate: number }>();

  if (inverseRate && inverseRate.rate > 0) {
    return 1 / inverseRate.rate;
  }

  // 3. Fallback defaults for major currencies if table was empty
  if (from === 'USD' && to === 'NGN') return 1650.0;
  if (from === 'EUR' && to === 'NGN') return 1800.0;
  if (from === 'GBP' && to === 'NGN') return 2150.0;
  if (to === 'USD' && from === 'NGN') return 1 / 1650.0;

  return 1.0;
}

/**
 * Computes multi-currency Net Worth snapshot across accounts, investments, and bucket balances minus liabilities.
 * Persists the resulting snapshot into net_worth_snapshots and returns the record.
 */
export async function computeNetWorth(
  db: D1Database,
  asOfDate?: string
): Promise<NetWorthSnapshot> {
  const date = asOfDate || new Date().toISOString().split('T')[0];
  let totalAssets = 0;
  let totalLiabilities = 0;

  // 1. Accounts Asset Sum
  const { results: accounts } = await db
    .prepare('SELECT id, currency, last_reconciled_balance FROM accounts')
    .all<{ id: number; currency: string; last_reconciled_balance: number | null }>();

  for (const account of accounts) {
    let balance = account.last_reconciled_balance;
    if (balance === null || balance === undefined) {
      // Calculate from transactions if no reconciled balance
      const txSum = await db
        .prepare(
          `SELECT COALESCE(SUM(
             CASE WHEN direction = 'inflow' THEN amount ELSE -amount END
           ), 0) as balance 
           FROM transactions 
           WHERE account_id = ? AND (note IS NULL OR note NOT LIKE '[DELETED]%')`
        )
        .bind(account.id)
        .first<{ balance: number }>();
      balance = txSum?.balance || 0;
    }

    const rate = await getFxRate(db, account.currency, 'NGN', date);
    totalAssets += balance * rate;
  }

  // 2. Bucket Balances Sum (Source of truth for allocated cash)
  const buckets = await getBucketBalances(db);
  const totalBucketBalances = buckets.reduce((sum, b) => sum + b.balance, 0);
  totalAssets += totalBucketBalances;

  // 3. Investment holdings (defensively queried; table created in Module 6)
  try {
    const { results: investments } = await db
      .prepare('SELECT current_value, currency FROM investments WHERE current_value IS NOT NULL')
      .all<{ current_value: number; currency: string }>();

    for (const inv of investments) {
      const rate = await getFxRate(db, inv.currency || 'NGN', 'NGN', date);
      totalAssets += inv.current_value * rate;
    }
  } catch {
    // Table does not exist yet (pre-Module 6)
  }

  // 4. Liabilities (defensively queried; table created in Module 5)
  try {
    const { results: liabilities } = await db
      .prepare('SELECT current_balance, currency FROM liabilities WHERE current_balance IS NOT NULL')
      .all<{ current_balance: number; currency: string }>();

    for (const liab of liabilities) {
      const rate = await getFxRate(db, liab.currency || 'NGN', 'NGN', date);
      totalLiabilities += liab.current_balance * rate;
    }
  } catch {
    // Table does not exist yet (pre-Module 5)
  }

  totalAssets = Math.round(totalAssets * 100) / 100;
  totalLiabilities = Math.round(totalLiabilities * 100) / 100;
  const netWorth = Math.round((totalAssets - totalLiabilities) * 100) / 100;

  // Insert snapshot record
  const insertRes = await db
    .prepare(
      `INSERT INTO net_worth_snapshots (date, total_assets, total_liabilities, net_worth, base_currency)
       VALUES (?, ?, ?, ?, 'NGN')`
    )
    .bind(date, totalAssets, totalLiabilities, netWorth)
    .run();

  const id = insertRes.meta.last_row_id || 1;

  return {
    id: Number(id),
    date,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: netWorth,
    base_currency: 'NGN',
    created_at: new Date().toISOString(),
  };
}

/**
 * Precomputes aggregate category/bucket totals for a given month into monthly_summaries.
 * Executed on-demand and via nightly cron trigger.
 */
export async function refreshMonthlySummaries(
  db: D1Database,
  targetMonth?: string
): Promise<{ count: number; month: string }> {
  const month = targetMonth || new Date().toISOString().slice(0, 7);
  const now = new Date().toISOString();

  // 1. Category Outflows grouped by category and bucket
  const { results: outflows } = await db
    .prepare(
      `SELECT 
         t.category_id,
         ble.bucket_id,
         SUM(t.amount) as total_amount
       FROM transactions t
       JOIN bucket_ledger_entries ble ON ble.transaction_id = t.id AND ble.entry_type = 'expense_debit'
       WHERE strftime('%Y-%m', t.date) = ?
         AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
       GROUP BY t.category_id, ble.bucket_id`
    )
    .bind(month)
    .all<{ category_id: number; bucket_id: number; total_amount: number }>();

  // 2. Inflow allocations grouped by bucket
  const { results: inflows } = await db
    .prepare(
      `SELECT 
         ar.bucket_id,
         SUM(ar.amount) as total_amount
       FROM transactions t
       JOIN allocation_runs ar ON ar.transaction_id = t.id
       WHERE strftime('%Y-%m', t.date) = ?
         AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
       GROUP BY ar.bucket_id`
    )
    .bind(month)
    .all<{ bucket_id: number; total_amount: number }>();

  // Atomic batch: clear existing month records and insert fresh aggregates
  const batchStatements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM monthly_summaries WHERE month = ?').bind(month),
  ];

  for (const row of outflows) {
    batchStatements.push(
      db
        .prepare(
          `INSERT INTO monthly_summaries (month, category_id, bucket_id, total_amount, refreshed_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(month, row.category_id, row.bucket_id, Math.round(row.total_amount * 100) / 100, now)
    );
  }

  for (const row of inflows) {
    batchStatements.push(
      db
        .prepare(
          `INSERT INTO monthly_summaries (month, category_id, bucket_id, total_amount, refreshed_at)
           VALUES (?, NULL, ?, ?, ?)`
        )
        .bind(month, row.bucket_id, Math.round(row.total_amount * 100) / 100, now)
    );
  }

  await db.batch(batchStatements);

  return {
    count: outflows.length + inflows.length,
    month,
  };
}

/**
 * Aggregates all KPI metrics and charts for Screen 1: Financial Health Dashboard.
 */
export async function getHealthDashboardData(db: D1Database): Promise<HealthDashboardData> {
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Compute prior month 'YYYY-MM'
  const currentDate = new Date();
  const priorDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const priorMonth = priorDate.toISOString().slice(0, 7);

  // 1. Current Net Worth & Historical Trend
  let latestSnapshot = await db
    .prepare('SELECT * FROM net_worth_snapshots ORDER BY date DESC, id DESC LIMIT 1')
    .first<NetWorthSnapshot>();

  if (!latestSnapshot) {
    latestSnapshot = await computeNetWorth(db);
  }

  const { results: netWorthTrend } = await db
    .prepare(
      `SELECT date, net_worth, total_assets, total_liabilities 
       FROM net_worth_snapshots 
       ORDER BY date ASC LIMIT 365`
    )
    .all<{ date: string; net_worth: number; total_assets: number; total_liabilities: number }>();

  // 2. Savings + Investment Rate (This Month vs Last Month)
  // Gross inflow this month
  const thisMonthGross = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as gross 
       FROM transactions 
       WHERE direction = 'inflow' 
         AND strftime('%Y-%m', date) = ? 
         AND (note IS NULL OR note NOT LIKE '[DELETED]%')`
    )
    .bind(currentMonth)
    .first<{ gross: number }>();

  // Savings & Invest allocations this month
  const thisMonthSavingsInvest = await db
    .prepare(
      `SELECT COALESCE(SUM(ar.amount), 0) as saved 
       FROM allocation_runs ar
       JOIN transactions t ON ar.transaction_id = t.id
       JOIN allocation_buckets b ON ar.bucket_id = b.id
       WHERE b.key IN ('savings', 'invest')
         AND strftime('%Y-%m', t.date) = ?
         AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')`
    )
    .bind(currentMonth)
    .first<{ saved: number }>();

  const grossVal = thisMonthGross?.gross || 0;
  const savedVal = thisMonthSavingsInvest?.saved || 0;
  const thisMonthRate = grossVal > 0 ? Math.round((savedVal / grossVal) * 1000) / 10 : 0;

  // Last month rate
  const lastMonthGross = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as gross 
       FROM transactions 
       WHERE direction = 'inflow' 
         AND strftime('%Y-%m', date) = ? 
         AND (note IS NULL OR note NOT LIKE '[DELETED]%')`
    )
    .bind(priorMonth)
    .first<{ gross: number }>();

  const lastMonthSavingsInvest = await db
    .prepare(
      `SELECT COALESCE(SUM(ar.amount), 0) as saved 
       FROM allocation_runs ar
       JOIN transactions t ON ar.transaction_id = t.id
       JOIN allocation_buckets b ON ar.bucket_id = b.id
       WHERE b.key IN ('savings', 'invest')
         AND strftime('%Y-%m', t.date) = ?
         AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')`
    )
    .bind(priorMonth)
    .first<{ saved: number }>();

  const lastGrossVal = lastMonthGross?.gross || 0;
  const lastSavedVal = lastMonthSavingsInvest?.saved || 0;
  const lastMonthRate = lastGrossVal > 0 ? Math.round((lastSavedVal / lastGrossVal) * 1000) / 10 : 0;
  const rateChange = Math.round((thisMonthRate - lastMonthRate) * 10) / 10;

  // 3. Allocation Waterfall for Current Month
  const { results: bucketSplits } = await db
    .prepare(
      `SELECT 
         b.key,
         COALESCE(SUM(ar.amount), 0) as total
       FROM allocation_buckets b
       LEFT JOIN allocation_runs ar ON b.id = ar.bucket_id
       LEFT JOIN transactions t ON ar.transaction_id = t.id 
         AND strftime('%Y-%m', t.date) = ?
         AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
       GROUP BY b.key`
    )
    .bind(currentMonth)
    .all<{ key: string; total: number }>();

  const splitsMap: Record<string, number> = {
    tithe: 0,
    kingdom: 0,
    savings: 0,
    invest: 0,
    charity: 0,
    expense: 0,
  };
  for (const s of bucketSplits) {
    splitsMap[s.key] = Math.round(s.total * 100) / 100;
  }

  // 4. Budget Adherence Summary (Always paired with breakdown and worst offenders)
  let categoriesBreakdown: Array<{
    category_id: number;
    category_name: string;
    planned: number;
    actual: number;
    variance_pct: number;
  }> = [];

  try {
    // If budgets table exists (Module 4)
    const { results: budgetRows } = await db
      .prepare(
        `SELECT 
           c.id as category_id,
           c.name as category_name,
           b.planned_amount as planned,
           COALESCE(SUM(t.amount), 0) as actual
         FROM budgets b
         JOIN categories c ON b.category_id = c.id
         LEFT JOIN transactions t ON t.category_id = c.id 
           AND t.direction = 'outflow'
           AND strftime('%Y-%m', t.date) = ?
           AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
         WHERE b.month = ?
         GROUP BY c.id, c.name, b.planned_amount`
      )
      .bind(currentMonth, currentMonth)
      .all<{ category_id: number; category_name: string; planned: number; actual: number }>();

    if (budgetRows.length > 0) {
      categoriesBreakdown = budgetRows.map((r) => {
        const planned = r.planned;
        const actual = Math.round(r.actual * 100) / 100;
        const variance_pct = planned > 0 ? Math.round(((actual - planned) / planned) * 1000) / 10 : 0;
        return {
          category_id: r.category_id,
          category_name: r.category_name,
          planned,
          actual,
          variance_pct,
        };
      });
    }
  } catch {
    // Budgets table not yet created
  }

  // If no budgets configured yet, summarize active category spend
  if (categoriesBreakdown.length === 0) {
    const { results: catSpend } = await db
      .prepare(
        `SELECT 
           c.id as category_id,
           c.name as category_name,
           COALESCE(SUM(t.amount), 0) as actual
         FROM categories c
         JOIN transactions t ON t.category_id = c.id 
           AND t.direction = 'outflow'
           AND strftime('%Y-%m', t.date) = ?
           AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
         GROUP BY c.id, c.name
         HAVING actual > 0`
      )
      .bind(currentMonth)
      .all<{ category_id: number; category_name: string; actual: number }>();

    categoriesBreakdown = catSpend.map((r) => ({
      category_id: r.category_id,
      category_name: r.category_name,
      planned: 0,
      actual: Math.round(r.actual * 100) / 100,
      variance_pct: 0,
    }));
  }

  const totalPlanned = categoriesBreakdown.reduce((sum, c) => sum + c.planned, 0);
  const totalActual = categoriesBreakdown.reduce((sum, c) => sum + c.actual, 0);
  let overallAdherencePct = 100;
  if (totalPlanned > 0) {
    overallAdherencePct = Math.max(
      0,
      Math.round((100 - Math.max(0, ((totalActual - totalPlanned) / totalPlanned) * 100)) * 10) / 10
    );
  }

  const worstOffenders = categoriesBreakdown
    .filter((c) => c.actual > c.planned && c.planned > 0)
    .map((c) => ({
      ...c,
      overage_amount: Math.round((c.actual - c.planned) * 100) / 100,
    }))
    .sort((a, b) => b.overage_amount - a.overage_amount)
    .slice(0, 3);

  // 5. Bucket Runway Indicator (Expenses bucket balance / 30-day average daily outflow)
  const buckets = await getBucketBalances(db);
  const expenseBucket = buckets.find((b) => b.key === 'expense');
  const expenseBalance = expenseBucket?.balance || 0;

  const past30DaysOutflow = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total_outflow 
       FROM transactions 
       WHERE direction = 'outflow' 
         AND date >= date('now', '-30 days')
         AND (note IS NULL OR note NOT LIKE '[DELETED]%')`
    )
    .first<{ total_outflow: number }>();

  const totalOutflow30 = past30DaysOutflow?.total_outflow || 0;
  const avgDailyBurn = Math.round((totalOutflow30 / 30) * 100) / 100;
  const runwayDays = avgDailyBurn > 0 && expenseBalance > 0 
    ? Math.round(expenseBalance / avgDailyBurn) 
    : (expenseBalance > 0 ? 999 : 0);

  return {
    net_worth_current: latestSnapshot.net_worth,
    net_worth_trend: netWorthTrend,
    savings_invest_rate: {
      this_month_pct: thisMonthRate,
      last_month_pct: lastMonthRate,
      change_pct: rateChange,
    },
    allocation_waterfall: {
      month: currentMonth,
      gross_inflow: grossVal,
      splits: splitsMap,
    },
    budget_adherence_summary: {
      overall_adherence_pct: overallAdherencePct,
      categories: categoriesBreakdown,
      worst_offenders: worstOffenders,
    },
    runway: {
      expenses_balance: expenseBalance,
      avg_daily_burn: avgDailyBurn,
      runway_days: runwayDays,
    },
  };
}

/**
 * Aggregates real-time metrics for Screen 2: Money Movement / Ledger Dashboard.
 */
export async function getLedgerDashboardData(db: D1Database): Promise<LedgerDashboardData> {
  // 1. Live bucket cards
  const buckets = await getBucketBalances(db);

  // 2. Daily inflow/outflow series for past 30 days
  const { results: dailyRaw } = await db
    .prepare(
      `SELECT 
         date,
         COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE 0 END), 0) as inflow,
         COALESCE(SUM(CASE WHEN direction = 'outflow' THEN amount ELSE 0 END), 0) as outflow
       FROM transactions
       WHERE date >= date('now', '-30 days')
         AND (note IS NULL OR note NOT LIKE '[DELETED]%')
       GROUP BY date
       ORDER BY date ASC`
    )
    .all<{ date: string; inflow: number; outflow: number }>();

  const dailySeries = dailyRaw.map((d) => ({
    date: d.date,
    inflow: Math.round(d.inflow * 100) / 100,
    outflow: Math.round(d.outflow * 100) / 100,
  }));

  // 3. Recent 10 transactions
  const { results: recent } = await db
    .prepare(
      `SELECT 
         t.*,
         c.name as category_name,
         b.name as bucket_name,
         a.name as account_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN bucket_ledger_entries ble ON ble.transaction_id = t.id AND ble.entry_type IN ('expense_debit', 'allocation_credit')
       LEFT JOIN allocation_buckets b ON ble.bucket_id = b.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
       GROUP BY t.id
       ORDER BY t.date DESC, t.id DESC
       LIMIT 10`
    )
    .all<Transaction & { category_name?: string; bucket_name?: string; account_name?: string }>();

  // 4. Upcoming commitments (due in <= 3 days, active)
  let upcoming: any[] = [];
  try {
    const { getRecurringTransactions } = await import('./commitments');
    const recurringRes = await getRecurringTransactions(db, { activeOnly: true });
    upcoming = recurringRes.recurring.filter((r) => r.is_upcoming);
  } catch {
    // commitments table may not exist in pre-Module 5 tests
  }

  return {
    buckets,
    daily_series: dailySeries,
    recent_transactions: recent,
    upcoming_commitments: upcoming,
  };
}
