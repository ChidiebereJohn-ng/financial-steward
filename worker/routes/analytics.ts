import { Hono } from 'hono';
import type { Env } from '../types';

const analyticsApp = new Hono<{ Bindings: Env }>();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * GET /api/analytics/periods
 * Returns distinct available years and months from actual transaction history.
 */
analyticsApp.get('/periods', async (c) => {
  const { results: yearsRaw } = await c.env.DB
    .prepare(
      `SELECT DISTINCT strftime('%Y', date) as year 
       FROM transactions 
       WHERE (note IS NULL OR note NOT LIKE '%[DELETED]%') 
       ORDER BY year DESC`
    )
    .all<{ year: string }>();

  const { results: monthsRaw } = await c.env.DB
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', date) as month 
       FROM transactions 
       WHERE (note IS NULL OR note NOT LIKE '%[DELETED]%') 
       ORDER BY month DESC`
    )
    .all<{ month: string }>();

  const years = yearsRaw.map((y) => y.year).filter(Boolean);
  const months = monthsRaw.map((m) => m.month).filter(Boolean);

  return c.json({ years, months });
});

/**
 * GET /api/analytics/breakdown
 * Rich cash-flow and category breakdown endpoint.
 * Supports: view='day' | 'month' | 'year'
 */
analyticsApp.get('/breakdown', async (c) => {
  const query = c.req.query();
  const view = (query.view || 'month').toLowerCase() as 'day' | 'month' | 'year';
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);
  const currentYearStr = todayStr.slice(0, 4);

  let targetDate = query.date || todayStr;
  let targetMonth = query.month || currentMonthStr;
  let targetYear = query.year || currentYearStr;

  // Validate format fallbacks
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) targetDate = todayStr;
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) targetMonth = currentMonthStr;
  if (!/^\d{4}$/.test(targetYear)) targetYear = currentYearStr;

  let whereClause = '';
  let periodParam = '';
  let currentPeriod = '';
  let label = '';
  let previousPeriod = '';
  let nextPeriod = '';

  if (view === 'day') {
    whereClause = 't.date = ?';
    periodParam = targetDate;
    currentPeriod = targetDate;

    const d = new Date(targetDate + 'T00:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    label = dayName;

    // Previous and Next day
    const prevDateObj = new Date(d);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    previousPeriod = prevDateObj.toISOString().slice(0, 10);

    const nextDateObj = new Date(d);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    nextPeriod = nextDateObj.toISOString().slice(0, 10);
  } else if (view === 'year') {
    whereClause = "strftime('%Y', t.date) = ?";
    periodParam = targetYear;
    currentPeriod = targetYear;
    label = `Year ${targetYear}`;

    const y = parseInt(targetYear, 10);
    previousPeriod = String(y - 1);
    nextPeriod = String(y + 1);
  } else {
    // Default: 'month'
    whereClause = "strftime('%Y-%m', t.date) = ?";
    periodParam = targetMonth;
    currentPeriod = targetMonth;

    const [yStr, mStr] = targetMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    label = `${MONTH_NAMES[m - 1] || 'Month'} ${y}`;

    // Previous and next month calculations
    const prevMonthNum = m === 1 ? 12 : m - 1;
    const prevYearNum = m === 1 ? y - 1 : y;
    previousPeriod = `${prevYearNum}-${String(prevMonthNum).padStart(2, '0')}`;

    const nextMonthNum = m === 12 ? 1 : m + 1;
    const nextYearNum = m === 12 ? y + 1 : y;
    nextPeriod = `${nextYearNum}-${String(nextMonthNum).padStart(2, '0')}`;
  }

  // 1. Overall Summary Totals in Period
  const summaryRaw = await c.env.DB
    .prepare(
      `SELECT 
         COALESCE(SUM(CASE WHEN t.direction = 'inflow' THEN t.amount ELSE 0 END), 0) as total_inflow,
         COALESCE(SUM(CASE WHEN t.direction = 'outflow' THEN t.amount ELSE 0 END), 0) as total_outflow,
         COUNT(t.id) as transaction_count
       FROM transactions t
       WHERE ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')`
    )
    .bind(periodParam)
    .first<{ total_inflow: number; total_outflow: number; transaction_count: number }>();

  const totalInflow = Math.round((summaryRaw?.total_inflow || 0) * 100) / 100;
  const totalOutflow = Math.round((summaryRaw?.total_outflow || 0) * 100) / 100;
  const netDelta = Math.round((totalInflow - totalOutflow) * 100) / 100;
  const transactionCount = summaryRaw?.transaction_count || 0;

  // 2. Savings & Investment: Gross Waterfall Allocated vs. Inter-Bucket Net Retained
  const savingsInvestRaw = await c.env.DB
    .prepare(
      `SELECT COALESCE(SUM(ar.amount), 0) as saved 
       FROM allocation_runs ar
       JOIN transactions t ON ar.transaction_id = t.id
       JOIN allocation_buckets b ON ar.bucket_id = b.id
       WHERE b.key IN ('savings', 'invest')
         AND ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')`
    )
    .bind(periodParam)
    .first<{ saved: number }>();

  const savingsInvestAllocated = Math.round((savingsInvestRaw?.saved || 0) * 100) / 100;

  // Inter-bucket transfers on savings & invest buckets in this period
  const btDateClause = view === 'day' ? 'bt.date = ?' : view === 'year' ? "strftime('%Y', bt.date) = ?" : "strftime('%Y-%m', bt.date) = ?";

  const savingsInvestTransfersRaw = await c.env.DB
    .prepare(
      `SELECT 
         COALESCE(SUM(CASE WHEN tb.key IN ('savings', 'invest') THEN bt.amount ELSE 0 END), 0) as transfer_in,
         COALESCE(SUM(CASE WHEN fb.key IN ('savings', 'invest') THEN bt.amount ELSE 0 END), 0) as transfer_out
       FROM bucket_transfers bt
       JOIN allocation_buckets fb ON bt.from_bucket_id = fb.id
       JOIN allocation_buckets tb ON bt.to_bucket_id = tb.id
       WHERE ${btDateClause}`
    )
    .bind(periodParam)
    .first<{ transfer_in: number; transfer_out: number }>();

  // Any direct expense debits on savings/invest buckets
  const bleDateClause = view === 'day' ? 'ble.date = ?' : view === 'year' ? "strftime('%Y', ble.date) = ?" : "strftime('%Y-%m', ble.date) = ?";

  const directDebitsRaw = await c.env.DB
    .prepare(
      `SELECT COALESCE(SUM(ble.amount), 0) as debits
       FROM bucket_ledger_entries ble
       JOIN allocation_buckets b ON ble.bucket_id = b.id
       WHERE b.key IN ('savings', 'invest')
         AND ble.entry_type = 'expense_debit'
         AND ${bleDateClause}`
    )
    .bind(periodParam)
    .first<{ debits: number }>();

  const transferIn = Math.round((savingsInvestTransfersRaw?.transfer_in || 0) * 100) / 100;
  const transferOut = Math.round((savingsInvestTransfersRaw?.transfer_out || 0) * 100) / 100;
  const directDebits = Math.round((directDebitsRaw?.debits || 0) * 100) / 100;
  const savingsInvestNetRetained = Math.max(0, Math.round((savingsInvestAllocated + transferIn - transferOut - directDebits) * 100) / 100);

  const savingsGrossRate = totalInflow > 0 ? Math.round((savingsInvestAllocated / totalInflow) * 1000) / 10 : 0;
  const savingsNetRate = totalInflow > 0 ? Math.round((savingsInvestNetRetained / totalInflow) * 1000) / 10 : 0;

  // 3. Time Series Chart Data
  let timeSeries: Array<{ key: string; label: string; inflow: number; outflow: number; net: number }> = [];

  if (view === 'year') {
    // 12 months for the year
    const { results: monthlyRows } = await c.env.DB
      .prepare(
        `SELECT 
           strftime('%m', t.date) as m_num,
           COALESCE(SUM(CASE WHEN t.direction = 'inflow' THEN t.amount ELSE 0 END), 0) as inflow,
           COALESCE(SUM(CASE WHEN t.direction = 'outflow' THEN t.amount ELSE 0 END), 0) as outflow
         FROM transactions t
         WHERE strftime('%Y', t.date) = ?
           AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
         GROUP BY m_num
         ORDER BY m_num ASC`
      )
      .bind(targetYear)
      .all<{ m_num: string; inflow: number; outflow: number }>();

    const monthMap = new Map<number, { inflow: number; outflow: number }>();
    for (const r of monthlyRows) {
      monthMap.set(parseInt(r.m_num, 10), {
        inflow: Math.round(r.inflow * 100) / 100,
        outflow: Math.round(r.outflow * 100) / 100,
      });
    }

    for (let m = 1; m <= 12; m++) {
      const data = monthMap.get(m) || { inflow: 0, outflow: 0 };
      const mStr = String(m).padStart(2, '0');
      timeSeries.push({
        key: `${targetYear}-${mStr}`,
        label: SHORT_MONTHS[m - 1],
        inflow: data.inflow,
        outflow: data.outflow,
        net: Math.round((data.inflow - data.outflow) * 100) / 100,
      });
    }
  } else if (view === 'month') {
    // Days in the selected month
    const { results: dailyRows } = await c.env.DB
      .prepare(
        `SELECT 
           t.date,
           COALESCE(SUM(CASE WHEN t.direction = 'inflow' THEN t.amount ELSE 0 END), 0) as inflow,
           COALESCE(SUM(CASE WHEN t.direction = 'outflow' THEN t.amount ELSE 0 END), 0) as outflow
         FROM transactions t
         WHERE strftime('%Y-%m', t.date) = ?
           AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
         GROUP BY t.date
         ORDER BY t.date ASC`
      )
      .bind(targetMonth)
      .all<{ date: string; inflow: number; outflow: number }>();

    const dayMap = new Map<string, { inflow: number; outflow: number }>();
    for (const r of dailyRows) {
      dayMap.set(r.date, {
        inflow: Math.round(r.inflow * 100) / 100,
        outflow: Math.round(r.outflow * 100) / 100,
      });
    }

    // Determine number of days in the month
    const [y, m] = targetMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${targetMonth}-${String(day).padStart(2, '0')}`;
      const data = dayMap.get(dayStr) || { inflow: 0, outflow: 0 };
      timeSeries.push({
        key: dayStr,
        label: String(day),
        inflow: data.inflow,
        outflow: data.outflow,
        net: Math.round((data.inflow - data.outflow) * 100) / 100,
      });
    }
  } else {
    // Single Day view: returns hourly or single-day datapoint
    timeSeries.push({
      key: targetDate,
      label: targetDate.slice(5),
      inflow: totalInflow,
      outflow: totalOutflow,
      net: netDelta,
    });
  }

  // 4. Detailed Expense Categories Breakdown
  const { results: expenseCatRows } = await c.env.DB
    .prepare(
      `SELECT 
         c.id as category_id,
         COALESCE(c.name, 'Uncategorized') as category_name,
         ab.id as bucket_id,
         ab.name as bucket_name,
         ab.key as bucket_key,
         COALESCE(SUM(t.amount), 0) as total_amount,
         COUNT(t.id) as transaction_count
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN allocation_buckets ab ON c.default_bucket_id = ab.id
       WHERE t.direction = 'outflow'
         AND ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
       GROUP BY c.id, c.name, ab.id, ab.name, ab.key
       ORDER BY total_amount DESC`
    )
    .bind(periodParam)
    .all<{
      category_id: number | null;
      category_name: string;
      bucket_id: number | null;
      bucket_name: string | null;
      bucket_key: string | null;
      total_amount: number;
      transaction_count: number;
    }>();

  // 5. Fetch all individual expense transactions for expandable category rows
  const { results: expenseTxs } = await c.env.DB
    .prepare(
      `SELECT 
         t.id,
         t.date,
         t.amount,
         t.category_id,
         COALESCE(c.name, 'Uncategorized') as category_name,
         t.note,
         t.purpose_label,
         a.name as account_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.direction = 'outflow'
         AND ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
       ORDER BY t.date DESC, t.id DESC`
    )
    .bind(periodParam)
    .all<{
      id: number;
      date: string;
      amount: number;
      category_id: number | null;
      category_name: string;
      note: string | null;
      purpose_label: string | null;
      account_name: string | null;
    }>();

  // Map individual transactions to their categories
  const expenseTxMap = new Map<string, any[]>();
  for (const tx of expenseTxs) {
    const key = tx.category_id ? String(tx.category_id) : 'uncat';
    if (!expenseTxMap.has(key)) expenseTxMap.set(key, []);
    expenseTxMap.get(key)!.push(tx);
  }

  const expensesByCategory = expenseCatRows.map((cat) => {
    const amt = Math.round(cat.total_amount * 100) / 100;
    const pct = totalOutflow > 0 ? Math.round((amt / totalOutflow) * 1000) / 10 : 0;
    const catKey = cat.category_id ? String(cat.category_id) : 'uncat';
    return {
      category_id: cat.category_id,
      category_name: cat.category_name,
      bucket_id: cat.bucket_id,
      bucket_name: cat.bucket_name,
      bucket_key: cat.bucket_key,
      total_amount: amt,
      percentage: pct,
      transaction_count: cat.transaction_count,
      transactions: expenseTxMap.get(catKey) || [],
    };
  });

  // 6. Detailed Inflows by Source Breakdown
  const { results: inflowSourceRows } = await c.env.DB
    .prepare(
      `SELECT 
         COALESCE(i.id, c.id) as source_id,
         COALESCE(i.name, c.name, 'Direct Inflow') as source_name,
         COALESCE(SUM(t.amount), 0) as total_amount,
         COUNT(t.id) as transaction_count
       FROM transactions t
       LEFT JOIN income_sources i ON t.income_source_id = i.id
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.direction = 'inflow'
         AND ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
       GROUP BY source_id, source_name
       ORDER BY total_amount DESC`
    )
    .bind(periodParam)
    .all<{
      source_id: number | null;
      source_name: string;
      total_amount: number;
      transaction_count: number;
    }>();

  // Inflow individual transactions
  const { results: inflowTxs } = await c.env.DB
    .prepare(
      `SELECT 
         t.id,
         t.date,
         t.amount,
         COALESCE(i.id, c.id) as source_id,
         COALESCE(i.name, c.name, 'Direct Inflow') as source_name,
         t.note,
         a.name as account_name
       FROM transactions t
       LEFT JOIN income_sources i ON t.income_source_id = i.id
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.direction = 'inflow'
         AND ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
       ORDER BY t.date DESC, t.id DESC`
    )
    .bind(periodParam)
    .all<{
      id: number;
      date: string;
      amount: number;
      source_id: number | null;
      source_name: string;
      note: string | null;
      account_name: string | null;
    }>();

  const inflowTxMap = new Map<string, any[]>();
  for (const tx of inflowTxs) {
    const key = tx.source_id ? String(tx.source_id) : tx.source_name;
    if (!inflowTxMap.has(key)) inflowTxMap.set(key, []);
    inflowTxMap.get(key)!.push(tx);
  }

  const inflowsBySource = inflowSourceRows.map((src) => {
    const amt = Math.round(src.total_amount * 100) / 100;
    const pct = totalInflow > 0 ? Math.round((amt / totalInflow) * 1000) / 10 : 0;
    const srcKey = src.source_id ? String(src.source_id) : src.source_name;
    return {
      source_id: src.source_id,
      source_name: src.source_name,
      total_amount: amt,
      percentage: pct,
      transaction_count: src.transaction_count,
      transactions: inflowTxMap.get(srcKey) || [],
    };
  });

  // 7. Full Chronological Activity Feed for the Period (Transactions + Bucket Transfers)
  const { results: allTxs } = await c.env.DB
    .prepare(
      `SELECT 
         t.id,
         t.date,
         t.direction,
         t.subtype,
         t.amount,
         t.currency,
         COALESCE(c.name, 'Uncategorized') as category_name,
         i.name as income_source_name,
         a.name as account_name,
         t.note,
         t.purpose_label
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN income_sources i ON t.income_source_id = i.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE ${whereClause}
         AND (t.note IS NULL OR t.note NOT LIKE '%[DELETED]%')
       ORDER BY t.date DESC, t.id DESC`
    )
    .bind(periodParam)
    .all<any>();

  // Fetch bucket transfers occurring in this period
  const { results: rawTransfers } = await c.env.DB
    .prepare(
      `SELECT 
         bt.id,
         bt.date,
         bt.amount,
         bt.reason,
         fb.id as from_bucket_id,
         fb.name as from_bucket_name,
         fb.key as from_bucket_key,
         tb.id as to_bucket_id,
         tb.name as to_bucket_name,
         tb.key as to_bucket_key
       FROM bucket_transfers bt
       JOIN allocation_buckets fb ON bt.from_bucket_id = fb.id
       JOIN allocation_buckets tb ON bt.to_bucket_id = tb.id
       WHERE ${btDateClause}
       ORDER BY bt.date DESC, bt.id DESC`
    )
    .bind(periodParam)
    .all<any>();

  const formattedTransfers = (rawTransfers || []).map((bt: any) => ({
    id: `transfer-${bt.id}`,
    date: bt.date,
    direction: 'transfer',
    subtype: 'bucket_transfer',
    amount: bt.amount,
    currency: 'NGN',
    category_name: `${bt.from_bucket_name} → ${bt.to_bucket_name}`,
    income_source_name: null,
    account_name: 'Bucket Transfer',
    note: bt.reason || `Transfer from ${bt.from_bucket_name} to ${bt.to_bucket_name}`,
    purpose_label: `${bt.from_bucket_name} → ${bt.to_bucket_name}`,
    from_bucket_name: bt.from_bucket_name,
    to_bucket_name: bt.to_bucket_name,
    from_bucket_key: bt.from_bucket_key,
    to_bucket_key: bt.to_bucket_key,
  }));

  const allActivity = [...(allTxs || []), ...formattedTransfers].sort((a: any, b: any) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const idA = typeof a.id === 'number' ? a.id : parseInt(String(a.id).replace(/\D/g, '') || '0', 10);
    const idB = typeof b.id === 'number' ? b.id : parseInt(String(b.id).replace(/\D/g, '') || '0', 10);
    return idB - idA;
  });

  return c.json({
    period: {
      view,
      current: currentPeriod,
      label,
      previous: previousPeriod,
      next: nextPeriod,
    },
    summary: {
      total_inflow: totalInflow,
      total_outflow: totalOutflow,
      net_delta: netDelta,
      savings_invest_allocated: savingsInvestAllocated,
      savings_invest_gross_rate: savingsGrossRate,
      savings_invest_net: savingsInvestNetRetained,
      savings_invest_transfers: Math.round((transferIn - transferOut) * 100) / 100,
      savings_invest_transfers_out: transferOut,
      savings_invest_transfers_in: transferIn,
      savings_invest_rate: savingsNetRate,
      transaction_count: transactionCount,
      transfer_count: rawTransfers?.length || 0,
    },
    time_series: timeSeries,
    expenses_by_category: expensesByCategory,
    inflows_by_source: inflowsBySource,
    bucket_transfers: rawTransfers || [],
    all_transactions: allActivity,
  });
});

export default analyticsApp;
