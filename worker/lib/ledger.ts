import type {
  AllocationBucket,
  AllocationRule,
  BucketLedgerEntry,
  BucketWithBalance,
  Category,
  OverrideSplit,
  Transaction,
} from '../types';

export interface AllocationSplits {
  tithe: number;
  kingdom: number;
  savings: number;
  invest: number;
  charity: number;
  expense: number;
}

/**
 * Calculates the exact kobo/cent splits for a gross inflow amount.
 * Phase 1: 10% Tithe, 20% Kingdom
 * Phase 2: Remainder (70%) distributed according to savings_pct, invest_pct, charity_pct, expense_pct
 * Invariant: Sum of all 6 splits strictly equals the gross inflow amount.
 */
export function calculateAllocationSplits(
  amount: number,
  rule: {
    tithe_pct: number;
    kingdom_pct: number;
    savings_pct: number;
    invest_pct: number;
    charity_pct: number;
    expense_pct: number;
  }
): AllocationSplits {
  if (amount <= 0) {
    throw new Error('Inflow amount must be positive');
  }

  // Work in minor units (kobo/cents) to avoid floating point precision drift
  const totalKobo = Math.round(amount * 100);

  // Phase 1: Tithe & Kingdom Investment from gross
  const titheKobo = Math.round(totalKobo * (rule.tithe_pct / 100));
  const kingdomKobo = Math.round(totalKobo * (rule.kingdom_pct / 100));
  const remainderKobo = totalKobo - titheKobo - kingdomKobo;

  // Phase 2: Remainder Base (the "new 100%")
  const savingsKobo = Math.round(remainderKobo * (rule.savings_pct / 100));
  const investKobo = Math.round(remainderKobo * (rule.invest_pct / 100));
  const charityKobo = Math.round(remainderKobo * (rule.charity_pct / 100));
  // Final bucket takes remaining kobo to guarantee zero drift
  const expenseKobo = remainderKobo - savingsKobo - investKobo - charityKobo;

  return {
    tithe: titheKobo / 100,
    kingdom: kingdomKobo / 100,
    savings: savingsKobo / 100,
    invest: investKobo / 100,
    charity: charityKobo / 100,
    expense: expenseKobo / 100,
  };
}

/**
 * Helper to fetch bucket key-to-id mapping from DB.
 */
export async function getBucketMap(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare('SELECT id, key FROM allocation_buckets')
    .all<{ id: number; key: string }>();
  const map: Record<string, number> = {};
  for (const b of results) {
    map[b.key] = b.id;
  }
  return map;
}

/**
 * Executes the Six-Bucket Allocation Waterfall for an inflow transaction.
 * Appends 6 allocation_runs and 6 bucket_ledger_entries (allocation_credit).
 * Updates transactions table with is_override and allocation_rule_version.
 */
export async function runAllocation(
  db: D1Database,
  transaction: Transaction,
  overrideSplit?: OverrideSplit | null
): Promise<{ splits: AllocationSplits; isOverride: boolean; ruleVersion: number | null }> {
  let rule: {
    tithe_pct: number;
    kingdom_pct: number;
    savings_pct: number;
    invest_pct: number;
    charity_pct: number;
    expense_pct: number;
    version?: number;
  };

  let isOverride = false;
  let ruleVersion: number | null = null;

  if (overrideSplit) {
    const remainderSum =
      overrideSplit.savings_pct +
      overrideSplit.invest_pct +
      overrideSplit.charity_pct +
      overrideSplit.expense_pct;
    if (Math.abs(remainderSum - 100) > 0.01) {
      throw new Error(`Override split remainder percentages must sum to 100% (got ${remainderSum}%)`);
    }
    rule = overrideSplit;
    isOverride = true;
    ruleVersion = null;
  } else {
    const activeRule = await db
      .prepare('SELECT * FROM allocation_rules WHERE effective_to IS NULL ORDER BY version DESC LIMIT 1')
      .first<AllocationRule>();
    if (!activeRule) {
      throw new Error('No active allocation rule found');
    }
    rule = activeRule;
    isOverride = false;
    ruleVersion = activeRule.version;
  }

  const splits = calculateAllocationSplits(transaction.amount, rule);
  const bucketMap = await getBucketMap(db);

  const bucketKeys: (keyof AllocationSplits)[] = [
    'tithe',
    'kingdom',
    'savings',
    'invest',
    'charity',
    'expense',
  ];

  const statements: D1PreparedStatement[] = [];

  for (const key of bucketKeys) {
    const bucketId = bucketMap[key];
    if (!bucketId) {
      throw new Error(`Missing bucket id for key: ${key}`);
    }
    const bucketAmount = splits[key];

    // 1. Insert allocation run
    statements.push(
      db
        .prepare(
          'INSERT INTO allocation_runs (transaction_id, bucket_id, amount) VALUES (?, ?, ?)'
        )
        .bind(transaction.id, bucketId, bucketAmount)
    );

    // 2. Insert bucket ledger credit
    statements.push(
      db
        .prepare(
          'INSERT INTO bucket_ledger_entries (bucket_id, transaction_id, entry_type, amount, date, note) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(
          bucketId,
          transaction.id,
          'allocation_credit',
          bucketAmount,
          transaction.date,
          `Inflow allocation (${key})`
        )
    );
  }

  // 3. Update transaction flags
  statements.push(
    db
      .prepare(
        'UPDATE transactions SET is_override = ?, allocation_rule_version = ? WHERE id = ?'
      )
      .bind(isOverride ? 1 : 0, ruleVersion, transaction.id)
  );

  await db.batch(statements);

  return { splits, isOverride, ruleVersion };
}

/**
 * Records an outflow expense against the appropriate allocation bucket.
 * Flexible categories (e.g. Seed) mandate chosenBucketId.
 * Non-flexible categories default to category.default_bucket_id (Expenses).
 */
export async function recordExpense(
  db: D1Database,
  transaction: Transaction,
  chosenBucketId?: number | null
): Promise<{ bucketId: number }> {
  if (!transaction.category_id) {
    throw new Error('Outflow transaction requires category_id');
  }

  const category = await db
    .prepare('SELECT * FROM categories WHERE id = ?')
    .bind(transaction.category_id)
    .first<Category>();

  if (!category) {
    throw new Error(`Category not found: ${transaction.category_id}`);
  }

  let targetBucketId: number;

  if (category.bucket_is_flexible === 1) {
    if (!chosenBucketId) {
      throw new Error(
        `Category '${category.name}' is flexible and requires chosen_bucket_id`
      );
    }
    // Verify chosen bucket exists
    const bucket = await db
      .prepare('SELECT id FROM allocation_buckets WHERE id = ?')
      .bind(chosenBucketId)
      .first<AllocationBucket>();
    if (!bucket) {
      throw new Error(`Chosen bucket not found: ${chosenBucketId}`);
    }
    targetBucketId = chosenBucketId;
  } else {
    if (category.default_bucket_id) {
      targetBucketId = category.default_bucket_id;
    } else {
      const expenseBucket = await db
        .prepare("SELECT id FROM allocation_buckets WHERE key = 'expense'")
        .first<{ id: number }>();
      if (!expenseBucket) {
        throw new Error('Default expense bucket not found');
      }
      targetBucketId = expenseBucket.id;
    }
  }

  await db
    .prepare(
      'INSERT INTO bucket_ledger_entries (bucket_id, transaction_id, entry_type, amount, date, note) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(
      targetBucketId,
      transaction.id,
      'expense_debit',
      transaction.amount,
      transaction.date,
      transaction.note ?? `Outflow: ${category.name}`
    )
    .run();

  return { bucketId: targetBucketId };
}

/**
 * Atomic two-legged transfer between two allocation buckets.
 * Generates transfer_out and transfer_in ledger entries and links them in bucket_transfers.
 */
export async function transferBetweenBuckets(
  db: D1Database,
  fromBucketId: number,
  toBucketId: number,
  amount: number,
  reason: string | null,
  date: string
): Promise<{ transferId: number; outEntryId: number; inEntryId: number }> {
  if (fromBucketId === toBucketId) {
    throw new Error('Cannot transfer to the same bucket');
  }
  if (amount <= 0) {
    throw new Error('Transfer amount must be positive');
  }

  // Verify both buckets exist
  const fromBucket = await db
    .prepare('SELECT id, name FROM allocation_buckets WHERE id = ?')
    .bind(fromBucketId)
    .first<AllocationBucket>();
  if (!fromBucket) {
    throw new Error(`Source bucket not found: ${fromBucketId}`);
  }

  const toBucket = await db
    .prepare('SELECT id, name FROM allocation_buckets WHERE id = ?')
    .bind(toBucketId)
    .first<AllocationBucket>();
  if (!toBucket) {
    throw new Error(`Destination bucket not found: ${toBucketId}`);
  }

  const noteOut = reason ? `Transfer to ${toBucket.name}: ${reason}` : `Transfer to ${toBucket.name}`;
  const noteIn = reason ? `Transfer from ${fromBucket.name}: ${reason}` : `Transfer from ${fromBucket.name}`;

  // Execute two ledger entries in atomic batch
  const [outRes, inRes] = await db.batch([
    db
      .prepare(
        'INSERT INTO bucket_ledger_entries (bucket_id, entry_type, amount, date, note) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(fromBucketId, 'transfer_out', amount, date, noteOut),
    db
      .prepare(
        'INSERT INTO bucket_ledger_entries (bucket_id, entry_type, amount, date, note) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(toBucketId, 'transfer_in', amount, date, noteIn),
  ]);

  const outEntryId = outRes.meta.last_row_id;
  const inEntryId = inRes.meta.last_row_id;

  const transferRes = await db
    .prepare(
      'INSERT INTO bucket_transfers (from_bucket_id, to_bucket_id, amount, date, reason, from_ledger_entry_id, to_ledger_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(fromBucketId, toBucketId, amount, date, reason, outEntryId, inEntryId)
    .run();

  return {
    transferId: transferRes.meta.last_row_id,
    outEntryId,
    inEntryId,
  };
}

/**
 * Live computation of available balances across all 6 allocation buckets.
 * Balance = sum(allocation_credit + transfer_in) - sum(expense_debit + transfer_out) ± manual_adjustment
 */
export async function getBucketBalances(db: D1Database): Promise<BucketWithBalance[]> {
  const { results } = await db
    .prepare(
      `SELECT 
        b.id,
        b.key,
        b.name,
        b.is_pass_through,
        COALESCE(SUM(
          CASE 
            WHEN ble.entry_type IN ('allocation_credit', 'transfer_in') THEN ble.amount
            WHEN ble.entry_type IN ('expense_debit', 'transfer_out') THEN -ble.amount
            WHEN ble.entry_type = 'manual_adjustment' THEN ble.amount
            ELSE 0
          END
        ), 0) as balance
      FROM allocation_buckets b
      LEFT JOIN bucket_ledger_entries ble ON b.id = ble.bucket_id
      GROUP BY b.id, b.key, b.name, b.is_pass_through
      ORDER BY b.id ASC`
    )
    .all<BucketWithBalance>();

  return results.map((b) => ({
    ...b,
    balance: Math.round(b.balance * 100) / 100,
  }));
}

/**
 * Edits a transaction while preserving ledger immutability.
 * 1. Checks changed fields and inserts rows into transaction_audit_log.
 * 2. If amount, category_id, direction, or bucket changed:
 *    - Appends offsetting reversal ledger entries (never updates/deletes old ledger entries).
 *    - Re-executes allocation or expense debit with the new values.
 * 3. Updates the transactions table.
 */
export async function editTransaction(
  db: D1Database,
  id: number,
  changes: Partial<Transaction> & {
    chosen_bucket_id?: number | null;
    override_split?: OverrideSplit | null;
  }
): Promise<{ updated: Transaction; auditCount: number; reversed: boolean }> {
  const oldTx = await db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(id)
    .first<Transaction>();

  if (!oldTx) {
    throw new Error(`Transaction not found: ${id}`);
  }

  // Audit log tracking
  const auditStatements: D1PreparedStatement[] = [];
  const trackedFields: (keyof Transaction)[] = [
    'date',
    'direction',
    'subtype',
    'amount',
    'currency',
    'category_id',
    'account_id',
    'income_source_id',
    'note',
    'purpose_label',
  ];

  for (const field of trackedFields) {
    if (field in changes && changes[field] !== undefined) {
      const oldVal = oldTx[field] !== null && oldTx[field] !== undefined ? String(oldTx[field]) : null;
      const newVal = changes[field] !== null && changes[field] !== undefined ? String(changes[field]) : null;

      if (oldVal !== newVal) {
        auditStatements.push(
          db
            .prepare(
              'INSERT INTO transaction_audit_log (transaction_id, changed_field, old_value, new_value) VALUES (?, ?, ?, ?)'
            )
            .bind(id, field, oldVal, newVal)
        );
      }
    }
  }

  if (auditStatements.length > 0) {
    await db.batch(auditStatements);
  }

  // Check if financial ledger impact changed
  const financialChanged =
    (changes.amount !== undefined && changes.amount !== oldTx.amount) ||
    (changes.category_id !== undefined && changes.category_id !== oldTx.category_id) ||
    (changes.direction !== undefined && changes.direction !== oldTx.direction) ||
    changes.chosen_bucket_id !== undefined ||
    changes.override_split !== undefined;

  let reversed = false;

  if (financialChanged) {
    // 1. Fetch original ledger entries for this transaction
    const { results: originalEntries } = await db
      .prepare('SELECT * FROM bucket_ledger_entries WHERE transaction_id = ?')
      .bind(id)
      .all<BucketLedgerEntry>();

    // 2. Append offsetting entries (reversal)
    const reversalStatements: D1PreparedStatement[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const entry of originalEntries) {
      // If original was allocation_credit (+amount), offset with -amount via manual_adjustment
      // If original was expense_debit (-amount), offset with +amount via manual_adjustment
      const offsetAmount = entry.entry_type === 'allocation_credit' ? -entry.amount : entry.amount;
      reversalStatements.push(
        db
          .prepare(
            'INSERT INTO bucket_ledger_entries (bucket_id, transaction_id, entry_type, amount, date, note) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind(
            entry.bucket_id,
            id,
            'manual_adjustment',
            offsetAmount,
            today,
            `Reversal offset for entry #${entry.id} (Transaction #${id} edit)`
          )
      );
    }

    if (reversalStatements.length > 0) {
      await db.batch(reversalStatements);
      reversed = true;
    }

    // 3. Construct new transaction state
    const newTx: Transaction = {
      ...oldTx,
      ...changes,
      amount: changes.amount !== undefined ? Number(changes.amount) : oldTx.amount,
      direction: changes.direction ?? oldTx.direction,
      date: changes.date ?? oldTx.date,
      category_id: changes.category_id !== undefined ? changes.category_id : oldTx.category_id,
      account_id: changes.account_id !== undefined ? changes.account_id : oldTx.account_id,
    };

    // 4. Re-apply allocation or expense debit
    if (newTx.direction === 'inflow') {
      await runAllocation(db, newTx, changes.override_split);
    } else {
      await recordExpense(db, newTx, changes.chosen_bucket_id);
    }
  }

  // 5. Update transaction row
  const updatedAmount = changes.amount !== undefined ? Number(changes.amount) : oldTx.amount;
  const updatedDirection = changes.direction ?? oldTx.direction;
  const updatedDate = changes.date ?? oldTx.date;
  const updatedCategory = changes.category_id !== undefined ? changes.category_id : oldTx.category_id;
  const updatedAccount = changes.account_id !== undefined ? changes.account_id : oldTx.account_id;
  const updatedIncomeSource = changes.income_source_id !== undefined ? changes.income_source_id : oldTx.income_source_id;
  const updatedNote = changes.note !== undefined ? changes.note : oldTx.note;
  const updatedPurpose = changes.purpose_label !== undefined ? changes.purpose_label : oldTx.purpose_label;
  const updatedSubtype = changes.subtype !== undefined ? changes.subtype : oldTx.subtype;

  await db
    .prepare(
      `UPDATE transactions 
       SET amount = ?, direction = ?, date = ?, category_id = ?, account_id = ?, income_source_id = ?, note = ?, purpose_label = ?, subtype = ?
       WHERE id = ?`
    )
    .bind(
      updatedAmount,
      updatedDirection,
      updatedDate,
      updatedCategory,
      updatedAccount,
      updatedIncomeSource,
      updatedNote,
      updatedPurpose,
      updatedSubtype,
      id
    )
    .run();

  const finalTx = await db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(id)
    .first<Transaction>();

  return { updated: finalTx!, auditCount: auditStatements.length, reversed };
}

/**
 * Soft deletes a transaction by appending offsetting ledger entries and logging the deletion.
 * Preserves full audit trail and immutable ledger history.
 */
export async function deleteTransaction(
  db: D1Database,
  id: number
): Promise<{ success: boolean; reversedCount: number }> {
  const tx = await db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(id)
    .first<Transaction>();

  if (!tx) {
    throw new Error(`Transaction not found: ${id}`);
  }

  // 1. Fetch existing ledger entries
  const { results: entries } = await db
    .prepare('SELECT * FROM bucket_ledger_entries WHERE transaction_id = ?')
    .bind(id)
    .all<BucketLedgerEntry>();

  const today = new Date().toISOString().split('T')[0];
  const statements: D1PreparedStatement[] = [];

  // 2. Append offsetting entries
  for (const entry of entries) {
    const offsetAmount = entry.entry_type === 'allocation_credit' ? -entry.amount : entry.amount;
    statements.push(
      db
        .prepare(
          'INSERT INTO bucket_ledger_entries (bucket_id, transaction_id, entry_type, amount, date, note) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(
          entry.bucket_id,
          id,
          'manual_adjustment',
          offsetAmount,
          today,
          `Reversal offset for entry #${entry.id} (Transaction #${id} deleted)`
        )
    );
  }

  // 3. Log deletion in audit log
  statements.push(
    db
      .prepare(
        'INSERT INTO transaction_audit_log (transaction_id, changed_field, old_value, new_value) VALUES (?, ?, ?, ?)'
      )
      .bind(id, 'status', 'active', 'deleted')
  );

  // 4. Append deletion note to transaction
  const deletedNote = tx.note ? `${tx.note} [DELETED]` : '[DELETED]';
  statements.push(
    db
      .prepare('UPDATE transactions SET note = ? WHERE id = ?')
      .bind(deletedNote, id)
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return { success: true, reversedCount: entries.length };
}
