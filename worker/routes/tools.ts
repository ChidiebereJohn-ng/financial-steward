import { Hono } from 'hono';
import type { Env } from '../types';
import {
  calculatePurchaseRisk,
  getPurchaseCalculations,
  getDigestItems,
  markDigestItemRead,
  createDigestItem,
  generateResearchBriefings,
} from '../lib/tools';
import { generateFullCsvExport } from '../lib/export';

const app = new Hono<{ Bindings: Env }>();

// ----------------------------------------------------
// Screen 8: Purchase Risk Calculator Routes
// ----------------------------------------------------

// POST /api/purchase-calculator — Evaluate item cost against net worth snapshot
app.post('/purchase-calculator', async (c) => {
  const body = await c.req.json<{
    item: string;
    cost: number;
    date?: string;
  }>();

  if (!body.item || typeof body.item !== 'string' || body.item.trim() === '') {
    return c.json({ error: 'Item name is required' }, 400);
  }
  if (typeof body.cost !== 'number' || isNaN(body.cost) || body.cost < 0) {
    return c.json({ error: 'Valid non-negative purchase cost is required' }, 400);
  }

  try {
    const result = await calculatePurchaseRisk(c.env.DB, {
      item: body.item,
      cost: body.cost,
      date: body.date,
    });
    return c.json({ calculation: result }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to calculate purchase risk' }, 400);
  }
});

// GET /api/purchase-calculator/history — Retrieve calculation history
app.get('/purchase-calculator/history', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const calculations = await getPurchaseCalculations(c.env.DB, limit);
  return c.json({ calculations });
});

// ----------------------------------------------------
// Screen 11: Research Digest Routes
// ----------------------------------------------------

// GET /api/digest — List curated research digest items (newest first)
app.get('/digest', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const items = await getDigestItems(c.env.DB, limit);
  return c.json({ items });
});

// PATCH /api/digest/:id/read — Toggle or set read status
app.patch('/digest/:id/read', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: 'Invalid digest item ID' }, 400);
  }

  const body = await c.req.json<{ read_status?: number }>().catch(() => ({ read_status: 1 }));
  const readStatus = body.read_status !== undefined ? (body.read_status ? 1 : 0) : 1;

  try {
    const updated = await markDigestItemRead(c.env.DB, id, readStatus);
    if (!updated) {
      return c.json({ error: 'Digest item not found' }, 404);
    }
    return c.json({ item: updated });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update digest item' }, 400);
  }
});

// PATCH /api/digest/:id — Generic patch alias for mark read
app.patch('/digest/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: 'Invalid digest item ID' }, 400);
  }

  const body = await c.req.json<{ read_status?: number }>().catch(() => ({ read_status: 1 }));
  const readStatus = body.read_status !== undefined ? (body.read_status ? 1 : 0) : 1;

  try {
    const updated = await markDigestItemRead(c.env.DB, id, readStatus);
    if (!updated) {
      return c.json({ error: 'Digest item not found' }, 404);
    }
    return c.json({ item: updated });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update digest item' }, 400);
  }
});

// POST /api/digest — Create a new curated digest item
app.post('/digest', async (c) => {
  const body = await c.req.json<{
    topic: string;
    summary: string;
    source_url?: string | null;
    read_status?: number;
  }>();

  if (!body.topic || typeof body.topic !== 'string') {
    return c.json({ error: 'Topic is required' }, 400);
  }
  if (!body.summary || typeof body.summary !== 'string') {
    return c.json({ error: 'Summary is required' }, 400);
  }

  try {
    const item = await createDigestItem(c.env.DB, body);
    return c.json({ item }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create digest item' }, 400);
  }
});

// POST /api/digest/refresh — Generate updated paper-asset research briefings
app.post('/digest/refresh', async (c) => {
  try {
    const result = await generateResearchBriefings(c.env.DB, c.env.CLAUDE_API_KEY);
    const allItems = await getDigestItems(c.env.DB, 50);
    return c.json({
      message: `Successfully generated ${result.added.length} research briefing(s)`,
      source: result.source,
      added: result.added,
      items: allItems,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to refresh research digest' }, 500);
  }
});

// POST /api/digest/generate — Alias for refresh
app.post('/digest/generate', async (c) => {
  try {
    const result = await generateResearchBriefings(c.env.DB, c.env.CLAUDE_API_KEY);
    const allItems = await getDigestItems(c.env.DB, 50);
    return c.json({
      message: `Successfully generated ${result.added.length} research briefing(s)`,
      source: result.source,
      added: result.added,
      items: allItems,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to generate research digest' }, 500);
  }
});

// ----------------------------------------------------
// Full Data Export Route
// ----------------------------------------------------

// GET /api/export — Full data export in RFC 4180 CSV format
app.get('/export', async (c) => {
  const format = c.req.query('format') || 'csv';
  if (format !== 'csv') {
    return c.json({ error: 'Unsupported format. Use format=csv' }, 400);
  }

  try {
    const csvContent = await generateFullCsvExport(c.env.DB);
    const filename = `financial_steward_export_${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to generate CSV export' }, 500);
  }
});

// ----------------------------------------------------
// Database Reset / Clean Slate Route
// ----------------------------------------------------

app.post('/database/reset', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM bucket_transfers;'),
      c.env.DB.prepare('DELETE FROM bucket_ledger_entries;'),
      c.env.DB.prepare('DELETE FROM allocation_runs;'),
      c.env.DB.prepare('DELETE FROM transaction_audit_log;'),
      c.env.DB.prepare('DELETE FROM transactions;'),
      c.env.DB.prepare('DELETE FROM recurring_transactions;'),
      c.env.DB.prepare('DELETE FROM budgets;'),
      c.env.DB.prepare('DELETE FROM goals;'),
      c.env.DB.prepare('DELETE FROM liabilities;'),
      c.env.DB.prepare('DELETE FROM investment_price_updates;'),
      c.env.DB.prepare('DELETE FROM investments;'),
      c.env.DB.prepare('DELETE FROM purchase_calculations;'),
      c.env.DB.prepare('DELETE FROM import_batches;'),
      c.env.DB.prepare('DELETE FROM monthly_summaries;'),
      c.env.DB.prepare('DELETE FROM net_worth_snapshots;'),
      c.env.DB.prepare('UPDATE accounts SET last_reconciled_balance = 0.0;'),
      c.env.DB.prepare(`
        DELETE FROM sqlite_sequence WHERE name IN (
          'transactions',
          'allocation_runs',
          'bucket_ledger_entries',
          'bucket_transfers',
          'transaction_audit_log',
          'recurring_transactions',
          'budgets',
          'goals',
          'liabilities',
          'investments',
          'investment_price_updates',
          'purchase_calculations',
          'import_batches',
          'net_worth_snapshots',
          'monthly_summaries'
        );
      `),
      c.env.DB.prepare(`
        INSERT INTO net_worth_snapshots (date, total_assets, total_liabilities, net_worth, base_currency)
        VALUES (?, 0.0, 0.0, 0.0, 'NGN');
      `).bind(today),
    ]);

    return c.json({
      success: true,
      message: 'Database successfully cleared. Fresh clean slate initialized.',
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to reset database' }, 500);
  }
});

export default app;
