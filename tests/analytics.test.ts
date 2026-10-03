import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';

describe('Analytics & Cash Flow Breakdown Endpoint Tests', () => {
  let db: Database;
  let mockEnv: any;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run migrations 0001 through 0007
    for (let i = 1; i <= 7; i++) {
      const filename = `000${i}_${
        i === 1
          ? 'foundation'
          : i === 2
          ? 'ledger_allocation'
          : i === 3
          ? 'dashboards'
          : i === 4
          ? 'budgets'
          : i === 5
          ? 'commitments'
          : i === 6
          ? 'investor'
          : 'tools'
      }.sql`;
      const migrationSql = readFileSync(join(__dirname, `../worker/migrations/${filename}`), 'utf-8');
      db.run(migrationSql);
    }

    // Seed sample transactions for analytics
    db.run(`
      INSERT INTO transactions (id, date, direction, subtype, amount, currency, category_id, income_source_id, note)
      VALUES 
        (101, '2026-10-01', 'inflow', NULL, 500000, 'NGN', NULL, 1, 'Salary October'),
        (102, '2026-10-05', 'outflow', NULL, 45000, 'NGN', 1, NULL, 'Grocery Shopping'),
        (103, '2026-10-05', 'outflow', NULL, 15000, 'NGN', 1, NULL, 'Weekend Dinner'),
        (104, '2026-10-10', 'outflow', NULL, 80000, 'NGN', 2, NULL, 'Quarterly Utility Bill'),
        (105, '2026-09-15', 'inflow', NULL, 300000, 'NGN', NULL, 1, 'Salary September'),
        (106, '2026-09-20', 'outflow', NULL, 50000, 'NGN', 1, NULL, 'September Groceries'),
        (107, '2026-10-01', 'outflow', NULL, 10000, 'NGN', 1, NULL, '[DELETED] Accidental Duplicate');
    `);

    // Mock KV namespace for CACHE
    const kvStore = new Map<string, string>();
    const mockKV = {
      get: async (key: string, type?: string) => {
        const val = kvStore.get(key);
        if (!val) return null;
        if (type === 'json') return JSON.parse(val);
        return val;
      },
      put: async (key: string, val: string) => {
        kvStore.set(key, val);
      },
    };

    mockEnv = {
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
          const results: any[] = [];
          for (const s of statements) {
            results.push(await s.run());
          }
          return results;
        },
      },
      CACHE: mockKV,
    };
  });

  it('GET /api/analytics/periods should return active years and months', async () => {
    const res = await app.request('/api/analytics/periods', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(Array.isArray(json.years)).toBe(true);
    expect(json.years).toContain('2026');
    expect(json.months).toContain('2026-10');
    expect(json.months).toContain('2026-09');
  });

  it('GET /api/analytics/breakdown should return monthly breakdown by default', async () => {
    const res = await app.request('/api/analytics/breakdown?month=2026-10', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.period.view).toBe('month');
    expect(json.period.current).toBe('2026-10');
    expect(json.period.label).toBe('October 2026');

    // Summary checks (excluding [DELETED] transaction)
    expect(json.summary.total_inflow).toBe(500000);
    // 45,000 + 15,000 + 80,000 = 140,000 (10,000 deleted is excluded)
    expect(json.summary.total_outflow).toBe(140000);
    expect(json.summary.net_delta).toBe(360000);
    expect(json.summary.transaction_count).toBe(4);

    // Expenses by category
    expect(json.expenses_by_category.length).toBeGreaterThan(0);
    const topCat = json.expenses_by_category[0];
    expect(topCat.total_amount).toBeGreaterThan(0);

    // Time series
    expect(json.time_series.length).toBe(31);
    expect(json.time_series[0].key).toBe('2026-10-01');
    expect(json.time_series[0].inflow).toBe(500000);
  });

  it('GET /api/analytics/breakdown?view=year should return 12-month annual breakdown', async () => {
    const res = await app.request('/api/analytics/breakdown?view=year&year=2026', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.period.view).toBe('year');
    expect(json.period.current).toBe('2026');
    expect(json.period.label).toBe('Year 2026');

    // Total inflow across Sept (300k) + Oct (500k) = 800,000
    expect(json.summary.total_inflow).toBe(800000);
    // Outflow across Sept (50k) + Oct (140k) = 190,000
    expect(json.summary.total_outflow).toBe(190000);
    expect(json.summary.net_delta).toBe(610000);

    // 12 monthly time series points
    expect(json.time_series.length).toBe(12);
    expect(json.time_series[8].label).toBe('Sep'); // Sept
    expect(json.time_series[8].inflow).toBe(300000);
    expect(json.time_series[9].label).toBe('Oct'); // Oct
    expect(json.time_series[9].inflow).toBe(500000);
  });

  it('GET /api/analytics/breakdown?view=day should return itemized daily audit', async () => {
    const res = await app.request('/api/analytics/breakdown?view=day&date=2026-10-05', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.period.view).toBe('day');
    expect(json.period.current).toBe('2026-10-05');
    expect(json.summary.total_inflow).toBe(0);
    expect(json.summary.total_outflow).toBe(60000); // 45k + 15k
    expect(json.summary.transaction_count).toBe(2);
    expect(json.all_transactions.length).toBe(2);
  });

  it('should track Inter-Bucket Fund Transfers in Analytics and adjust Net Retained Savings', async () => {
    // 1. Post an inflow transaction of 100,000 NGN in 2026-10 to generate allocation runs
    const inflowRes = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        date: '2026-10-15',
        direction: 'inflow',
        amount: 100000,
        currency: 'NGN',
        account_id: 1,
        note: 'Stewardship Inflow Test',
      }),
    }, mockEnv);
    expect(inflowRes.status).toBe(201);

    // 2. Execute Inter-Bucket Transfers from Savings (id=3) and Invest (id=4) to Expenses (id=6)
    const transfer1 = await app.request('/api/buckets/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        from_bucket_id: 3, // Savings
        to_bucket_id: 6,   // Expenses
        amount: 14000,
        date: '2026-10-16',
        reason: 'Covering expenses deficit from savings',
      }),
    }, mockEnv);
    expect(transfer1.status).toBe(201);

    const transfer2 = await app.request('/api/buckets/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        from_bucket_id: 4, // Invest
        to_bucket_id: 6,   // Expenses
        amount: 14000,
        date: '2026-10-16',
        reason: 'Covering expenses deficit from investment',
      }),
    }, mockEnv);
    expect(transfer2.status).toBe(201);

    // 3. Query Analytics Breakdown for 2026-10
    const analyticsRes = await app.request('/api/analytics/breakdown?month=2026-10', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);
    expect(analyticsRes.status).toBe(200);

    const json = await analyticsRes.json<any>();
    // Gross allocated was 14k (savings) + 14k (invest) = 28,000 NGN
    expect(json.summary.savings_invest_allocated).toBe(28000);
    // Transfers out = 28,000 NGN
    expect(json.summary.savings_invest_transfers_out).toBe(28000);
    expect(json.summary.savings_invest_transfers).toBe(-28000);
    // Net retained in savings & invest is 0!
    expect(json.summary.savings_invest_net).toBe(0);
    expect(json.summary.savings_invest_rate).toBe(0);

    // Separated savings & invest checks
    expect(json.summary.savings).toBeDefined();
    expect(json.summary.savings.allocated).toBe(14000);
    expect(json.summary.savings.transfer_out).toBe(14000);
    expect(json.summary.savings.net_retained).toBe(0);

    expect(json.summary.invest).toBeDefined();
    expect(json.summary.invest.allocated).toBe(14000);
    expect(json.summary.invest.transfer_out).toBe(14000);
    expect(json.summary.invest.net_retained).toBe(0);

    // Bucket transfers list should contain the 2 transfers
    expect(json.bucket_transfers.length).toBe(2);
    expect(json.bucket_transfers[0].amount).toBe(14000);

    // all_transactions should contain the bucket transfers merged in chronological sequence
    const transferEntries = json.all_transactions.filter((tx: any) => tx.direction === 'transfer');
    expect(transferEntries.length).toBe(2);
    expect(transferEntries[0].subtype).toBe('bucket_transfer');
    expect(transferEntries[0].category_name).toContain('→');
  });

  it('should accurately capture movements into the Investment bucket separated from Savings', async () => {
    // Execute a fund movement into Investment bucket (id=4) from Expenses (id=6)
    const moveRes = await app.request('/api/buckets/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        from_bucket_id: 6, // Expenses
        to_bucket_id: 4,   // Invest
        amount: 5000,
        date: '2026-10-18',
        reason: 'Surplus cash reinvested into paper assets',
      }),
    }, mockEnv);
    expect(moveRes.status).toBe(201);

    // Query Analytics Breakdown for 2026-10
    const analyticsRes = await app.request('/api/analytics/breakdown?month=2026-10', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);
    expect(analyticsRes.status).toBe(200);

    const json = await analyticsRes.json<any>();
    // Savings remains at 0 net retained (14k allocated - 14k out)
    expect(json.summary.savings.net_retained).toBe(0);
    expect(json.summary.savings.transfer_in).toBe(0);
    expect(json.summary.savings.transfer_out).toBe(14000);

    // Investment was: 14k allocated - 14k out + 5k in = 5k net retained!
    expect(json.summary.invest.allocated).toBe(14000);
    expect(json.summary.invest.transfer_out).toBe(14000);
    expect(json.summary.invest.transfer_in).toBe(5000);
    expect(json.summary.invest.net_retained).toBe(5000);

    // Combined net retained is 5000
    expect(json.summary.savings_invest_net).toBe(5000);
  });

  it('should exclude deleted transaction debits while accurately accounting for active investment debits', async () => {
    // 1. Post an active expense debit on Investment bucket (id=4)
    const expenseRes = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        date: '2026-10-20',
        direction: 'outflow',
        amount: 2000,
        currency: 'NGN',
        account_id: 1,
        category_id: 8, // 'Seed' (flexible bucket category)
        chosen_bucket_id: 4, // Directly debits investment bucket
        note: 'Active paper asset investment',
      }),
    }, mockEnv);
    expect(expenseRes.status).toBe(201);
    const expJson = await expenseRes.json<any>();
    const activeTxId = expJson.transaction.id;

    // 2. Post another expense debit and delete it
    const deletedExpRes = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({
        date: '2026-10-21',
        direction: 'outflow',
        amount: 3000,
        currency: 'NGN',
        account_id: 1,
        category_id: 8, // 'Seed'
        chosen_bucket_id: 4,
        note: 'Accidental investment outlay',
      }),
    }, mockEnv);
    expect(deletedExpRes.status).toBe(201);
    const delJson = await deletedExpRes.json<any>();
    const delTxId = delJson.transaction.id;

    // Delete it
    const delRes = await app.request(`/api/transactions/${delTxId}`, {
      method: 'DELETE',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);
    expect(delRes.status).toBe(200);

    // 3. Query Analytics Breakdown for 2026-10
    const analyticsRes = await app.request('/api/analytics/breakdown?month=2026-10', {
      method: 'GET',
      headers: { 'x-dev-bypass': 'true' },
    }, mockEnv);
    expect(analyticsRes.status).toBe(200);

    const json = await analyticsRes.json<any>();
    // Prior investment retained was 5000.
    // Active debit of 2000 reduces it to 3000.
    // The deleted 3000 debit MUST NOT reduce it to 0!
    expect(json.summary.invest.debits).toBe(2000);
    expect(json.summary.invest.net_retained).toBe(3000);
  });
});
