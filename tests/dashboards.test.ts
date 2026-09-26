import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app, { handleScheduled } from '../worker/index';
import { computeNetWorth, getFxRate, refreshMonthlySummaries } from '../worker/lib/analytics';

describe('Module 3: Two Dashboards (Financial Health vs. Money Movement)', () => {
  let db: Database;
  let mockEnv: any;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run migrations 0001, 0002, and 0003
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

    const m3 = readFileSync(
      join(__dirname, '../worker/migrations/0003_dashboards.sql'),
      'utf-8'
    );
    db.run(m3);

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
            db.run(sql);
            const lastId = db.exec('SELECT last_insert_rowid() as id');
            return {
              meta: {
                last_row_id: Number(lastId[0]?.values[0]?.[0] || 0),
                changes: 1,
              },
            };
          },
        }),
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
  });

  describe('1. D1 Schema Migration 0003 Verification', () => {
    it('should create monthly_summaries, net_worth_snapshots, and fx_rates tables', () => {
      const res = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tables = res[0].values.map((v) => v[0] as string);

      expect(tables).toContain('monthly_summaries');
      expect(tables).toContain('net_worth_snapshots');
      expect(tables).toContain('fx_rates');
    });

    it('should seed initial FX rates', () => {
      const res = db.exec("SELECT from_currency, to_currency, rate FROM fx_rates WHERE from_currency = 'USD'");
      expect(res[0].values.length).toBeGreaterThan(0);
      const rate = res[0].values[0][2];
      expect(Number(rate)).toBeGreaterThan(1000);
    });
  });

  describe('2. Multi-currency FX & Net Worth Math', () => {
    it('should resolve FX rates accurately with direct and inverse conversion', async () => {
      const usdToNgn = await getFxRate(mockEnv.DB, 'USD', 'NGN', '2026-09-26');
      expect(usdToNgn).toBe(1650);

      const sameCurrency = await getFxRate(mockEnv.DB, 'NGN', 'NGN', '2026-09-26');
      expect(sameCurrency).toBe(1.0);

      const ngnToUsd = await getFxRate(mockEnv.DB, 'NGN', 'USD', '2026-09-26');
      expect(ngnToUsd).toBeCloseTo(1 / 1650, 6);
    });

    it('should compute net worth aggregating bucket balances and foreign currency accounts', async () => {
      // Create a USD account with $500 balance
      db.run(
        "INSERT INTO accounts (name, type, currency, last_reconciled_balance) VALUES ('Dolar Card', 'wallet', 'USD', 500.0)"
      );

      // Create an inflow transaction to populate bucket balances
      const inflowRes = await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
          body: JSON.stringify({
            date: '2026-09-20',
            direction: 'inflow',
            amount: 500000,
            note: 'Tech Consulting retainer',
            income_source_id: 1,
          }),
        },
        mockEnv
      );
      expect(inflowRes.status).toBe(201);

      // Compute net worth
      const snapshot = await computeNetWorth(mockEnv.DB, '2026-09-26');
      expect(snapshot.id).toBeDefined();
      expect(snapshot.base_currency).toBe('NGN');

      // 500 USD @ 1650 = 825,000 NGN + 500,000 NGN in buckets = 1,325,000 NGN total assets
      expect(snapshot.total_assets).toBe(1325000);
      expect(snapshot.total_liabilities).toBe(0);
      expect(snapshot.net_worth).toBe(1325000);

      // Verify row persisted in net_worth_snapshots
      const countRes = db.exec('SELECT COUNT(*) FROM net_worth_snapshots');
      expect(Number(countRes[0].values[0][0])).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Precomputed Monthly Summaries Refresh', () => {
    it('should precompute monthly outflow and inflow aggregates into monthly_summaries', async () => {
      // Add an expense outflow in 2026-09
      const foodCat = db.exec("SELECT id FROM categories WHERE name = 'Food'")[0].values[0][0];
      await app.request(
        '/api/transactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
          body: JSON.stringify({
            date: '2026-09-22',
            direction: 'outflow',
            amount: 25000,
            category_id: foodCat,
            note: 'Monthly groceries',
          }),
        },
        mockEnv
      );

      // Trigger refresh
      const result = await refreshMonthlySummaries(mockEnv.DB, '2026-09');
      expect(result.month).toBe('2026-09');
      expect(result.count).toBeGreaterThan(0);

      // Verify records in monthly_summaries
      const res = db.exec("SELECT month, category_id, bucket_id, total_amount FROM monthly_summaries WHERE month = '2026-09'");
      expect(res[0].values.length).toBeGreaterThan(0);

      // Ensure idempotency: refreshing again deletes and replaces cleanly
      const rerun = await refreshMonthlySummaries(mockEnv.DB, '2026-09');
      expect(rerun.count).toBe(result.count);
    });
  });

  describe('4. Endpoints: Health & Ledger Dashboards', () => {
    it('GET /api/dashboard/health should return complete progressive KPIs and honest metrics', async () => {
      const res = await app.request(
        '/api/dashboard/health',
        {
          method: 'GET',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      const data = json.data;

      // Invariant checks
      expect(data.net_worth_current).toBeDefined();
      expect(data.net_worth_trend).toBeInstanceOf(Array);
      expect(data.savings_invest_rate).toBeDefined();
      expect(typeof data.savings_invest_rate.this_month_pct).toBe('number');
      // For 500k inflow, savings = 70k, invest = 70k -> (140k / 500k) * 100 = 28%
      expect(data.savings_invest_rate.this_month_pct).toBe(28);

      expect(data.allocation_waterfall).toBeDefined();
      expect(data.allocation_waterfall.splits.tithe).toBe(50000);
      expect(data.allocation_waterfall.splits.kingdom).toBe(100000);
      expect(data.allocation_waterfall.splits.savings).toBe(70000);
      expect(data.allocation_waterfall.splits.invest).toBe(70000);
      expect(data.allocation_waterfall.splits.charity).toBe(35000);
      expect(data.allocation_waterfall.splits.expense).toBe(175000);

      expect(data.budget_adherence_summary).toBeDefined();
      expect(data.budget_adherence_summary.categories).toBeInstanceOf(Array);

      expect(data.runway).toBeDefined();
      expect(data.runway.expenses_balance).toBe(150000); // 175k minus 25k spent = 150k
      expect(data.runway.runway_days).toBeGreaterThan(0);
    });

    it('GET /api/dashboard/ledger should return 6 live bucket balances, daily series, and 10 recent transactions', async () => {
      const res = await app.request(
        '/api/dashboard/ledger',
        {
          method: 'GET',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      const data = json.data;

      expect(data.buckets).toHaveLength(6);
      const keys = data.buckets.map((b: any) => b.key);
      expect(keys).toEqual(['tithe', 'kingdom', 'savings', 'invest', 'charity', 'expense']);

      expect(data.daily_series).toBeInstanceOf(Array);
      expect(data.daily_series.length).toBeGreaterThan(0);

      expect(data.recent_transactions).toBeInstanceOf(Array);
      expect(data.recent_transactions.length).toBeGreaterThan(0);
      expect(data.recent_transactions[0].category_name).toBeDefined();
    });

    it('GET /api/net-worth and POST /api/net-worth/snapshot should handle history and on-demand snapshots', async () => {
      // POST on-demand snapshot
      const createRes = await app.request(
        '/api/net-worth/snapshot',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
          body: JSON.stringify({ as_of_date: '2026-09-26' }),
        },
        mockEnv
      );

      expect(createRes.status).toBe(201);
      const createJson = (await createRes.json()) as any;
      expect(createJson.snapshot.net_worth).toBeGreaterThan(0);

      // GET history
      const listRes = await app.request(
        '/api/net-worth?limit=10',
        {
          method: 'GET',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(listRes.status).toBe(200);
      const listJson = (await listRes.json()) as any;
      expect(listJson.data).toBeInstanceOf(Array);
      expect(listJson.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Worker Scheduled Cron Execution', () => {
    it('should successfully execute nightly cron handler', async () => {
      let waitUntilPromise: Promise<any> | null = null;
      const ctx = {
        waitUntil: (p: Promise<any>) => {
          waitUntilPromise = p;
        },
      };

      await handleScheduled(
        { cron: '0 1 * * *', scheduledTime: Date.now() },
        mockEnv,
        ctx
      );

      if (waitUntilPromise) {
        await waitUntilPromise;
      }

      // Verify that snapshots and summaries were computed by the cron
      const snapshots = db.exec('SELECT COUNT(*) FROM net_worth_snapshots');
      expect(Number(snapshots[0].values[0][0])).toBeGreaterThanOrEqual(1);

      const summaries = db.exec('SELECT COUNT(*) FROM monthly_summaries');
      expect(Number(summaries[0].values[0][0])).toBeGreaterThanOrEqual(1);
    });
  });
});
