import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';
import { calculateAllocationSplits } from '../worker/lib/ledger';

describe('Module 2: Ledger + Allocation Engine Tests', () => {
  let db: Database;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run both migrations: 0001_foundation.sql and 0002_ledger_allocation.sql
    const m1 = readFileSync(
      join(__dirname, '../worker/migrations/0001_foundation.sql'),
      'utf-8'
    );
    db.run(m1);

    const m2 = readFileSync(
      join(__dirname, '../worker/migrations/0002_ledger_allocation.sql'),
      'utf-8'
    );
    db.run(m2);
  });

  // Helper mock D1Database backed by sql.js WebAssembly
  function createMockEnv() {
    return {
      DB: {
        prepare: (sql: string) => {
          return {
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
              db.run(sql);
              const lastId = db.exec('SELECT last_insert_rowid() as id');
              return {
                meta: {
                  last_row_id: Number(lastId[0]?.values[0]?.[0] || 0),
                  changes: 1,
                },
              };
            },
          };
        },
        batch: async (statements: any[]) => {
          const results = [];
          for (const s of statements) {
            results.push(await s.run());
          }
          return results;
        },
      } as unknown as D1Database,
      CACHE: {
        get: async () => null,
        put: async () => {},
        delete: async () => {},
      } as unknown as KVNamespace,
      DEV_AUTH_BYPASS: 'true',
    };
  }

  describe('1. Waterfall Calculation & Math Precision', () => {
    const standardRule = {
      tithe_pct: 10,
      kingdom_pct: 20,
      savings_pct: 20,
      invest_pct: 20,
      charity_pct: 10,
      expense_pct: 50,
    };

    it('should split ₦100,000 gross exactly according to the 10/20 & 70% (20/20/10/50) rule', () => {
      const splits = calculateAllocationSplits(100000, standardRule);

      expect(splits.tithe).toBe(10000); // 10% of 100k
      expect(splits.kingdom).toBe(20000); // 20% of 100k
      // Remainder = 70k
      expect(splits.savings).toBe(14000); // 20% of 70k
      expect(splits.invest).toBe(14000); // 20% of 70k
      expect(splits.charity).toBe(7000); // 10% of 70k
      expect(splits.expense).toBe(35000); // 50% of 70k

      const sum =
        splits.tithe +
        splits.kingdom +
        splits.savings +
        splits.invest +
        splits.charity +
        splits.expense;
      expect(sum).toBe(100000);
    });

    it('should maintain exact zero-drift kobo precision on irregular and repeating decimal amounts', () => {
      const irregularAmounts = [33333.33, 7.77, 123456.78, 100.01, 0.05];

      for (const amt of irregularAmounts) {
        const splits = calculateAllocationSplits(amt, standardRule);
        const sum =
          splits.tithe +
          splits.kingdom +
          splits.savings +
          splits.invest +
          splits.charity +
          splits.expense;

        // Sum of all 6 splits must strictly match the gross amount
        expect(Math.round(sum * 100) / 100).toBe(amt);
      }
    });

    it('should accurately calculate custom one-off override splits', () => {
      const overrideRule = {
        tithe_pct: 15,
        kingdom_pct: 15,
        savings_pct: 30,
        invest_pct: 30,
        charity_pct: 10,
        expense_pct: 30, // 30+30+10+30 = 100% of remainder
      };

      const splits = calculateAllocationSplits(50000, overrideRule);
      expect(splits.tithe).toBe(7500); // 15%
      expect(splits.kingdom).toBe(7500); // 15%
      // Remainder = 35000
      expect(splits.savings).toBe(10500); // 30% of 35k
      expect(splits.invest).toBe(10500); // 30% of 35k
      expect(splits.charity).toBe(3500); // 10% of 35k
      expect(splits.expense).toBe(10500); // 30% of 35k

      const sum =
        splits.tithe +
        splits.kingdom +
        splits.savings +
        splits.invest +
        splits.charity +
        splits.expense;
      expect(sum).toBe(50000);
    });
  });

  describe('2. D1 Schema Migration 0002 Verification', () => {
    it('should have created all Module 2 core tables and indexes', () => {
      const res = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tables = res[0].values.map((v) => v[0] as string);

      expect(tables).toContain('transactions');
      expect(tables).toContain('allocation_runs');
      expect(tables).toContain('bucket_ledger_entries');
      expect(tables).toContain('bucket_transfers');
      expect(tables).toContain('transaction_audit_log');
    });
  });

  describe('3. End-to-End API Workflows & Invariants', () => {
    let mockEnv: any;

    beforeAll(() => {
      mockEnv = createMockEnv();
    });

    it('POST /api/transactions (Inflow) should run waterfall allocation and update bucket balances', async () => {
      const res = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'inflow',
            amount: 200000,
            note: 'September Salary',
            income_source_id: 1, // Salary
          }),
        },
        mockEnv
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.transaction.id).toBeDefined();
      expect(data.transaction.is_override).toBe(0);
      expect(data.transaction.allocation_rule_version).toBe(1);

      // Verify allocation splits
      expect(data.allocation_splits.tithe).toBe(20000);
      expect(data.allocation_splits.kingdom).toBe(40000);
      expect(data.allocation_splits.savings).toBe(28000);
      expect(data.allocation_splits.invest).toBe(28000);
      expect(data.allocation_splits.charity).toBe(14000);
      expect(data.allocation_splits.expense).toBe(70000);

      // Verify GET /api/buckets returns live computed balances
      const bucketsRes = await app.request(
        '/api/buckets',
        {
          method: 'GET',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(bucketsRes.status).toBe(200);
      const bucketsData = (await bucketsRes.json()) as any;
      const bMap = Object.fromEntries(
        bucketsData.data.map((b: any) => [b.key, b.balance])
      );

      expect(bMap['tithe']).toBe(20000);
      expect(bMap['kingdom']).toBe(40000);
      expect(bMap['savings']).toBe(28000);
      expect(bMap['invest']).toBe(28000);
      expect(bMap['charity']).toBe(14000);
      expect(bMap['expense']).toBe(70000);
    });

    it('POST /api/transactions (Inflow with override) sets is_override=1 and allocation_rule_version=null', async () => {
      const res = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'inflow',
            amount: 100000,
            note: 'Consulting bonus with custom split',
            override_split: {
              tithe_pct: 10,
              kingdom_pct: 10,
              savings_pct: 25,
              invest_pct: 25,
              charity_pct: 25,
              expense_pct: 25,
            },
          }),
        },
        mockEnv
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.transaction.is_override).toBe(1);
      expect(data.transaction.allocation_rule_version).toBeNull();
    });

    it('POST /api/transactions (Outflow - Offering) should debit Expenses bucket by default', async () => {
      // Find Offering category id
      const catRes = db.exec("SELECT id FROM categories WHERE name = 'Offering'");
      const offeringId = catRes[0].values[0][0];

      // Get expenses bucket balance before
      const bBefore = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const bBeforeData = (await bBefore.json()) as any;
      const expenseBefore = bBeforeData.data.find((b: any) => b.key === 'expense').balance;

      const res = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'outflow',
            amount: 5000,
            category_id: offeringId,
            note: 'Sunday Worship Offering',
          }),
        },
        mockEnv
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as any;

      // Expenses bucket should be debited by 5,000
      const bAfter = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const bAfterData = (await bAfter.json()) as any;
      const expenseAfter = bAfterData.data.find((b: any) => b.key === 'expense').balance;
      expect(expenseAfter).toBe(expenseBefore - 5000);
    });

    it('POST /api/transactions (Outflow - Seed) must require chosen_bucket_id and debit specified bucket', async () => {
      // Find Seed category id
      const seedRes = db.exec("SELECT id FROM categories WHERE name = 'Seed'");
      const seedId = seedRes[0].values[0][0];

      // 1. Calling without chosen_bucket_id must fail with 400
      const failRes = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'outflow',
            amount: 10000,
            category_id: seedId,
            note: 'Sacrificial pledge without bucket',
          }),
        },
        mockEnv
      );
      expect(failRes.status).toBe(400);

      // 2. Calling with chosen_bucket_id = savings bucket id
      const savingsRes = db.exec("SELECT id FROM allocation_buckets WHERE key = 'savings'");
      const savingsId = Number(savingsRes[0].values[0][0]);

      const bBefore = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const savingsBefore = (await bBefore.json() as any).data.find((b: any) => b.key === 'savings').balance;

      const successRes = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'outflow',
            amount: 10000,
            category_id: seedId,
            chosen_bucket_id: savingsId,
            note: 'Sacrificial pledge funded from savings',
          }),
        },
        mockEnv
      );

      expect(successRes.status).toBe(201);

      // Verify savings balance is reduced by 10,000
      const bAfter = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const savingsAfter = (await bAfter.json() as any).data.find((b: any) => b.key === 'savings').balance;
      expect(savingsAfter).toBe(savingsBefore - 10000);
    });

    it('POST /api/buckets/transfer should execute balanced, zero-sum two-legged transfer', async () => {
      const bRes = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const buckets = (await bRes.json() as any).data;
      const savings = buckets.find((b: any) => b.key === 'savings');
      const invest = buckets.find((b: any) => b.key === 'invest');

      const totalBalanceBefore = buckets.reduce((acc: number, b: any) => acc + b.balance, 0);

      const transferRes = await app.request(
        '/api/buckets/transfer',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            from_bucket_id: savings.id,
            to_bucket_id: invest.id,
            amount: 5000,
            reason: 'Rebalancing liquid savings to equities investment',
          }),
        },
        mockEnv
      );

      expect(transferRes.status).toBe(201);
      const transferData = (await transferRes.json()) as any;
      expect(transferData.transfer_id).toBeDefined();

      const bAfterRes = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const bucketsAfter = (await bAfterRes.json() as any).data;
      const savingsAfter = bucketsAfter.find((b: any) => b.key === 'savings');
      const investAfter = bucketsAfter.find((b: any) => b.key === 'invest');

      expect(savingsAfter.balance).toBe(savings.balance - 5000);
      expect(investAfter.balance).toBe(invest.balance + 5000);

      // System-wide balance conservation: total across all buckets must be identical
      const totalBalanceAfter = bucketsAfter.reduce((acc: number, b: any) => acc + b.balance, 0);
      expect(totalBalanceAfter).toBe(totalBalanceBefore);
    });

    it('POST /api/buckets/adjust should record manual adjustment entry', async () => {
      const bRes = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const charity = (await bRes.json() as any).data.find((b: any) => b.key === 'charity');

      const adjustRes = await app.request(
        '/api/buckets/adjust',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            bucket_id: charity.id,
            amount: -500,
            reason: 'Bank debit correction',
          }),
        },
        mockEnv
      );

      expect(adjustRes.status).toBe(201);

      const bAfterRes = await app.request('/api/buckets', { headers: { 'x-dev-bypass': 'true' } }, mockEnv);
      const charityAfter = (await bAfterRes.json() as any).data.find((b: any) => b.key === 'charity');
      expect(charityAfter.balance).toBe(charity.balance - 500);
    });

    it('PATCH /api/transactions/:id should append offsetting ledger entries, never mutate past records, and log audit trail', async () => {
      // Create a test expense transaction
      const foodCat = db.exec("SELECT id FROM categories WHERE name = 'Food'")[0].values[0][0];

      const createRes = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'outflow',
            amount: 4000,
            category_id: foodCat,
            note: 'Grocery store trip',
          }),
        },
        mockEnv
      );

      const tx = (await createRes.json() as any).transaction;

      // Count ledger entries before edit
      const entriesBefore = db.exec(
        `SELECT COUNT(*) FROM bucket_ledger_entries WHERE transaction_id = ${tx.id}`
      )[0].values[0][0];
      expect(entriesBefore).toBe(1);

      // Now edit the amount from 4,000 to 6,000
      const patchRes = await app.request(
        `/api/transactions/${tx.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
          body: JSON.stringify({
            amount: 6000,
            note: 'Grocery store trip (corrected receipt total)',
          }),
        },
        mockEnv
      );

      expect(patchRes.status).toBe(200);
      const patchData = (await patchRes.json()) as any;
      expect(patchData.ledger_reversed_and_reapplied).toBe(true);
      expect(patchData.audit_entries_logged).toBeGreaterThanOrEqual(1);

      // Invariant: original ledger entry was NEVER updated or deleted
      // Total entries for this transaction should now be: 1 original + 1 offsetting + 1 new = 3 entries
      const entriesAfterRes = db.exec(
        `SELECT id, entry_type, amount, note FROM bucket_ledger_entries WHERE transaction_id = ${tx.id} ORDER BY id ASC`
      );
      const entriesAfter = entriesAfterRes[0].values;
      expect(entriesAfter).toHaveLength(3);

      // Original entry is preserved unchanged
      expect(entriesAfter[0][1]).toBe('expense_debit');
      expect(entriesAfter[0][2]).toBe(4000);

      // Offsetting reversal entry is appended
      expect(entriesAfter[1][1]).toBe('manual_adjustment');
      expect(entriesAfter[1][2]).toBe(4000); // offsets -4000 debit by adding +4000

      // New entry with revised amount is appended
      expect(entriesAfter[2][1]).toBe('expense_debit');
      expect(entriesAfter[2][2]).toBe(6000);

      // Verify audit log has the changes recorded
      const auditRes = db.exec(
        `SELECT changed_field, old_value, new_value FROM transaction_audit_log WHERE transaction_id = ${tx.id}`
      );
      const auditRows = auditRes[0].values;
      const amountAudit = auditRows.find((r) => r[0] === 'amount');
      expect(amountAudit).toBeDefined();
      expect(Number(amountAudit![1])).toBe(4000);
      expect(Number(amountAudit![2])).toBe(6000);
    });

    it('DELETE /api/transactions/:id should soft reverse ledger entries and record in audit log', async () => {
      // Create a test outflow transaction
      const foodCat = db.exec("SELECT id FROM categories WHERE name = 'Food'")[0].values[0][0];

      const createRes = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
          body: JSON.stringify({
            date: '2026-09-26',
            direction: 'outflow',
            amount: 2500,
            category_id: foodCat,
            note: 'Mistaken duplicate entry',
          }),
        },
        mockEnv
      );

      const tx = (await createRes.json() as any).transaction;

      // Delete the transaction
      const delRes = await app.request(
        `/api/transactions/${tx.id}`,
        {
          method: 'DELETE',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(delRes.status).toBe(200);
      const delData = (await delRes.json()) as any;
      expect(delData.success).toBe(true);

      // Verify transaction row still exists with [DELETED] marker
      const txCheck = db.exec(`SELECT note FROM transactions WHERE id = ${tx.id}`)[0].values[0][0];
      expect(String(txCheck)).toContain('[DELETED]');

      // Verify audit log
      const auditCheck = db.exec(
        `SELECT changed_field, old_value, new_value FROM transaction_audit_log WHERE transaction_id = ${tx.id} AND changed_field = 'status'`
      );
      expect(auditCheck[0].values[0][1]).toBe('active');
      expect(auditCheck[0].values[0][2]).toBe('deleted');
    });

    it('GET /api/transactions/:id should return complete transaction detail, allocation runs, ledger entries, and audit log', async () => {
      const txRes = await app.request(
        '/api/transactions/1',
        {
          method: 'GET',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(txRes.status).toBe(200);
      const data = (await txRes.json()) as any;
      expect(data.transaction).toBeDefined();
      expect(data.allocation_runs).toBeInstanceOf(Array);
      expect(data.ledger_entries).toBeInstanceOf(Array);
      expect(data.audit_log).toBeInstanceOf(Array);
    });

    it('GET /api/buckets/:id/ledger should return paginated ledger journal for a bucket', async () => {
      const res = await app.request(
        '/api/buckets/1/ledger?limit=10',
        {
          method: 'GET',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.bucket).toBeDefined();
      expect(data.data).toBeInstanceOf(Array);
      expect(data.count).toBeGreaterThan(0);
    });
  });
});
