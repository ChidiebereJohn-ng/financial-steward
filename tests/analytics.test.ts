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
});
