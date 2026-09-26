import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppVariables, Env } from './types';
import { errorHandler } from './middleware/error';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import referenceRoutes from './routes/reference';
import transactionsRoutes from './routes/transactions';
import bucketsRoutes from './routes/buckets';

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
    module: 'Module 2: Ledger + Allocation Engine',
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

// Fallback 404
app.notFound((c) => {
  return c.json({ error: 'Endpoint not found' }, 404);
});

export default app;
