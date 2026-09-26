import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import {
  createStrategy,
  getStrategies,
  simulateStages,
  simulateStrategy,
} from '../lib/investor';

const strategiesRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 1. List all strategies with stages
strategiesRoutes.get('/', async (c) => {
  const strategies = await getStrategies(c.env.DB);
  return c.json({ strategies });
});

// 2. Create strategy template with stages
strategiesRoutes.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name || !Array.isArray(body.stages) || body.stages.length === 0) {
    return c.json(
      { error: 'name and at least one stage are required' },
      400
    );
  }

  try {
    const created = await createStrategy(c.env.DB, {
      name: body.name,
      description: body.description,
      stages: body.stages,
    });
    return c.json(created, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// 3. Simulate compounding for custom stages (ad-hoc without saving)
strategiesRoutes.post('/simulate', async (c) => {
  const body = await c.req.json();
  const startingCapital = Number(body.starting_capital);
  if (isNaN(startingCapital) || startingCapital <= 0) {
    return c.json({ error: 'Valid starting_capital > 0 is required' }, 400);
  }

  if (!Array.isArray(body.stages) || body.stages.length === 0) {
    return c.json({ error: 'stages array is required' }, 400);
  }

  const result = simulateStages(body.stages, startingCapital, {
    name: body.strategy_name || 'Custom Staged Strategy',
  });
  return c.json(result);
});

// 4. Simulate compounding for an existing strategy ID
strategiesRoutes.post('/:id/simulate', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  const startingCapital = Number(body.starting_capital);
  if (isNaN(startingCapital) || startingCapital <= 0) {
    return c.json({ error: 'Valid starting_capital > 0 is required' }, 400);
  }

  try {
    const result = await simulateStrategy(c.env.DB, id, startingCapital);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

export default strategiesRoutes;
