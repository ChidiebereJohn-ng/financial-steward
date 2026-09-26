import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import {
  getOverallAdherence,
  setBudget,
  setBulkBudgets,
  copyPreviousMonthBudget,
  getBudgetTrend,
  getPreviousMonth,
} from '../lib/budgets';

const budgets = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * GET /api/budgets?month=YYYY-MM
 * Returns planned vs. actual per category plus overall adherence % and worst offenders.
 */
budgets.get('/', async (c) => {
  const monthParam = c.req.query('month');
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = monthParam || currentMonth;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "Invalid month format. Expected 'YYYY-MM'" }, 400);
  }

  const result = await getOverallAdherence(c.env.DB, month);
  return c.json(result);
});

/**
 * GET /api/budgets/trend?from=YYYY-MM&to=YYYY-MM
 * Returns month-over-month overall adherence trend series.
 */
budgets.get('/trend', async (c) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  let toMonth = c.req.query('to') || currentMonth;
  let fromMonth = c.req.query('from');

  if (!fromMonth) {
    // Default to 5 months before toMonth (6 months total)
    let m = toMonth;
    for (let i = 0; i < 5; i++) {
      m = getPreviousMonth(m);
    }
    fromMonth = m;
  }

  if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
    return c.json({ error: "Invalid month format for 'from' or 'to'. Expected 'YYYY-MM'" }, 400);
  }

  if (fromMonth > toMonth) {
    return c.json({ error: "'from' month cannot be after 'to' month" }, 400);
  }

  const series = await getBudgetTrend(c.env.DB, fromMonth, toMonth);
  return c.json({
    from: fromMonth,
    to: toMonth,
    series,
  });
});

/**
 * POST /api/budgets
 * Sets or updates planned amounts. Supports single item or bulk items array.
 */
budgets.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { month, category_id, planned_amount, items } = body;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "Missing or invalid 'month'. Expected 'YYYY-MM'" }, 400);
  }

  // Bulk upsert pattern
  if (Array.isArray(items)) {
    for (const item of items) {
      if (typeof item.category_id !== 'number' || item.category_id <= 0) {
        return c.json({ error: "Each item must have a valid positive 'category_id'" }, 400);
      }
      if (typeof item.planned_amount !== 'number' || item.planned_amount < 0) {
        return c.json({ error: "Each item must have a non-negative 'planned_amount'" }, 400);
      }
    }

    const bulkResult = await setBulkBudgets(c.env.DB, month, items);
    const updated = await getOverallAdherence(c.env.DB, month);
    return c.json({
      success: true,
      count: bulkResult.count,
      month,
      adherence: updated,
    });
  }

  // Single item pattern
  if (typeof category_id !== 'number' || category_id <= 0) {
    return c.json({ error: "Missing or invalid 'category_id'" }, 400);
  }
  if (typeof planned_amount !== 'number' || planned_amount < 0) {
    return c.json({ error: "Missing or invalid 'planned_amount' (must be non-negative)" }, 400);
  }

  const budget = await setBudget(c.env.DB, month, category_id, planned_amount);
  const updated = await getOverallAdherence(c.env.DB, month);

  return c.json({
    success: true,
    budget,
    adherence: updated,
  }, 201);
});

/**
 * POST /api/budgets/copy-previous
 * Copies planned amounts from targetMonth - 1 into targetMonth.
 */
budgets.post('/copy-previous', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const currentMonth = new Date().toISOString().slice(0, 7);
  const targetMonth = body.target_month || currentMonth;

  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return c.json({ error: "Invalid 'target_month' format. Expected 'YYYY-MM'" }, 400);
  }

  const result = await copyPreviousMonthBudget(c.env.DB, targetMonth);
  const updated = await getOverallAdherence(c.env.DB, targetMonth);

  return c.json({
    success: true,
    ...result,
    adherence: updated,
  });
});

export default budgets;
