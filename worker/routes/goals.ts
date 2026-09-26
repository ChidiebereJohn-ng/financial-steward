import { Hono } from 'hono';
import type { Env } from '../types';
import {
  getGoalsWithProgress,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../lib/commitments';

const app = new Hono<{ Bindings: Env }>();

// GET /api/goals — List all goals with live progress computed against linked bucket
app.get('/', async (c) => {
  const goals = await getGoalsWithProgress(c.env.DB);
  return c.json({ goals });
});

// POST /api/goals — Create a new goal
app.post('/', async (c) => {
  const body = await c.req.json<{
    name: string;
    target_amount: number;
    target_date?: string | null;
    linked_bucket_id?: number | null;
  }>();

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Goal name is required' }, 400);
  }
  if (!body.target_amount || typeof body.target_amount !== 'number' || body.target_amount <= 0) {
    return c.json({ error: 'Target amount must be a positive number' }, 400);
  }

  try {
    const goal = await createGoal(c.env.DB, body);
    return c.json({ goal }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create goal' }, 400);
  }
});

// PATCH /api/goals/:id — Edit a goal
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid goal ID' }, 400);
  }

  const body = await c.req.json<{
    name?: string;
    target_amount?: number;
    target_date?: string | null;
    linked_bucket_id?: number | null;
  }>();

  try {
    const updated = await updateGoal(c.env.DB, id, body);
    if (!updated) {
      return c.json({ error: 'Goal not found' }, 404);
    }
    return c.json({ goal: updated });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update goal' }, 400);
  }
});

// DELETE /api/goals/:id — Delete a goal
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid goal ID' }, 400);
  }

  const success = await deleteGoal(c.env.DB, id);
  if (!success) {
    return c.json({ error: 'Goal not found' }, 404);
  }
  return c.json({ success: true, message: 'Goal removed successfully' });
});

export default app;
