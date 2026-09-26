import type {
  Budget,
  BudgetVarianceItem,
  WorstOffender,
  OverallAdherenceResult,
  BudgetTrendItem,
} from '../types';

/**
 * Calculates the previous calendar month in 'YYYY-MM' format.
 */
export function getPreviousMonth(monthStr: string): string {
  const parts = monthStr.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);

  if (month === 1) {
    year -= 1;
    month = 12;
  } else {
    month -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Generates an inclusive array of 'YYYY-MM' strings between fromMonth and toMonth.
 */
export function getMonthRange(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  let current = fromMonth;

  while (current <= toMonth) {
    months.push(current);
    const [yStr, mStr] = current.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10);
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
    current = `${y}-${String(m).padStart(2, '0')}`;
  }

  return months;
}

/**
 * Computes category-level planned vs. actual outflow spend for a given month.
 * Returns variance percentage and visual status indicator (under / warning / over).
 */
export async function getBudgetVariance(
  db: D1Database,
  month: string
): Promise<BudgetVarianceItem[]> {
  const { results } = await db
    .prepare(
      `SELECT 
         c.id as category_id,
         c.name as category_name,
         c.default_bucket_id as bucket_id,
         ab.key as bucket_key,
         COALESCE(b.planned_amount, 0) as planned,
         COALESCE(SUM(
           CASE 
             WHEN t.direction = 'outflow' AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%') 
             THEN t.amount 
             ELSE 0 
           END
         ), 0) as actual
       FROM categories c
       LEFT JOIN allocation_buckets ab ON c.default_bucket_id = ab.id
       LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
       LEFT JOIN transactions t ON t.category_id = c.id 
         AND t.direction = 'outflow'
         AND strftime('%Y-%m', t.date) = ?
         AND (t.note IS NULL OR t.note NOT LIKE '[DELETED]%')
       GROUP BY c.id, c.name, c.default_bucket_id, ab.key, b.planned_amount
       ORDER BY c.name ASC`
    )
    .bind(month, month)
    .all<{
      category_id: number;
      category_name: string;
      bucket_id: number | null;
      bucket_key: string | null;
      planned: number;
      actual: number;
    }>();

  return results.map((r) => {
    const planned = Math.round(Number(r.planned) * 100) / 100;
    const actual = Math.round(Number(r.actual) * 100) / 100;
    const overage_amount = Math.max(0, Math.round((actual - planned) * 100) / 100);

    let variance_pct = 0;
    if (planned > 0) {
      variance_pct = Math.round(((actual - planned) / planned) * 1000) / 10;
    } else if (actual > 0) {
      variance_pct = 100.0;
    }

    let status: 'under' | 'warning' | 'over' = 'under';
    if (planned > 0) {
      if (actual > planned) {
        status = 'over';
      } else if (actual >= planned * 0.8) {
        status = 'warning';
      } else {
        status = 'under';
      }
    } else if (actual > 0) {
      status = 'over';
    }

    return {
      category_id: r.category_id,
      category_name: r.category_name,
      bucket_id: r.bucket_id,
      bucket_key: r.bucket_key,
      planned,
      actual,
      variance_pct,
      overage_amount,
      status,
    };
  });
}

/**
 * Computes overall budget adherence percentage for a month.
 * Non-negative formula: 100 - MAX(0, ((Total Actual - Total Planned) / Total Planned) * 100).
 * Strictly paired with full category breakdown and worst 3 offenders.
 */
export async function getOverallAdherence(
  db: D1Database,
  month: string
): Promise<OverallAdherenceResult> {
  const categories = await getBudgetVariance(db, month);

  const total_planned = Math.round(
    categories.reduce((acc, cat) => acc + cat.planned, 0) * 100
  ) / 100;

  const total_actual = Math.round(
    categories.reduce((acc, cat) => acc + cat.actual, 0) * 100
  ) / 100;

  let overall_adherence_pct = 100;
  if (total_planned > 0) {
    const overagePct = ((total_actual - total_planned) / total_planned) * 100;
    const rawAdherence = 100 - Math.max(0, overagePct);
    overall_adherence_pct = Math.max(0, Math.round(rawAdherence * 10) / 10);
  } else if (total_actual > 0) {
    // If no planned budget was set but funds were spent, adherence is 0%
    overall_adherence_pct = 0;
  }

  const worst_offenders: WorstOffender[] = categories
    .filter((c) => c.actual > c.planned)
    .map((c) => ({
      category_id: c.category_id,
      category_name: c.category_name,
      planned: c.planned,
      actual: c.actual,
      overage_amount: c.overage_amount,
      variance_pct: c.variance_pct,
    }))
    .sort((a, b) => b.overage_amount - a.overage_amount)
    .slice(0, 3);

  return {
    month,
    overall_adherence_pct,
    total_planned,
    total_actual,
    categories,
    worst_offenders,
  };
}

/**
 * Upserts a single planned budget amount for a category and month.
 */
export async function setBudget(
  db: D1Database,
  month: string,
  categoryId: number,
  plannedAmount: number
): Promise<Budget> {
  const amount = Math.max(0, Math.round(plannedAmount * 100) / 100);

  await db
    .prepare(
      `INSERT INTO budgets (month, category_id, planned_amount)
       VALUES (?, ?, ?)
       ON CONFLICT(month, category_id) DO UPDATE SET planned_amount = excluded.planned_amount`
    )
    .bind(month, categoryId, amount)
    .run();

  const record = await db
    .prepare(`SELECT * FROM budgets WHERE month = ? AND category_id = ?`)
    .bind(month, categoryId)
    .first<Budget>();

  if (!record) {
    throw new Error('Failed to retrieve upserted budget record');
  }

  return record;
}

/**
 * Bulk upserts planned budget amounts for a month.
 */
export async function setBulkBudgets(
  db: D1Database,
  month: string,
  items: Array<{ category_id: number; planned_amount: number }>
): Promise<{ count: number; month: string }> {
  if (items.length === 0) {
    return { count: 0, month };
  }

  const statements: D1PreparedStatement[] = items.map((item) => {
    const amount = Math.max(0, Math.round(item.planned_amount * 100) / 100);
    return db
      .prepare(
        `INSERT INTO budgets (month, category_id, planned_amount)
         VALUES (?, ?, ?)
         ON CONFLICT(month, category_id) DO UPDATE SET planned_amount = excluded.planned_amount`
      )
      .bind(month, item.category_id, amount);
  });

  await db.batch(statements);

  return {
    count: items.length,
    month,
  };
}

/**
 * Copies budget planned amounts from previous month (targetMonth - 1) into targetMonth.
 */
export async function copyPreviousMonthBudget(
  db: D1Database,
  targetMonth: string
): Promise<{
  count: number;
  target_month: string;
  previous_month: string;
  items: Array<{ category_id: number; planned_amount: number }>;
}> {
  const previousMonth = getPreviousMonth(targetMonth);

  const { results: prevBudgets } = await db
    .prepare(`SELECT category_id, planned_amount FROM budgets WHERE month = ?`)
    .bind(previousMonth)
    .all<{ category_id: number; planned_amount: number }>();

  if (prevBudgets.length === 0) {
    return {
      count: 0,
      target_month: targetMonth,
      previous_month: previousMonth,
      items: [],
    };
  }

  const batchStatements: D1PreparedStatement[] = prevBudgets.map((b) =>
    db
      .prepare(
        `INSERT INTO budgets (month, category_id, planned_amount)
         VALUES (?, ?, ?)
         ON CONFLICT(month, category_id) DO UPDATE SET planned_amount = excluded.planned_amount`
      )
      .bind(targetMonth, b.category_id, b.planned_amount)
  );

  await db.batch(batchStatements);

  return {
    count: prevBudgets.length,
    target_month: targetMonth,
    previous_month: previousMonth,
    items: prevBudgets,
  };
}

/**
 * Returns month-over-month overall adherence trend series between fromMonth and toMonth.
 */
export async function getBudgetTrend(
  db: D1Database,
  fromMonth: string,
  toMonth: string
): Promise<BudgetTrendItem[]> {
  const months = getMonthRange(fromMonth, toMonth);
  const trend: BudgetTrendItem[] = [];

  for (const m of months) {
    const adherence = await getOverallAdherence(db, m);
    trend.push({
      month: m,
      overall_adherence_pct: adherence.overall_adherence_pct,
      total_planned: adherence.total_planned,
      total_actual: adherence.total_actual,
    });
  }

  return trend;
}
