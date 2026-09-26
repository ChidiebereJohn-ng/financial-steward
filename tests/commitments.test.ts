import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';
import {
  getGoalsWithProgress,
  createGoal,
  updateGoal,
  deleteGoal,
  getLiabilitiesSummary,
  createLiability,
  updateLiability,
  deleteLiability,
  advanceRecurringDueDate,
  calculateDaysUntilDue,
  getRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
  confirmRecurringTransaction,
  reconcileAccount,
} from '../worker/lib/commitments';
import { runAllocation, recordExpense } from '../worker/lib/ledger';
import { computeNetWorth } from '../worker/lib/analytics';

describe('Module 5: Goals, Liabilities, Recurring Transactions & Reconciliation', () => {
  let db: Database;
  let mockEnv: any;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run migrations 0001 through 0005
    const m1 = readFileSync(join(__dirname, '../worker/migrations/0001_foundation.sql'), 'utf-8');
    db.run(m1);

    const m2 = readFileSync(join(__dirname, '../worker/migrations/0002_ledger_allocation.sql'), 'utf-8');
    db.run(m2);

    const m3 = readFileSync(join(__dirname, '../worker/migrations/0003_dashboards.sql'), 'utf-8');
    db.run(m3);

    const m4 = readFileSync(join(__dirname, '../worker/migrations/0004_budgets.sql'), 'utf-8');
    db.run(m4);

    const m5 = readFileSync(join(__dirname, '../worker/migrations/0005_commitments.sql'), 'utf-8');
    db.run(m5);

    mockEnv = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...params: any[]) => ({
            all: async () => {
              try {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                const results: any[] = [];
                while (stmt.step()) {
                  results.push(stmt.getAsObject());
                }
                stmt.free();
                return { results };
              } catch (e: any) {
                throw new Error(e.message || String(e));
              }
            },
            first: async () => {
              try {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                let result = null;
                if (stmt.step()) {
                  result = stmt.getAsObject();
                }
                stmt.free();
                return result;
              } catch (e: any) {
                throw new Error(e.message || String(e));
              }
            },
            run: async () => {
              try {
                db.run(sql, params);
                const lastId = db.exec('SELECT last_insert_rowid() as id');
                return {
                  meta: {
                    last_row_id: Number(lastId[0]?.values[0]?.[0] || 0),
                    changes: 1,
                  },
                };
              } catch (e: any) {
                throw new Error(e.message || String(e));
              }
            },
          }),
          all: async () => {
            const stmt = db.prepare(sql);
            const results: any[] = [];
            while (stmt.step()) {
              results.push(stmt.getAsObject());
            }
            stmt.free();
            return { results };
          },
          first: async () => {
            const stmt = db.prepare(sql);
            let result = null;
            if (stmt.step()) {
              result = stmt.getAsObject();
            }
            stmt.free();
            return result;
          },
          run: async () => {
            try {
              db.run(sql);
              const lastId = db.exec('SELECT last_insert_rowid() as id');
              return {
                meta: {
                  last_row_id: Number(lastId[0]?.values[0]?.[0] || 0),
                  changes: 1,
                },
              };
            } catch (e: any) {
              throw new Error(e.message || String(e));
            }
          },
        }),
        batch: async (statements: any[]) => {
          for (const s of statements) {
            await s.run();
          }
          return statements.map(() => ({ meta: { changes: 1 } }));
        },
      },
    };

    // Seed test bank accounts
    db.run(`
      INSERT INTO accounts (id, name, type, currency, institution) VALUES
      (1, 'Zenith Main Bank', 'bank', 'NGN', 'Zenith Bank'),
      (2, 'GTBank Operational', 'bank', 'NGN', 'Guaranty Trust Bank');
    `);
  });

  // ==========================================================================
  // 1. MIGRATION & SCHEMA INTEGRITY
  // ==========================================================================
  describe('1. Migration 0005 Schema & Constraints', () => {
    it('should have created goals, liabilities, and recurring_transactions tables', () => {
      const stmt = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('goals', 'liabilities', 'recurring_transactions')
        ORDER BY name ASC
      `);
      const tables: string[] = [];
      while (stmt.step()) {
        tables.push(String(stmt.getAsObject().name));
      }
      stmt.free();

      expect(tables).toContain('goals');
      expect(tables).toContain('liabilities');
      expect(tables).toContain('recurring_transactions');
    });

    it('should verify accounts has last_reconciled_balance and last_reconciled_date columns', () => {
      const stmt = db.prepare("PRAGMA table_info(accounts)");
      const cols: string[] = [];
      while (stmt.step()) {
        cols.push(String(stmt.getAsObject().name));
      }
      stmt.free();

      expect(cols).toContain('last_reconciled_balance');
      expect(cols).toContain('last_reconciled_date');
    });
  });

  // ==========================================================================
  // 2. GOALS PROGRESS & BUCKET LINKING
  // ==========================================================================
  describe('2. Goals Engine & Live Bucket Progress Invariant', () => {
    it('should create goals and track 0% progress when linked bucket has ₦0 balance', async () => {
      // Find Savings bucket id
      const savingsRes = db.exec("SELECT id FROM allocation_buckets WHERE key='savings'");
      const savingsId = Number(savingsRes[0].values[0][0]);

      const goal = await createGoal(mockEnv.DB, {
        name: 'Emergency Fund 2026',
        target_amount: 1000000,
        target_date: '2026-12-31',
        linked_bucket_id: savingsId,
      });

      expect(goal.id).toBeDefined();
      expect(goal.name).toBe('Emergency Fund 2026');
      expect(goal.target_amount).toBe(1000000);
      expect(goal.current_amount).toBe(0);
      expect(goal.progress_pct).toBe(0);
      expect(goal.remaining_amount).toBe(1000000);
      expect(goal.linked_bucket_key).toBe('savings');
    });

    it('should dynamically update goal progress % when funds are allocated to the linked bucket', async () => {
      // Create an inflow transaction of ₦1,000,000
      // Inflow waterfall: 10% Tithe (100k), 20% Kingdom (200k), Remainder 700k -> 20% Savings = ₦140,000
      db.run(`
        INSERT INTO transactions (id, date, direction, amount, currency, account_id, note)
        VALUES (101, '2026-09-15', 'inflow', 1000000, 'NGN', 1, 'Monthly Inflow');
      `);

      const tx = {
        id: 101,
        date: '2026-09-15',
        direction: 'inflow' as const,
        amount: 1000000,
        currency: 'NGN',
        account_id: 1,
      };

      await runAllocation(mockEnv.DB, tx);

      // Now query goals with progress
      const goals = await getGoalsWithProgress(mockEnv.DB);
      const emergencyGoal = goals.find((g) => g.name === 'Emergency Fund 2026');

      expect(emergencyGoal).toBeDefined();
      expect(emergencyGoal?.current_amount).toBe(140000);
      expect(emergencyGoal?.progress_pct).toBe(14); // 140,000 / 1,000,000 = 14%
      expect(emergencyGoal?.remaining_amount).toBe(860000);
    });

    it('should cap progress at 100% when bucket balance exceeds target amount', async () => {
      const investRes = db.exec("SELECT id FROM allocation_buckets WHERE key='invest'");
      const investId = Number(investRes[0].values[0][0]);

      const investmentGoal = await createGoal(mockEnv.DB, {
        name: 'Mini Capital Milestone',
        target_amount: 50000,
        linked_bucket_id: investId,
      });

      // The previous ₦1,000,000 inflow allocated ₦140,000 to invest (20% of 700k remainder)
      // Since current balance (140,000) > target (50,000), progress should clamp at 100% and remaining 0
      const goals = await getGoalsWithProgress(mockEnv.DB);
      const goal = goals.find((g) => g.id === investmentGoal.id);

      expect(goal?.current_amount).toBe(140000);
      expect(goal?.progress_pct).toBe(100);
      expect(goal?.remaining_amount).toBe(0);
    });

    it('should support updating and deleting goals', async () => {
      const goals = await getGoalsWithProgress(mockEnv.DB);
      const goalToUpdate = goals[0];

      const updated = await updateGoal(mockEnv.DB, goalToUpdate.id, {
        target_amount: 2000000,
      });
      expect(updated?.target_amount).toBe(2000000);

      const deleted = await deleteGoal(mockEnv.DB, goalToUpdate.id);
      expect(deleted).toBe(true);

      const afterDelete = await getGoalsWithProgress(mockEnv.DB);
      expect(afterDelete.find((g) => g.id === goalToUpdate.id)).toBeUndefined();
    });
  });

  // ==========================================================================
  // 3. LIABILITIES ENGINE & NET WORTH INTEGRATION
  // ==========================================================================
  describe('3. Liabilities Tracking & Net Worth Impact', () => {
    it('should create and summarize liabilities', async () => {
      const carLoan = await createLiability(mockEnv.DB, {
        name: 'Auto Loan',
        type: 'loan',
        principal: 5000000,
        current_balance: 3500000,
        interest_rate: 18.5,
        minimum_payment: 120000,
        due_date: '2026-10-05',
        lender: 'Access Bank',
      });

      const cardDebt = await createLiability(mockEnv.DB, {
        name: 'Credit Facility',
        type: 'credit facility',
        principal: 1000000,
        current_balance: 400000,
        interest_rate: 24.0,
        minimum_payment: 50000,
        due_date: '2026-10-15',
        lender: 'First Bank',
      });

      expect(carLoan.id).toBeDefined();
      expect(cardDebt.id).toBeDefined();

      const summary = await getLiabilitiesSummary(mockEnv.DB);
      expect(summary.liabilities.length).toBe(2);
      expect(summary.total_liabilities).toBe(3900000); // 3.5m + 400k
      expect(summary.total_monthly_minimum).toBe(170000); // 120k + 50k
    });

    it('should deduct liabilities dynamically in computeNetWorth', async () => {
      const netWorthSnapshot = await computeNetWorth(mockEnv.DB, '2026-09-26');
      expect(netWorthSnapshot.total_liabilities).toBe(3900000);
      expect(netWorthSnapshot.net_worth).toBe(netWorthSnapshot.total_assets - 3900000);
    });

    it('should update liability balance and reflect updated net worth', async () => {
      const summary = await getLiabilitiesSummary(mockEnv.DB);
      const carLoan = summary.liabilities.find((l) => l.name === 'Auto Loan');

      // Pay down car loan by 500k
      const updated = await updateLiability(mockEnv.DB, carLoan!.id, {
        current_balance: 3000000,
      });
      expect(updated?.current_balance).toBe(3000000);

      const newSummary = await getLiabilitiesSummary(mockEnv.DB);
      expect(newSummary.total_liabilities).toBe(3400000); // 3.0m + 400k
    });
  });

  // ==========================================================================
  // 4. RECURRING COMMITMENTS & SCANNER
  // ==========================================================================
  describe('4. Recurring Commitments & Due-Date Advances', () => {
    it('should advance due dates accurately across all frequencies', () => {
      expect(advanceRecurringDueDate('2026-09-01', 'weekly')).toBe('2026-09-08');
      expect(advanceRecurringDueDate('2026-09-01', 'monthly')).toBe('2026-10-01');
      expect(advanceRecurringDueDate('2026-09-01', 'quarterly')).toBe('2026-12-01');
      expect(advanceRecurringDueDate('2026-09-01', 'yearly')).toBe('2027-09-01');
    });

    it('should calculate days until due correctly', () => {
      expect(calculateDaysUntilDue('2026-09-29', '2026-09-26')).toBe(3);
      expect(calculateDaysUntilDue('2026-09-27', '2026-09-26')).toBe(1);
      expect(calculateDaysUntilDue('2026-10-05', '2026-09-26')).toBe(9);
      expect(calculateDaysUntilDue('2026-09-24', '2026-09-26')).toBe(-2); // Overdue
    });

    it('should create recurring transactions and flag items due in <= 3 days as upcoming', async () => {
      const catRes = db.exec("SELECT id FROM categories WHERE name='Utilities & Bills'");
      const utilCatId = Number(catRes[0].values[0][0]);

      // Recurring item 1: Due in 2 days (upcoming)
      await createRecurringTransaction(mockEnv.DB, {
        category_id: utilCatId,
        direction: 'outflow',
        amount: 25000,
        frequency: 'monthly',
        next_due_date: '2026-09-28',
        active: 1,
        note: 'Office High-Speed Internet',
        account_id: 1,
      });

      // Recurring item 2: Due in 15 days (not upcoming)
      await createRecurringTransaction(mockEnv.DB, {
        category_id: utilCatId,
        direction: 'outflow',
        amount: 15000,
        frequency: 'monthly',
        next_due_date: '2026-10-11',
        active: 1,
        note: 'Streaming & Software Subscriptions',
        account_id: 1,
      });

      const { recurring, upcoming_count } = await getRecurringTransactions(mockEnv.DB, {
        referenceDate: '2026-09-26',
      });

      expect(recurring.length).toBe(2);
      expect(upcoming_count).toBe(1);

      const upcomingItem = recurring.find((r) => r.note === 'Office High-Speed Internet');
      expect(upcomingItem?.is_upcoming).toBe(true);
      expect(upcomingItem?.days_until_due).toBe(2);

      const futureItem = recurring.find((r) => r.note === 'Streaming & Software Subscriptions');
      expect(futureItem?.is_upcoming).toBe(false);
      expect(futureItem?.days_until_due).toBe(15);
    });

    it('should confirm a recurring commitment by posting a ledger transaction and rolling next_due_date forward', async () => {
      const { recurring } = await getRecurringTransactions(mockEnv.DB);
      const internetBill = recurring.find((r) => r.note === 'Office High-Speed Internet')!;

      const result = await confirmRecurringTransaction(mockEnv.DB, internetBill.id, '2026-09-28');

      expect(result.transaction_id).toBeDefined();
      expect(result.next_due_date).toBe('2026-10-28'); // Advanced 1 month

      // Verify the transaction was posted
      const txRows = db.exec(`SELECT id, amount, direction, note FROM transactions WHERE id = ${result.transaction_id}`);
      expect(Number(txRows[0].values[0][0])).toBe(result.transaction_id);
      expect(Number(txRows[0].values[0][1])).toBe(25000);
      expect(String(txRows[0].values[0][2])).toBe('outflow');
      expect(String(txRows[0].values[0][3])).toContain('Office High-Speed Internet');

      // Verify next_due_date in recurring_transactions was updated
      const recRows = db.exec(`SELECT next_due_date FROM recurring_transactions WHERE id = ${internetBill.id}`);
      expect(String(recRows[0].values[0][0])).toBe('2026-10-28');
    });
  });

  // ==========================================================================
  // 5. ACCOUNT RECONCILIATION
  // ==========================================================================
  describe('5. Account Reconciliation Engine', () => {
    it('should reconcile an account with exact matching balance and update last_reconciled_*', async () => {
      // On account 1:
      // Inflow 101: ₦1,000,000
      // Outflow (recurring confirmation): ₦25,000
      // Net computed balance = ₦975,000
      const recResult = await reconcileAccount(mockEnv.DB, 1, 975000, '2026-09-26');

      expect(recResult.account_id).toBe(1);
      expect(recResult.computed_balance).toBe(975000);
      expect(recResult.actual_balance).toBe(975000);
      expect(recResult.variance).toBe(0);
      expect(recResult.is_reconciled).toBe(true);

      // Verify DB update
      const accRows = db.exec('SELECT last_reconciled_balance, last_reconciled_date FROM accounts WHERE id = 1');
      expect(Number(accRows[0].values[0][0])).toBe(975000);
      expect(String(accRows[0].values[0][1])).toBe('2026-09-26');
    });

    it('should flag a non-zero variance when statement balance differs from ledger transactions', async () => {
      // Bank statement says ₦970,000 (e.g. ₦5,000 unrecorded fee)
      const recResult = await reconcileAccount(mockEnv.DB, 1, 970000, '2026-09-26');

      expect(recResult.computed_balance).toBe(975000);
      expect(recResult.actual_balance).toBe(970000);
      expect(recResult.variance).toBe(-5000); // 970,000 - 975,000 = -5,000
      expect(recResult.is_reconciled).toBe(false);

      // Account still records the reconciliation attempt
      const accRows = db.exec('SELECT last_reconciled_balance, last_reconciled_date FROM accounts WHERE id = 1');
      expect(Number(accRows[0].values[0][0])).toBe(970000);
    });
  });

  // ==========================================================================
  // 6. HONO API ROUTE INTEGRATION
  // ==========================================================================
  describe('6. Module 5 API Endpoints (Hono)', () => {
    it('GET /api/goals should return goals list with progress', async () => {
      const res = await app.request('/api/goals', {
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(Array.isArray(json.goals)).toBe(true);
      expect(json.goals.length).toBeGreaterThan(0);
      expect(json.goals[0].progress_pct).toBeDefined();
    });

    it('POST /api/goals should validate and create a goal', async () => {
      const res = await app.request('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
        body: JSON.stringify({
          name: 'Home Renovation',
          target_amount: 500000,
          target_date: '2027-06-30',
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.goal.name).toBe('Home Renovation');
      expect(json.goal.target_amount).toBe(500000);
    });

    it('GET & POST /api/liabilities should manage debt records', async () => {
      const postRes = await app.request('/api/liabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
        body: JSON.stringify({
          name: 'Personal Loan',
          type: 'personal debt',
          principal: 200000,
          current_balance: 150000,
          minimum_payment: 25000,
          due_date: '2026-11-01',
          lender: 'Family Member',
        }),
      }, mockEnv);

      expect(postRes.status).toBe(201);
      const postJson = await postRes.json() as any;
      expect(postJson.liability.name).toBe('Personal Loan');

      const getRes = await app.request('/api/liabilities', {
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(getRes.status).toBe(200);
      const getJson = await getRes.json() as any;
      expect(getJson.total_liabilities).toBeGreaterThan(0);
      expect(Array.isArray(getJson.liabilities)).toBe(true);
    });

    it('GET & POST /api/recurring should list and create recurring obligations', async () => {
      const postRes = await app.request('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
        body: JSON.stringify({
          direction: 'outflow',
          amount: 5000,
          frequency: 'weekly',
          next_due_date: '2026-10-01',
          note: 'Weekly Data Bundle',
        }),
      }, mockEnv);

      expect(postRes.status).toBe(201);

      const getRes = await app.request('/api/recurring', {
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(getRes.status).toBe(200);
      const getJson = await getRes.json() as any;
      expect(Array.isArray(getJson.recurring)).toBe(true);
      expect(getJson.recurring.length).toBeGreaterThan(0);
    });

    it('POST /api/accounts/:id/reconcile should reconcile account via API', async () => {
      const res = await app.request('/api/accounts/1/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
        body: JSON.stringify({
          actual_balance: 975000,
          date: '2026-09-26',
        }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.account_id).toBe(1);
      expect(json.data.variance).toBe(0);
      expect(json.data.is_reconciled).toBe(true);
    });
  });
});
