import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { errorHandler } from './middleware/error';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import referenceRoutes from './routes/reference';

const app = new Hono<{ Bindings: Env }>();

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
    module: 'Module 1: Foundation',
    timestamp: new Date().toISOString()
  });
});

// Authentication middleware applied across /api (middleware handles public exceptions)
app.use('/api/*', authMiddleware);

// Route mounts
app.route('/api/auth', authRoutes);
app.route('/api', referenceRoutes);

// Fallback 404
app.notFound((c) => {
  return c.json({ error: 'Endpoint not found' }, 404);
});

export default app;
