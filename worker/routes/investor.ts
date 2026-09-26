import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import {
  createInvestment,
  createStrategy,
  deleteInvestment,
  getInvestmentById,
  getInvestments,
  getLivePrices,
  getPriceHistory,
  getStrategies,
  recordPriceUpdate,
  simulateStages,
  simulateStrategy,
  updateInvestment,
} from '../lib/investor';

const investorRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 1. List holdings with gain/loss & portfolio summary
investorRoutes.get('/', async (c) => {
  const market = c.req.query('market');
  const result = await getInvestments(c.env.DB, { market });
  return c.json(result);
});

// 2. Add holding
investorRoutes.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.symbol_or_name || !body.type || !body.market || body.cost_basis === undefined) {
    return c.json(
      { error: 'symbol_or_name, type, market, and cost_basis are required fields' },
      400
    );
  }

  const holding = await createInvestment(c.env.DB, {
    type: body.type,
    symbol_or_name: body.symbol_or_name,
    market: body.market,
    quantity: body.quantity !== undefined ? Number(body.quantity) : null,
    cost_basis: Number(body.cost_basis),
    currency: body.currency || 'NGN',
    current_value: body.current_value !== undefined ? Number(body.current_value) : null,
    strategy_id: body.strategy_id ? Number(body.strategy_id) : null,
    account_id: body.account_id ? Number(body.account_id) : null,
    initial_price: body.initial_price ? Number(body.initial_price) : null,
  });

  return c.json(holding, 201);
});

// 3. Live price proxy with KV caching (symbols=BTC,ETH,AAPL)
investorRoutes.get('/live-prices', async (c) => {
  const symbolsParam = c.req.query('symbols') || 'BTC,ETH,SOL,AAPL,MSFT';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);

  const prices = await getLivePrices(c.env, symbols);
  return c.json({ prices });
});

// 4. Get single holding
investorRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const holding = await getInvestmentById(c.env.DB, id);
  if (!holding) return c.json({ error: 'Holding not found' }, 404);

  return c.json(holding);
});

// 5. Update holding
investorRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  try {
    const updated = await updateInvestment(c.env.DB, id, body);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// 6. Delete holding
investorRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  await deleteInvestment(c.env.DB, id);
  return c.json({ success: true, message: `Holding ${id} deleted` });
});

// 7. Manual or API price update for holding
investorRoutes.post('/:id/price-update', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json();
  if (body.price === undefined || isNaN(Number(body.price))) {
    return c.json({ error: 'Valid price is required' }, 400);
  }

  try {
    const result = await recordPriceUpdate(
      c.env.DB,
      id,
      Number(body.price),
      body.date,
      body.source || 'manual'
    );
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// 8. Price history for holding
investorRoutes.get('/:id/price-history', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const history = await getPriceHistory(c.env.DB, id);
  return c.json({ history });
});

export default investorRoutes;
