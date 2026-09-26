import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppVariables, Env } from './types';
import { errorHandler } from './middleware/error';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import referenceRoutes from './routes/reference';
import transactionsRoutes from './routes/transactions';
import bucketsRoutes from './routes/buckets';
import dashboardsRoutes from './routes/dashboards';
import netWorthRoutes from './routes/networth';
import budgetsRoutes from './routes/budgets';
import { refreshMonthlySummaries, computeNetWorth } from './lib/analytics';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Global CORS & Error Handler
app.use('*', cors({
  origin: (origin) => origin, // In production, restrict to frontend Pages domain
  allowHeaders: ['Content-Type', 'Authorization', 'x-dev-bypass'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.onError(errorHandler);

// Public health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    app: 'Financial Steward API',
    module: 'Module 4: Budgets (Adherence %, Category Variance, Charts)',
    timestamp: new Date().toISOString()
  });
});

// Authentication middleware applied across /api (middleware handles public exceptions)
app.use('/api/*', authMiddleware);

// Route mounts
app.route('/api/auth', authRoutes);
app.route('/api', referenceRoutes);
app.route('/api/transactions', transactionsRoutes);
app.route('/api/buckets', bucketsRoutes);
app.route('/api/dashboard', dashboardsRoutes);
app.route('/api/net-worth', netWorthRoutes);
app.route('/api/budgets', budgetsRoutes);

// Fallback 404
app.notFound((c) => {
  return c.json({ error: 'Endpoint not found' }, 404);
});

// Scheduled cron handler for Cloudflare Workers
export async function handleScheduled(
  event: { cron: string; scheduledTime: number },
  env: Env,
  ctx?: { waitUntil: (p: Promise<any>) => void }
) {
  const promise = (async () => {
    console.log(`[CRON] Execution started at ${new Date().toISOString()} for cron: "${event.cron}"`);
    try {
      // 0 1 * * * -> Nightly at 01:00 UTC: net worth snapshot and monthly_summaries refresh
      const summariesResult = await refreshMonthlySummaries(env.DB);
      console.log(`[CRON] Refreshed ${summariesResult.count} monthly summary rows for ${summariesResult.month}`);

      const snapshotResult = await computeNetWorth(env.DB);
      console.log(`[CRON] Computed net worth snapshot: ₦${snapshotResult.net_worth} (Assets: ₦${snapshotResult.total_assets})`);
    } catch (err) {
      console.error('[CRON] Execution failed:', err);
    }
  })();

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(promise);
  } else {
    await promise;
  }
}

// Attach scheduled handler directly to the export
const exportObject = Object.assign(app, {
  scheduled: handleScheduled,
});

export default exportObject;
