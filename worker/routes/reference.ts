import { Hono } from 'hono';
import type { Env, AllocationRule, Category, IncomeSource, Account } from '../types';

const app = new Hono<{ Bindings: Env }>();

// -------------------------------------------------------------
// ALLOCATION RULES
// -------------------------------------------------------------

// GET /api/allocation-rules — List all versions
app.get('/allocation-rules', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT * FROM allocation_rules ORDER BY version DESC'
  ).all<AllocationRule>();

  return c.json({ rules: result.results || [] });
});

// GET /api/allocation-rules/current — Active rule
app.get('/allocation-rules/current', async (c) => {
  const rule = await c.env.DB.prepare(
    'SELECT * FROM allocation_rules WHERE effective_to IS NULL ORDER BY version DESC LIMIT 1'
  ).first<AllocationRule>();

  if (!rule) {
    return c.json({ error: 'No active allocation rule found' }, 404);
  }

  return c.json({ rule });
});

// POST /api/allocation-rules — Create new version (closes out previous)
app.post('/allocation-rules', async (c) => {
  const body = await c.req.json<{
    tithe_pct: number;
    kingdom_pct: number;
    savings_pct: number;
    invest_pct: number;
    charity_pct: number;
    expense_pct: number;
  }>();

  const { tithe_pct, kingdom_pct, savings_pct, invest_pct, charity_pct, expense_pct } = body;

  if (
    typeof tithe_pct !== 'number' ||
    typeof kingdom_pct !== 'number' ||
    typeof savings_pct !== 'number' ||
    typeof invest_pct !== 'number' ||
    typeof charity_pct !== 'number' ||
    typeof expense_pct !== 'number'
  ) {
    return c.json({ error: 'All percentage fields are required numbers' }, 400);
  }

  // Validate percentages: remainder components must sum to 100%
  const remainderSum = savings_pct + invest_pct + charity_pct + expense_pct;
  if (Math.abs(remainderSum - 100) > 0.001) {
    return c.json({
      error: `Remainder percentages (savings, invest, charity, expense) must sum to 100. Got ${remainderSum}`
    }, 400);
  }

  if (tithe_pct + kingdom_pct >= 100 || tithe_pct < 0 || kingdom_pct < 0) {
    return c.json({ error: 'Tithe and Kingdom percentages must be positive and leave a remainder' }, 400);
  }

  // Get current active rule to determine next version
  const current = await c.env.DB.prepare(
    'SELECT version FROM allocation_rules WHERE effective_to IS NULL ORDER BY version DESC LIMIT 1'
  ).first<{ version: number }>();

  const nextVersion = (current?.version || 0) + 1;
  const now = new Date().toISOString().slice(0, 10);

  // Close out old rule and insert new one
  const batch = await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE allocation_rules SET effective_to = ? WHERE effective_to IS NULL'
    ).bind(now),
    c.env.DB.prepare(`
      INSERT INTO allocation_rules 
      (version, tithe_pct, kingdom_pct, savings_pct, invest_pct, charity_pct, expense_pct, effective_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(nextVersion, tithe_pct, kingdom_pct, savings_pct, invest_pct, charity_pct, expense_pct, now)
  ]);

  const newRule = await c.env.DB.prepare(
    'SELECT * FROM allocation_rules WHERE version = ?'
  ).bind(nextVersion).first<AllocationRule>();

  return c.json({ rule: newRule }, 201);
});

// -------------------------------------------------------------
// CATEGORIES
// -------------------------------------------------------------

// GET /api/categories — List all
app.get('/categories', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT c.*, b.key as default_bucket_key, b.name as default_bucket_name
    FROM categories c
    LEFT JOIN allocation_buckets b ON c.default_bucket_id = b.id
    ORDER BY c.type, c.name ASC
  `).all();

  return c.json({ categories: result.results || [] });
});

// POST /api/categories — Create category
app.post('/categories', async (c) => {
  const body = await c.req.json<{
    name: string;
    default_bucket_id?: number | null;
    bucket_is_flexible?: number | boolean;
    type?: 'expense' | 'income';
  }>();

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Category name is required' }, 400);
  }

  const name = body.name.trim();
  const flexible = body.bucket_is_flexible ? 1 : 0;
  const defaultBucketId = body.default_bucket_id ?? null;
  const type = body.type || 'expense';

  const insert = await c.env.DB.prepare(`
    INSERT INTO categories (name, default_bucket_id, bucket_is_flexible, type)
    VALUES (?, ?, ?, ?)
  `).bind(name, defaultBucketId, flexible, type).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ?'
  ).bind(insert.meta.last_row_id).first<Category>();

  return c.json({ category: created }, 201);
});

// PATCH /api/categories/:id — Edit category
app.patch('/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    name?: string;
    default_bucket_id?: number | null;
    bucket_is_flexible?: number | boolean;
  }>();

  const existing = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<Category>();
  if (!existing) {
    return c.json({ error: 'Category not found' }, 404);
  }

  const updatedName = body.name !== undefined ? body.name.trim() : existing.name;
  const updatedBucket = body.default_bucket_id !== undefined ? body.default_bucket_id : existing.default_bucket_id;
  const updatedFlexible = body.bucket_is_flexible !== undefined ? (body.bucket_is_flexible ? 1 : 0) : existing.bucket_is_flexible;

  await c.env.DB.prepare(`
    UPDATE categories 
    SET name = ?, default_bucket_id = ?, bucket_is_flexible = ?
    WHERE id = ?
  `).bind(updatedName, updatedBucket, updatedFlexible, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<Category>();
  return c.json({ category: updated });
});

// -------------------------------------------------------------
// INCOME SOURCES
// -------------------------------------------------------------

// GET /api/income-sources — List all
app.get('/income-sources', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM income_sources ORDER BY name ASC').all<IncomeSource>();
  return c.json({ income_sources: result.results || [] });
});

// POST /api/income-sources — Create income source
app.post('/income-sources', async (c) => {
  const body = await c.req.json<{ name: string }>();
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Income source name is required' }, 400);
  }

  const name = body.name.trim();
  const insert = await c.env.DB.prepare('INSERT INTO income_sources (name) VALUES (?)').bind(name).run();

  const created = await c.env.DB.prepare('SELECT * FROM income_sources WHERE id = ?').bind(insert.meta.last_row_id).first<IncomeSource>();
  return c.json({ income_source: created }, 201);
});

// -------------------------------------------------------------
// ACCOUNTS
// -------------------------------------------------------------

// GET /api/accounts — List all
app.get('/accounts', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM accounts ORDER BY name ASC').all<Account>();
  return c.json({ accounts: result.results || [] });
});

// POST /api/accounts — Create account
app.post('/accounts', async (c) => {
  const body = await c.req.json<{
    name: string;
    type: string;
    currency?: string;
    institution?: string;
  }>();

  if (!body.name || !body.type) {
    return c.json({ error: 'Account name and type are required' }, 400);
  }

  const name = body.name.trim();
  const type = body.type.trim();
  const currency = body.currency?.trim() || 'NGN';
  const institution = body.institution?.trim() || null;

  const insert = await c.env.DB.prepare(`
    INSERT INTO accounts (name, type, currency, institution)
    VALUES (?, ?, ?, ?)
  `).bind(name, type, currency, institution).run();

  const created = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(insert.meta.last_row_id).first<Account>();
  return c.json({ account: created }, 201);
});

// POST /api/accounts/:id/reconcile — Reconcile account with statement balance
app.post('/accounts/:id/reconcile', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid account ID' }, 400);
  }

  const body = await c.req.json<{
    actual_balance: number;
    date?: string;
  }>();

  if (body.actual_balance === undefined || typeof body.actual_balance !== 'number') {
    return c.json({ error: 'actual_balance number is required' }, 400);
  }

  try {
    const { reconcileAccount } = await import('../lib/commitments');
    const result = await reconcileAccount(c.env.DB, id, body.actual_balance, body.date);
    return c.json({ data: result });
  } catch (err: any) {
    return c.json({ error: err.message || 'Reconciliation failed' }, 400);
  }
});

export default app;
