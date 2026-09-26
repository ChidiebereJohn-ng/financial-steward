import type {
  Goal,
  GoalWithProgress,
  Liability,
  RecurringTransaction,
  RecurringWithDue,
  ReconciliationResult,
} from '../types';
import { runAllocation, recordExpense } from './ledger';

/**
 * Calculates the live balance for a single bucket from append-only ledger entries.
 */
export async function getSingleBucketBalance(
  db: D1Database,
  bucketId: number
): Promise<number> {
  const res = await db
    .prepare(
      `SELECT 
        COALESCE(
          SUM(
            CASE 
              WHEN ble.entry_type IN ('allocation_credit', 'transfer_in') THEN ble.amount
              WHEN ble.entry_type IN ('expense_debit', 'transfer_out') THEN -ble.amount
              WHEN ble.entry_type = 'manual_adjustment' THEN ble.amount
              ELSE 0
            END
          ), 0
        ) as balance
      FROM bucket_ledger_entries ble
      WHERE ble.bucket_id = ?`
    )
    .bind(bucketId)
    .first<{ balance: number }>();

  return res ? Math.round(res.balance * 100) / 100 : 0;
}

// ============================================================================
// 1. GOALS ENGINE
// ============================================================================

/**
 * Lists all goals with dynamically calculated progress % against linked bucket live balance.
 */
export async function getGoalsWithProgress(db: D1Database): Promise<GoalWithProgress[]> {
  const { results: rawGoals } = await db
    .prepare(
      `SELECT 
        g.id,
        g.name,
        g.target_amount,
        g.target_date,
        g.linked_bucket_id,
        g.created_at,
        b.key as linked_bucket_key,
        b.name as linked_bucket_name
      FROM goals g
      LEFT JOIN allocation_buckets b ON g.linked_bucket_id = b.id
      ORDER BY g.id ASC`
    )
    .all<Goal & { linked_bucket_key?: string | null; linked_bucket_name?: string | null }>();

  // Fetch balances for all linked buckets
  const bucketBalanceCache: Record<number, number> = {};

  const goalsWithProgress: GoalWithProgress[] = [];

  for (const g of rawGoals) {
    let currentAmount = 0;
    if (g.linked_bucket_id) {
      if (bucketBalanceCache[g.linked_bucket_id] === undefined) {
        bucketBalanceCache[g.linked_bucket_id] = await getSingleBucketBalance(db, g.linked_bucket_id);
      }
      currentAmount = Math.max(0, bucketBalanceCache[g.linked_bucket_id]);
    }

    const progressPct =
      g.target_amount > 0
        ? Math.min(100, Math.round((currentAmount / g.target_amount) * 10000) / 100)
        : 0;

    const remainingAmount = Math.max(0, Math.round((g.target_amount - currentAmount) * 100) / 100);

    goalsWithProgress.push({
      ...g,
      current_amount: currentAmount,
      progress_pct: progressPct,
      remaining_amount: remainingAmount,
    });
  }

  return goalsWithProgress;
}

export async function createGoal(
  db: D1Database,
  data: {
    name: string;
    target_amount: number;
    target_date?: string | null;
    linked_bucket_id?: number | null;
  }
): Promise<GoalWithProgress> {
  if (!data.name || data.name.trim() === '') {
    throw new Error('Goal name is required');
  }
  if (data.target_amount <= 0) {
    throw new Error('Target amount must be greater than zero');
  }

  const res = await db
    .prepare(
      `INSERT INTO goals (name, target_amount, target_date, linked_bucket_id)
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      data.name.trim(),
      data.target_amount,
      data.target_date || null,
      data.linked_bucket_id || null
    )
    .run();

  const id = Number(res.meta.last_row_id);
  const allGoals = await getGoalsWithProgress(db);
  const created = allGoals.find((g) => g.id === id);
  if (!created) {
    throw new Error('Failed to retrieve created goal');
  }
  return created;
}

export async function updateGoal(
  db: D1Database,
  id: number,
  updates: {
    name?: string;
    target_amount?: number;
    target_date?: string | null;
    linked_bucket_id?: number | null;
  }
): Promise<GoalWithProgress | null> {
  const existing = await db
    .prepare('SELECT * FROM goals WHERE id = ?')
    .bind(id)
    .first<Goal>();

  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const target_amount = updates.target_amount !== undefined ? updates.target_amount : existing.target_amount;
  const target_date = updates.target_date !== undefined ? updates.target_date : existing.target_date;
  const linked_bucket_id = updates.linked_bucket_id !== undefined ? updates.linked_bucket_id : existing.linked_bucket_id;

  if (target_amount <= 0) {
    throw new Error('Target amount must be greater than zero');
  }

  await db
    .prepare(
      `UPDATE goals 
       SET name = ?, target_amount = ?, target_date = ?, linked_bucket_id = ?
       WHERE id = ?`
    )
    .bind(name, target_amount, target_date, linked_bucket_id, id)
    .run();

  const allGoals = await getGoalsWithProgress(db);
  return allGoals.find((g) => g.id === id) || null;
}

export async function deleteGoal(db: D1Database, id: number): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM goals WHERE id = ?')
    .bind(id)
    .run();
  return (res.meta.changes || 0) > 0;
}

// ============================================================================
// 2. LIABILITIES ENGINE
// ============================================================================

export async function getLiabilitiesSummary(
  db: D1Database
): Promise<{ liabilities: Liability[]; total_liabilities: number; total_monthly_minimum: number }> {
  const { results: liabilities } = await db
    .prepare('SELECT * FROM liabilities ORDER BY current_balance DESC')
    .all<Liability>();

  let totalLiabilities = 0;
  let totalMonthlyMin = 0;

  for (const l of liabilities) {
    totalLiabilities += l.current_balance;
    if (l.minimum_payment) {
      totalMonthlyMin += l.minimum_payment;
    }
  }

  return {
    liabilities,
    total_liabilities: Math.round(totalLiabilities * 100) / 100,
    total_monthly_minimum: Math.round(totalMonthlyMin * 100) / 100,
  };
}

export async function createLiability(
  db: D1Database,
  data: {
    name: string;
    type: string;
    principal: number;
    current_balance: number;
    interest_rate?: number | null;
    minimum_payment?: number | null;
    due_date?: string | null;
    lender?: string | null;
    currency?: string;
  }
): Promise<Liability> {
  if (!data.name || data.name.trim() === '') {
    throw new Error('Liability name is required');
  }
  if (data.principal <= 0) {
    throw new Error('Principal must be greater than zero');
  }
  if (data.current_balance < 0) {
    throw new Error('Current balance cannot be negative');
  }

  const currency = data.currency || 'NGN';

  const res = await db
    .prepare(
      `INSERT INTO liabilities (name, type, principal, current_balance, interest_rate, minimum_payment, due_date, lender, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.name.trim(),
      data.type || 'loan',
      data.principal,
      data.current_balance,
      data.interest_rate !== undefined ? data.interest_rate : null,
      data.minimum_payment !== undefined ? data.minimum_payment : null,
      data.due_date || null,
      data.lender || null,
      currency
    )
    .run();

  const id = Number(res.meta.last_row_id);
  const created = await db
    .prepare('SELECT * FROM liabilities WHERE id = ?')
    .bind(id)
    .first<Liability>();

  if (!created) {
    throw new Error('Failed to retrieve created liability');
  }
  return created;
}

export async function updateLiability(
  db: D1Database,
  id: number,
  updates: Partial<Omit<Liability, 'id' | 'created_at'>>
): Promise<Liability | null> {
  const existing = await db
    .prepare('SELECT * FROM liabilities WHERE id = ?')
    .bind(id)
    .first<Liability>();

  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const type = updates.type !== undefined ? updates.type : existing.type;
  const principal = updates.principal !== undefined ? updates.principal : existing.principal;
  const current_balance = updates.current_balance !== undefined ? updates.current_balance : existing.current_balance;
  const interest_rate = updates.interest_rate !== undefined ? updates.interest_rate : existing.interest_rate;
  const minimum_payment = updates.minimum_payment !== undefined ? updates.minimum_payment : existing.minimum_payment;
  const due_date = updates.due_date !== undefined ? updates.due_date : existing.due_date;
  const lender = updates.lender !== undefined ? updates.lender : existing.lender;
  const currency = updates.currency !== undefined ? updates.currency : existing.currency;

  if (current_balance < 0) {
    throw new Error('Current balance cannot be negative');
  }

  await db
    .prepare(
      `UPDATE liabilities 
       SET name = ?, type = ?, principal = ?, current_balance = ?, interest_rate = ?, minimum_payment = ?, due_date = ?, lender = ?, currency = ?
       WHERE id = ?`
    )
    .bind(name, type, principal, current_balance, interest_rate, minimum_payment, due_date, lender, currency, id)
    .run();

  return db
    .prepare('SELECT * FROM liabilities WHERE id = ?')
    .bind(id)
    .first<Liability>();
}

export async function deleteLiability(db: D1Database, id: number): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM liabilities WHERE id = ?')
    .bind(id)
    .run();
  return (res.meta.changes || 0) > 0;
}

// ============================================================================
// 3. RECURRING TRANSACTIONS ENGINE
// ============================================================================

/**
 * Calculates the next due date forward by frequency interval.
 */
export function advanceRecurringDueDate(
  currentDueDate: string,
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
): string {
  const date = new Date(currentDueDate);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid due date format: ${currentDueDate}`);
  }

  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Calculates days remaining until due relative to a reference date (default today).
 */
export function calculateDaysUntilDue(dueDate: string, referenceDate?: string): number {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  ref.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - ref.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Lists recurring transactions with days_until_due and upcoming flag (due in <= 3 days).
 */
export async function getRecurringTransactions(
  db: D1Database,
  options?: { activeOnly?: boolean; referenceDate?: string }
): Promise<{ recurring: RecurringWithDue[]; upcoming_count: number }> {
  let query = `
    SELECT 
      r.id,
      r.category_id,
      r.bucket_id,
      r.account_id,
      r.direction,
      r.amount,
      r.currency,
      r.frequency,
      r.next_due_date,
      r.active,
      r.note,
      r.created_at,
      c.name as category_name,
      b.name as bucket_name,
      b.key as bucket_key,
      a.name as account_name
    FROM recurring_transactions r
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN allocation_buckets b ON r.bucket_id = b.id
    LEFT JOIN accounts a ON r.account_id = a.id
  `;

  if (options?.activeOnly) {
    query += ' WHERE r.active = 1';
  }

  query += ' ORDER BY r.active DESC, r.next_due_date ASC';

  const { results: rawItems } = await db.prepare(query).all<
    RecurringTransaction & {
      category_name?: string | null;
      bucket_name?: string | null;
      bucket_key?: string | null;
      account_name?: string | null;
    }
  >();

  let upcomingCount = 0;
  const recurring: RecurringWithDue[] = [];

  for (const item of rawItems) {
    const daysUntilDue = calculateDaysUntilDue(item.next_due_date, options?.referenceDate);
    // Section 9 of APP_LOGIC.md: commitments where next_due_date <= today + 3 days and active = 1
    const isUpcoming = item.active === 1 && daysUntilDue <= 3;
    if (isUpcoming) {
      upcomingCount++;
    }

    recurring.push({
      ...item,
      days_until_due: daysUntilDue,
      is_upcoming: isUpcoming,
    });
  }

  return { recurring, upcoming_count: upcomingCount };
}

export async function createRecurringTransaction(
  db: D1Database,
  data: {
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
  }
): Promise<RecurringTransaction> {
  if (data.amount <= 0) {
    throw new Error('Recurring amount must be positive');
  }
  if (!data.next_due_date) {
    throw new Error('Next due date is required');
  }

  const currency = data.currency || 'NGN';
  const active = data.active !== undefined ? data.active : 1;

  const res = await db
    .prepare(
      `INSERT INTO recurring_transactions (category_id, bucket_id, account_id, direction, amount, currency, frequency, next_due_date, active, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.category_id || null,
      data.bucket_id || null,
      data.account_id || null,
      data.direction,
      data.amount,
      currency,
      data.frequency,
      data.next_due_date,
      active,
      data.note || null
    )
    .run();

  const id = Number(res.meta.last_row_id);
  const created = await db
    .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
    .bind(id)
    .first<RecurringTransaction>();

  if (!created) {
    throw new Error('Failed to retrieve created recurring transaction');
  }
  return created;
}

export async function updateRecurringTransaction(
  db: D1Database,
  id: number,
  updates: Partial<Omit<RecurringTransaction, 'id' | 'created_at'>>
): Promise<RecurringTransaction | null> {
  const existing = await db
    .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
    .bind(id)
    .first<RecurringTransaction>();

  if (!existing) return null;

  const category_id = updates.category_id !== undefined ? updates.category_id : existing.category_id;
  const bucket_id = updates.bucket_id !== undefined ? updates.bucket_id : existing.bucket_id;
  const account_id = updates.account_id !== undefined ? updates.account_id : existing.account_id;
  const direction = updates.direction !== undefined ? updates.direction : existing.direction;
  const amount = updates.amount !== undefined ? updates.amount : existing.amount;
  const currency = updates.currency !== undefined ? updates.currency : existing.currency;
  const frequency = updates.frequency !== undefined ? updates.frequency : existing.frequency;
  const next_due_date = updates.next_due_date !== undefined ? updates.next_due_date : existing.next_due_date;
  const active = updates.active !== undefined ? updates.active : existing.active;
  const note = updates.note !== undefined ? updates.note : existing.note;

  if (amount <= 0) {
    throw new Error('Recurring amount must be positive');
  }

  await db
    .prepare(
      `UPDATE recurring_transactions 
       SET category_id = ?, bucket_id = ?, account_id = ?, direction = ?, amount = ?, currency = ?, frequency = ?, next_due_date = ?, active = ?, note = ?
       WHERE id = ?`
    )
    .bind(category_id, bucket_id, account_id, direction, amount, currency, frequency, next_due_date, active, note, id)
    .run();

  return db
    .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
    .bind(id)
    .first<RecurringTransaction>();
}

export async function deleteRecurringTransaction(db: D1Database, id: number): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM recurring_transactions WHERE id = ?')
    .bind(id)
    .run();
  return (res.meta.changes || 0) > 0;
}

/**
 * Confirms a recurring commitment:
 * Creates the actual transaction row, executes ledger allocation/expense, and advances next_due_date.
 */
export async function confirmRecurringTransaction(
  db: D1Database,
  id: number,
  confirmationDate?: string
): Promise<{ transaction_id: number; next_due_date: string }> {
  const recurring = await db
    .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
    .bind(id)
    .first<RecurringTransaction>();

  if (!recurring) {
    throw new Error(`Recurring transaction not found: ${id}`);
  }

  const txDate = confirmationDate || recurring.next_due_date || new Date().toISOString().slice(0, 10);

  // 1. Insert transaction
  const insertTxRes = await db
    .prepare(
      `INSERT INTO transactions (date, direction, amount, currency, category_id, account_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      txDate,
      recurring.direction,
      recurring.amount,
      recurring.currency,
      recurring.category_id,
      recurring.account_id,
      recurring.note ? `[Recurring] ${recurring.note}` : '[Recurring] Commitment'
    )
    .run();

  const txId = Number(insertTxRes.meta.last_row_id);
  const createdTx = await db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(txId)
    .first<any>();

  // 2. Trigger ledger actions
  if (recurring.direction === 'inflow') {
    await runAllocation(db, createdTx);
  } else {
    await recordExpense(db, createdTx, recurring.bucket_id);
  }

  // 3. Advance next_due_date
  const newDueDate = advanceRecurringDueDate(recurring.next_due_date, recurring.frequency);
  await db
    .prepare('UPDATE recurring_transactions SET next_due_date = ? WHERE id = ?')
    .bind(newDueDate, id)
    .run();

  return {
    transaction_id: txId,
    next_due_date: newDueDate,
  };
}

// ============================================================================
// 4. ACCOUNT RECONCILIATION ENGINE
// ============================================================================

/**
 * Reconciles an account balance against transactions:
 * 1. Computes transaction-derived balance: SUM(inflows) - SUM(outflows).
 * 2. Compares against actual statement balance to detect variance.
 * 3. Updates accounts.last_reconciled_balance and last_reconciled_date.
 * 4. Flags variance for the user to investigate (surfaced in response, not silently accepted).
 */
export async function reconcileAccount(
  db: D1Database,
  accountId: number,
  actualBalance: number,
  date?: string
): Promise<ReconciliationResult> {
  const account = await db
    .prepare('SELECT * FROM accounts WHERE id = ?')
    .bind(accountId)
    .first<{ id: number; name: string; currency: string }>();

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const reconcileDate = date || new Date().toISOString().slice(0, 10);

  // Compute signed transaction balance for this account
  const sumRes = await db
    .prepare(
      `SELECT COALESCE(
        SUM(
          CASE 
            WHEN direction = 'inflow' THEN amount 
            WHEN direction = 'outflow' THEN -amount 
            ELSE 0 
          END
        ), 0
      ) as computed_balance
      FROM transactions
      WHERE account_id = ?`
    )
    .bind(accountId)
    .first<{ computed_balance: number }>();

  const computedBalance = sumRes ? Math.round(sumRes.computed_balance * 100) / 100 : 0;
  const roundedActual = Math.round(actualBalance * 100) / 100;
  const variance = Math.round((roundedActual - computedBalance) * 100) / 100;

  // Update account reconciliation status
  await db
    .prepare(
      `UPDATE accounts 
       SET last_reconciled_balance = ?, last_reconciled_date = ?
       WHERE id = ?`
    )
    .bind(roundedActual, reconcileDate, accountId)
    .run();

  return {
    account_id: account.id,
    account_name: account.name,
    currency: account.currency,
    actual_balance: roundedActual,
    computed_balance: computedBalance,
    variance: variance,
    is_reconciled: Math.abs(variance) < 0.001,
    reconciled_date: reconcileDate,
  };
}
