import { Hono } from 'hono';
import type { Env } from '../types';
import {
  getRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  confirmRecurringTransaction,
} from '../lib/commitments';

const app = new Hono<{ Bindings: Env }>();

// GET /api/recurring — List recurring transactions with days_until_due and upcoming flag
app.get('/', async (c) => {
  const activeOnly = c.req.query('active') === 'true';
  const refDate = c.req.query('reference_date');
  const result = await getRecurringTransactions(c.env.DB, {
    activeOnly,
    referenceDate: refDate,
  });
  return c.json(result);
});

// POST /api/recurring — Create a recurring transaction
app.post('/', async (c) => {
  const body = await c.req.json<{
    category_id?: number | null;
    bucket_id?: number | null;
    account_id?: number | null;
    direction: 'inflow' | 'outflow';
    amount: number;
    currency?: string;
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    next_due_date: string;
    active?: number;
    note?: string | null;
  }>();

  if (!body.direction || (body.direction !== 'inflow' && body.direction !== 'outflow')) {
    return c.json({ error: 'direction must be inflow or outflow' }, 400);
  }
  if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
    return c.json({ error: 'amount must be a positive number' }, 400);
  }
  if (!body.frequency || !['weekly', 'monthly', 'quarterly', 'yearly'].includes(body.frequency)) {
    return c.json({ error: 'frequency must be weekly, monthly, quarterly, or yearly' }, 400);
  }
  if (!body.next_due_date || typeof body.next_due_date !== 'string') {
    return c.json({ error: 'next_due_date is required (YYYY-MM-DD)' }, 400);
  }

  try {
    const recurring = await createRecurringTransaction(c.env.DB, body);
    return c.json({ recurring }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create recurring transaction' }, 400);
  }
});

// PATCH /api/recurring/:id — Edit or deactivate recurring transaction
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid recurring transaction ID' }, 400);
  }

  const body = await c.req.json<{
    category_id?: number | null;
    bucket_id?: number | null;
    account_id?: number | null;
    direction?: 'inflow' | 'outflow';
    amount?: number;
    currency?: string;
    frequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    next_due_date?: string;
    active?: number;
    note?: string | null;
  }>();

  try {
    const updated = await updateRecurringTransaction(c.env.DB, id, body);
    if (!updated) {
      return c.json({ error: 'Recurring transaction not found' }, 404);
    }
    return c.json({ recurring: updated });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update recurring transaction' }, 400);
  }
});

// DELETE /api/recurring/:id — Delete recurring transaction
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid recurring transaction ID' }, 400);
  }

  const success = await deleteRecurringTransaction(c.env.DB, id);
  if (!success) {
    return c.json({ error: 'Recurring transaction not found' }, 404);
  }
  return c.json({ success: true, message: 'Recurring transaction removed successfully' });
});

// POST /api/recurring/:id/confirm — Confirm and execute commitment
app.post('/:id/confirm', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid recurring transaction ID' }, 400);
  }

  const body = await c.req.json<{ date?: string }>().catch(() => ({ date: undefined }));

  try {
    const result = await confirmRecurringTransaction(c.env.DB, id, body?.date);
    return c.json({
      success: true,
      message: 'Recurring commitment confirmed and transaction posted',
      data: result,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to confirm recurring transaction' }, 400);
  }
});

export default app;
