import { Hono } from 'hono';
import type { AllocationBucket, Env } from '../types';
import { getBucketBalances, transferBetweenBuckets } from '../lib/ledger';

const bucketsApp = new Hono<{ Bindings: Env }>();

/**
 * GET /api/buckets
 * Returns all 6 allocation buckets with live computed balances from bucket_ledger_entries.
 */
bucketsApp.get('/', async (c) => {
  const buckets = await getBucketBalances(c.env.DB);
  return c.json({ data: buckets });
});

/**
 * GET /api/buckets/:id/ledger
 * Returns paginated ledger journal for a single bucket.
 */
bucketsApp.get('/:id/ledger', async (c) => {
  const bucketId = Number(c.req.param('id'));
  if (isNaN(bucketId)) {
    return c.json({ error: 'Invalid bucket id' }, 400);
  }

  // Verify bucket exists
  const bucket = await c.env.DB.prepare('SELECT * FROM allocation_buckets WHERE id = ?')
    .bind(bucketId)
    .first<AllocationBucket>();

  if (!bucket) {
    return c.json({ error: 'Bucket not found' }, 404);
  }

  const query = c.req.query();
  const limit = Math.min(query.limit ? Number(query.limit) : 50, 100);
  const cursor = query.cursor ? Number(query.cursor) : undefined;

  const conditions = ['ble.bucket_id = ?'];
  const params: any[] = [bucketId];

  if (cursor) {
    conditions.push('ble.id < ?');
    params.push(cursor);
  }

  const sql = `
    SELECT 
      ble.*,
      t.note as transaction_note,
      t.direction as transaction_direction
    FROM bucket_ledger_entries ble
    LEFT JOIN transactions t ON ble.transaction_id = t.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ble.date DESC, ble.id DESC
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
    bucket,
    data: results,
    next_cursor: nextCursor,
    count: results.length,
  });
});

/**
 * POST /api/buckets/transfer
 * Moves funds between two allocation buckets atomically.
 */
bucketsApp.post('/transfer', async (c) => {
  const body = await c.req.json();
  const { from_bucket_id, to_bucket_id, amount, reason, date } = body;

  if (!from_bucket_id || !to_bucket_id || amount === undefined) {
    return c.json(
      { error: 'from_bucket_id, to_bucket_id, and amount are required' },
      400
    );
  }

  const fromId = Number(from_bucket_id);
  const toId = Number(to_bucket_id);
  const numAmount = Number(amount);
  const transferDate = date || new Date().toISOString().split('T')[0];

  if (isNaN(fromId) || isNaN(toId) || isNaN(numAmount)) {
    return c.json({ error: 'Bucket IDs and amount must be numeric' }, 400);
  }

  if (fromId === toId) {
    return c.json({ error: 'Cannot transfer funds to the same bucket' }, 400);
  }

  if (numAmount <= 0) {
    return c.json({ error: 'Transfer amount must be strictly greater than 0' }, 400);
  }

  try {
    const result = await transferBetweenBuckets(
      c.env.DB,
      fromId,
      toId,
      numAmount,
      reason ?? null,
      transferDate
    );

    return c.json(
      {
        transfer_id: result.transferId,
        from_ledger_entry_id: result.outEntryId,
        to_ledger_entry_id: result.inEntryId,
        amount: numAmount,
        message: 'Bucket transfer executed successfully',
      },
      201
    );
  } catch (err: any) {
    return c.json({ error: err.message || 'Transfer failed' }, 400);
  }
});

/**
 * POST /api/buckets/adjust
 * Manual balance adjustment entry on a bucket.
 */
bucketsApp.post('/adjust', async (c) => {
  const body = await c.req.json();
  const { bucket_id, amount, reason, date } = body;

  if (!bucket_id || amount === undefined || !reason) {
    return c.json({ error: 'bucket_id, amount, and reason are required' }, 400);
  }

  const bucketId = Number(bucket_id);
  const numAmount = Number(amount);
  const adjustDate = date || new Date().toISOString().split('T')[0];

  if (isNaN(bucketId) || isNaN(numAmount)) {
    return c.json({ error: 'bucket_id and amount must be numeric' }, 400);
  }

  if (numAmount === 0) {
    return c.json({ error: 'Adjustment amount cannot be zero' }, 400);
  }

  // Verify bucket exists
  const bucket = await c.env.DB.prepare('SELECT id, name FROM allocation_buckets WHERE id = ?')
    .bind(bucketId)
    .first<AllocationBucket>();

  if (!bucket) {
    return c.json({ error: 'Bucket not found' }, 404);
  }

  const insertRes = await c.env.DB.prepare(
    `INSERT INTO bucket_ledger_entries (bucket_id, entry_type, amount, date, note)
     VALUES (?, 'manual_adjustment', ?, ?, ?)`
  )
    .bind(bucketId, numAmount, adjustDate, reason)
    .run();

  return c.json(
    {
      entry_id: insertRes.meta.last_row_id,
      bucket_id: bucketId,
      amount: numAmount,
      reason,
      message: 'Manual adjustment logged to bucket ledger',
    },
    201
  );
});

export default bucketsApp;
