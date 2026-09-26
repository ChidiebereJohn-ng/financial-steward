import { Hono } from 'hono';
import type { Env, OverrideSplit, Transaction } from '../types';
import {
  deleteTransaction,
  editTransaction,
  recordExpense,
  runAllocation,
} from '../lib/ledger';

const transactionsApp = new Hono<{ Bindings: Env }>();

/**
 * GET /api/transactions
 * Filterable and paginated transaction list.
 */
transactionsApp.get('/', async (c) => {
  const query = c.req.query();
  const from = query.from;
  const to = query.to;
  const categoryId = query.category_id ? Number(query.category_id) : undefined;
  const accountId = query.account_id ? Number(query.account_id) : undefined;
  const bucketId = query.bucket_id ? Number(query.bucket_id) : undefined;
  const direction = query.direction as 'inflow' | 'outflow' | undefined;
  const minAmount = query.min_amount ? Number(query.min_amount) : undefined;
  const maxAmount = query.max_amount ? Number(query.max_amount) : undefined;
  const limit = Math.min(query.limit ? Number(query.limit) : 50, 100);
  const cursor = query.cursor ? Number(query.cursor) : undefined;

  const conditions: string[] = [];
  const params: any[] = [];

  if (from) {
    conditions.push('t.date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('t.date <= ?');
    params.push(to);
  }
  if (categoryId) {
    conditions.push('t.category_id = ?');
    params.push(categoryId);
  }
  if (accountId) {
    conditions.push('t.account_id = ?');
    params.push(accountId);
  }
  if (direction) {
    conditions.push('t.direction = ?');
    params.push(direction);
  }
  if (minAmount !== undefined) {
    conditions.push('t.amount >= ?');
    params.push(minAmount);
  }
  if (maxAmount !== undefined) {
    conditions.push('t.amount <= ?');
    params.push(maxAmount);
  }
  if (cursor) {
    conditions.push('t.id < ?');
    params.push(cursor);
  }
  if (bucketId) {
    conditions.push(
      't.id IN (SELECT transaction_id FROM bucket_ledger_entries WHERE bucket_id = ? AND transaction_id IS NOT NULL)'
    );
    params.push(bucketId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      t.*,
      c.name as category_name,
      a.name as account_name,
      i.name as income_source_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN income_sources i ON t.income_source_id = i.id
    ${whereClause}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ?
  `;

  params.push(limit + 1);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<any>();

  let nextCursor: number | null = null;
  if (results.length > limit) {
    const nextItem = results.pop();
    nextCursor = nextItem.id;
  }

  return c.json({
    data: results,
    next_cursor: nextCursor,
    count: results.length,
  });
});

/**
 * GET /api/transactions/:id
 * Detailed transaction view with audit trail, allocation runs, and ledger entries.
 */
transactionsApp.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid transaction id' }, 400);
  }

  const tx = await c.env.DB.prepare(
    `SELECT 
      t.*,
      c.name as category_name,
      a.name as account_name,
      i.name as income_source_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN income_sources i ON t.income_source_id = i.id
    WHERE t.id = ?`
  )
    .bind(id)
    .first<any>();

  if (!tx) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  // Fetch allocation runs if inflow
  const { results: allocationRuns } = await c.env.DB.prepare(
    `SELECT ar.*, b.name as bucket_name, b.key as bucket_key
     FROM allocation_runs ar
     JOIN allocation_buckets b ON ar.bucket_id = b.id
     WHERE ar.transaction_id = ?`
  )
    .bind(id)
    .all<any>();

  // Fetch bucket ledger entries
  const { results: ledgerEntries } = await c.env.DB.prepare(
    `SELECT ble.*, b.name as bucket_name, b.key as bucket_key
     FROM bucket_ledger_entries ble
     JOIN allocation_buckets b ON ble.bucket_id = b.id
     WHERE ble.transaction_id = ?
     ORDER BY ble.id ASC`
  )
    .bind(id)
    .all<any>();

  // Fetch audit log
  const { results: auditLog } = await c.env.DB.prepare(
    `SELECT * FROM transaction_audit_log WHERE transaction_id = ? ORDER BY id ASC`
  )
    .bind(id)
    .all<any>();

  return c.json({
    transaction: tx,
    allocation_runs: allocationRuns,
    ledger_entries: ledgerEntries,
    audit_log: auditLog,
  });
});

/**
 * POST /api/transactions
 * Creates a transaction and automatically routes to the allocation engine (inflow)
 * or records the expense debit (outflow).
 */
transactionsApp.post('/', async (c) => {
  const body = await c.req.json();
  const {
    date,
    direction,
    amount,
    currency = 'NGN',
    category_id,
    account_id,
    income_source_id,
    note,
    purpose_label,
    subtype,
    external_id,
    override_split,
    chosen_bucket_id,
  } = body;

  // Validations
  if (!date || !direction || amount === undefined) {
    return c.json({ error: 'date, direction, and amount are required' }, 400);
  }

  if (direction !== 'inflow' && direction !== 'outflow') {
    return c.json({ error: "direction must be 'inflow' or 'outflow'" }, 400);
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: 'amount must be a positive number' }, 400);
  }

  // Purpose label rule: required when category = 'Other' (or purpose_label needed)
  if (category_id) {
    const cat = await c.env.DB.prepare('SELECT name, bucket_is_flexible FROM categories WHERE id = ?')
      .bind(category_id)
      .first<{ name: string; bucket_is_flexible: number }>();
    if (cat?.name.toLowerCase() === 'other' && !purpose_label) {
      return c.json({ error: "purpose_label is required when category is 'Other'" }, 400);
    }
    if (direction === 'outflow' && cat?.bucket_is_flexible === 1 && !chosen_bucket_id) {
      return c.json(
        { error: `chosen_bucket_id is required for flexible category '${cat.name}'` },
        400
      );
    }
  }

  if (subtype === 'bucket_deploy' && !purpose_label) {
    return c.json({ error: "purpose_label is required when subtype is 'bucket_deploy'" }, 400);
  }

  // Deduplication by external_id
  if (external_id) {
    const existing = await c.env.DB.prepare('SELECT id FROM transactions WHERE external_id = ?')
      .bind(external_id)
      .first();
    if (existing) {
      return c.json({ error: `Transaction with external_id '${external_id}' already exists` }, 409);
    }
  }

  // Insert base transaction
  const insertRes = await c.env.DB.prepare(
    `INSERT INTO transactions 
     (external_id, date, direction, subtype, amount, currency, category_id, account_id, income_source_id, note, purpose_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      external_id ?? null,
      date,
      direction,
      subtype ?? null,
      numAmount,
      currency,
      category_id ?? null,
      account_id ?? null,
      income_source_id ?? null,
      note ?? null,
      purpose_label ?? null
    )
    .run();

  const transactionId = insertRes.meta.last_row_id;

  const transaction: Transaction = {
    id: transactionId,
    external_id: external_id ?? null,
    date,
    direction,
    subtype: subtype ?? null,
    amount: numAmount,
    currency,
    category_id: category_id ?? null,
    account_id: account_id ?? null,
    income_source_id: income_source_id ?? null,
    note: note ?? null,
    purpose_label: purpose_label ?? null,
    allocation_rule_version: null,
    is_override: 0,
    attachment_url: null,
    created_at: new Date().toISOString(),
  };

  try {
    if (direction === 'inflow') {
      const allocation = await runAllocation(c.env.DB, transaction, override_split);
      return c.json(
        {
          transaction: {
            ...transaction,
            is_override: allocation.isOverride ? 1 : 0,
            allocation_rule_version: allocation.ruleVersion,
          },
          allocation_splits: allocation.splits,
          message: 'Inflow transaction created and allocated across 6 buckets',
        },
        201
      );
    } else {
      const expense = await recordExpense(c.env.DB, transaction, chosen_bucket_id);
      return c.json(
        {
          transaction,
          debited_bucket_id: expense.bucketId,
          message: 'Outflow transaction created and debited from bucket',
        },
        201
      );
    }
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to process transaction ledger entries' }, 400);
  }
});

/**
 * PATCH /api/transactions/:id
 * Edits a transaction. Offsets existing ledger entries if financial fields changed,
 * reapplies business logic, and records each changed field in transaction_audit_log.
 */
transactionsApp.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid transaction id' }, 400);
  }

  const changes = await c.req.json();

  try {
    const result = await editTransaction(c.env.DB, id, changes);
    return c.json({
      transaction: result.updated,
      audit_entries_logged: result.auditCount,
      ledger_reversed_and_reapplied: result.reversed,
      message: 'Transaction updated successfully',
    });
  } catch (err: any) {
    if (err.message.includes('not found')) {
      return c.json({ error: err.message }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

/**
 * DELETE /api/transactions/:id
 * Soft deletion: reverses associated bucket_ledger_entries with offsetting entries
 * and logs the deletion in transaction_audit_log.
 */
transactionsApp.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid transaction id' }, 400);
  }

  try {
    const result = await deleteTransaction(c.env.DB, id);
    return c.json({
      success: true,
      reversed_entries_count: result.reversedCount,
      message: 'Transaction successfully reversed and marked as deleted',
    });
  } catch (err: any) {
    if (err.message.includes('not found')) {
      return c.json({ error: err.message }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

export default transactionsApp;
