import { Hono } from 'hono';
import type { Env } from '../types';
import {
  getLiabilitiesSummary,
  createLiability,
  updateLiability,
  deleteLiability,
} from '../lib/commitments';

const app = new Hono<{ Bindings: Env }>();

// GET /api/liabilities — List liabilities and totals
app.get('/', async (c) => {
  const result = await getLiabilitiesSummary(c.env.DB);
  return c.json(result);
});

// POST /api/liabilities — Create liability
app.post('/', async (c) => {
  const body = await c.req.json<{
    name: string;
    type: string;
    principal: number;
    current_balance: number;
    interest_rate?: number | null;
    minimum_payment?: number | null;
    due_date?: string | null;
    lender?: string | null;
    currency?: string;
  }>();

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Liability name is required' }, 400);
  }
  if (!body.principal || typeof body.principal !== 'number' || body.principal <= 0) {
    return c.json({ error: 'Principal must be a positive number' }, 400);
  }
  if (body.current_balance === undefined || typeof body.current_balance !== 'number' || body.current_balance < 0) {
    return c.json({ error: 'Current balance must be a non-negative number' }, 400);
  }

  try {
    const liability = await createLiability(c.env.DB, body);
    return c.json({ liability }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create liability' }, 400);
  }
});

// PATCH /api/liabilities/:id — Update liability
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid liability ID' }, 400);
  }

  const body = await c.req.json<{
    name?: string;
    type?: string;
    principal?: number;
    current_balance?: number;
    interest_rate?: number | null;
    minimum_payment?: number | null;
    due_date?: string | null;
    lender?: string | null;
    currency?: string;
  }>();

  try {
    const updated = await updateLiability(c.env.DB, id, body);
    if (!updated) {
      return c.json({ error: 'Liability not found' }, 404);
    }
    return c.json({ liability: updated });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update liability' }, 400);
  }
});

// DELETE /api/liabilities/:id — Delete liability
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid liability ID' }, 400);
  }

  const success = await deleteLiability(c.env.DB, id);
  if (!success) {
    return c.json({ error: 'Liability not found' }, 404);
  }
  return c.json({ success: true, message: 'Liability removed successfully' });
});

export default app;
