import { Hono } from 'hono';
import type { Env, NetWorthSnapshot } from '../types';
import { computeNetWorth } from '../lib/analytics';

const netWorthApp = new Hono<{ Bindings: Env }>();

/**
 * GET /api/net-worth
 * Lists historical net worth snapshots, ordered newest first.
 * Supports ?limit=, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD
 */
netWorthApp.get('/', async (c) => {
  const query = c.req.query();
  const limit = Math.min(query.limit ? Number(query.limit) : 50, 365);
  const from = query.from;
  const to = query.to;

  const conditions: string[] = [];
  const params: any[] = [];

  if (from) {
    conditions.push('date >= ?');
    params.push(from);
  }

  if (to) {
    conditions.push('date <= ?');
    params.push(to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM net_worth_snapshots ${whereClause} ORDER BY date DESC, id DESC LIMIT ?`;
  params.push(limit);

  const { results: snapshots } = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<NetWorthSnapshot>();

  return c.json({ data: snapshots });
});

/**
 * POST /api/net-worth/snapshot
 * Triggers an on-demand recomputation and saves a new net worth snapshot.
 */
netWorthApp.post('/snapshot', async (c) => {
  let asOfDate: string | undefined;
  try {
    const body = await c.req.json();
    asOfDate = body.as_of_date || body.date;
  } catch {
    // Body optional
  }

  const snapshot = await computeNetWorth(c.env.DB, asOfDate);
  return c.json({
    message: 'Net worth snapshot calculated and saved',
    snapshot,
  }, 201);
});

export default netWorthApp;
