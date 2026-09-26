import { Hono } from 'hono';
import type { Env } from '../types';
import {
  getHealthDashboardData,
  getLedgerDashboardData,
  refreshMonthlySummaries,
} from '../lib/analytics';

const dashboardsApp = new Hono<{ Bindings: Env }>();

/**
 * GET /api/dashboard/health
 * Returns progressive/cumulative metrics: net worth trend, savings/investment rates,
 * waterfall split distribution, paired budget adherence, and bucket runway.
 */
dashboardsApp.get('/health', async (c) => {
  const data = await getHealthDashboardData(c.env.DB);
  return c.json({ data });
});

/**
 * GET /api/dashboard/ledger
 * Returns real-time money movement metrics: 6 live bucket balances,
 * 30-day daily inflow/outflow series, and 10 recent transactions.
 */
dashboardsApp.get('/ledger', async (c) => {
  const data = await getLedgerDashboardData(c.env.DB);
  return c.json({ data });
});

/**
 * POST /api/dashboard/refresh-summaries
 * Trigger on-demand recomputation of monthly summaries for a specified or current month.
 */
dashboardsApp.post('/refresh-summaries', async (c) => {
  let month: string | undefined;
  try {
    const body = await c.req.json();
    month = body.month;
  } catch {
    // Body optional
  }

  const result = await refreshMonthlySummaries(c.env.DB, month);
  return c.json({
    message: 'Monthly summaries refreshed successfully',
    ...result,
  });
});

export default dashboardsApp;
