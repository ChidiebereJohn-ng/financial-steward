import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';
import {
  setBudget,
  setBulkBudgets,
  getBudgetVariance,
  getOverallAdherence,
  copyPreviousMonthBudget,
  getBudgetTrend,
  getPreviousMonth,
  getMonthRange,
} from '../worker/lib/budgets';

describe('Module 4: Budgets (Adherence %, Category Variance, Charts)', () => {
  let db: Database;
  let mockEnv: any;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run migrations 0001, 0002, 0003, and 0004
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

    const m4 = readFileSync(
      join(__dirname, '../worker/migrations/0004_budgets.sql'),
      'utf-8'
    );
    db.run(m4);

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

  describe('1. D1 Schema Migration 0004 Verification', () => {
    it('should create the budgets table and index', () => {
      const res = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'budgets'"
      );
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].values[0][0]).toBe('budgets');

      const indexRes = db.exec(
        "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_budgets_month_category'"
      );
      expect(indexRes.length).toBeGreaterThan(0);
      expect(indexRes[0].values[0][0]).toBe('idx_budgets_month_category');
    });

    it('should enforce UNIQUE constraint on (month, category_id)', () => {
      db.run("INSERT INTO budgets (month, category_id, planned_amount) VALUES ('2026-09', 1, 50000)");
      expect(() => {
        db.run("INSERT INTO budgets (month, category_id, planned_amount) VALUES ('2026-09', 1, 60000)");
      }).toThrow();
      // Clean up for subsequent tests
      db.run("DELETE FROM budgets WHERE month = '2026-09'");
    });
  });

  describe('2. Helper Functions (getPreviousMonth, getMonthRange)', () => {
    it('should calculate previous month across standard months and year boundaries', () => {
      expect(getPreviousMonth('2026-09')).toBe('2026-08');
      expect(getPreviousMonth('2026-01')).toBe('2025-12');
      expect(getPreviousMonth('2025-12')).toBe('2025-11');
    });

    it('should generate inclusive chronological month ranges', () => {
      const range = getMonthRange('2026-01', '2026-04');
      expect(range).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);

      const yearCrossing = getMonthRange('2025-11', '2026-02');
      expect(yearCrossing).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    });
  });

  describe('3. Core Budget Engine: Planned Amounts & Variances', () => {
    it('should set single and bulk budgets with upsert support', async () => {
      // Set single
      const b1 = await setBudget(mockEnv.DB, '2026-09', 1, 100000);
      expect(b1.month).toBe('2026-09');
      expect(b1.category_id).toBe(1);
      expect(b1.planned_amount).toBe(100000);

      // Upsert update
      const b1Updated = await setBudget(mockEnv.DB, '2026-09', 1, 120000);
      expect(b1Updated.planned_amount).toBe(120000);

      // Bulk set
      const bulkRes = await setBulkBudgets(mockEnv.DB, '2026-09', [
        { category_id: 2, planned_amount: 50000 },
        { category_id: 3, planned_amount: 80000 },
        { category_id: 4, planned_amount: 40000 },
      ]);
      expect(bulkRes.count).toBe(3);
      expect(bulkRes.month).toBe('2026-09');
    });

    it('should calculate planned vs actual variance per category', async () => {
      // Add outflow transactions for 2026-09
      // Category 1: planned 120,000, actual 100,000 (under budget)
      // Category 2: planned 50,000, actual 60,000 (over budget by 20%)
      // Category 3: planned 80,000, actual 70,000 (under budget, warning range >= 80%)
      // Category 4: planned 40,000, actual 0 (under budget)
      db.run(`
        INSERT INTO transactions (id, account_id, category_id, direction, amount, currency, date, note)
        VALUES 
          (101, 1, 1, 'outflow', 100000, 'NGN', '2026-09-05', 'Groceries batch 1'),
          (102, 1, 2, 'outflow', 60000, 'NGN', '2026-09-10', 'Utilities overage'),
          (103, 1, 3, 'outflow', 70000, 'NGN', '2026-09-12', 'Transport monthly')
      `);

      const variances = await getBudgetVariance(mockEnv.DB, '2026-09');
      expect(variances.length).toBeGreaterThan(0);

      const cat1 = variances.find((v) => v.category_id === 1);
      expect(cat1).toBeDefined();
      expect(cat1?.planned).toBe(120000);
      expect(cat1?.actual).toBe(100000);
      expect(cat1?.status).toBe('warning'); // 100k / 120k = 83.3% >= 80%

      const cat2 = variances.find((v) => v.category_id === 2);
      expect(cat2).toBeDefined();
      expect(cat2?.planned).toBe(50000);
      expect(cat2?.actual).toBe(60000);
      expect(cat2?.variance_pct).toBe(20.0); // +20%
      expect(cat2?.overage_amount).toBe(10000);
      expect(cat2?.status).toBe('over'); // Red overage

      const cat3 = variances.find((v) => v.category_id === 3);
      expect(cat3).toBeDefined();
      expect(cat3?.planned).toBe(80000);
      expect(cat3?.actual).toBe(70000);
      expect(cat3?.status).toBe('warning'); // 70k / 80k = 87.5% >= 80%
    });
  });

  describe('4. Overall Adherence % Mathematical Formula & Non-Isolation Invariant', () => {
    it('should compute exact adherence % when total actual <= total planned (100%)', async () => {
      // Create a test month 2026-08 where planned = 100,000 and actual = 80,000
      await setBudget(mockEnv.DB, '2026-08', 1, 100000);
      db.run(`
        INSERT INTO transactions (id, account_id, category_id, direction, amount, currency, date, note)
        VALUES (201, 1, 1, 'outflow', 80000, 'NGN', '2026-08-15', 'August spend')
      `);

      const result = await getOverallAdherence(mockEnv.DB, '2026-08');
      expect(result.overall_adherence_pct).toBe(100);
      expect(result.total_planned).toBe(100000);
      expect(result.total_actual).toBe(80000);
      // Non-isolation invariant: must pair with categories breakdown and worst offenders
      expect(Array.isArray(result.categories)).toBe(true);
      expect(Array.isArray(result.worst_offenders)).toBe(true);
      expect(result.worst_offenders.length).toBe(0); // No overages
    });

    it('should compute exact adherence % when total actual > total planned', async () => {
      // In 2026-09:
      // planned: 120,000 + 50,000 + 80,000 + 40,000 = 290,000
      // actual: 100,000 + 60,000 + 70,000 = 230,000 (still under total planned -> 100%)
      const resUnder = await getOverallAdherence(mockEnv.DB, '2026-09');
      expect(resUnder.overall_adherence_pct).toBe(100);
      // Worst offender cat2 should still be listed in worst_offenders even if total adherence is 100%
      expect(resUnder.worst_offenders.length).toBe(1);
      expect(resUnder.worst_offenders[0].category_id).toBe(2);

      // Now add large overage in 2026-09 to push total spend to 348,000
      // planned = 290,000, actual = 348,000
      // overage = 58,000
      // (58,000 / 290,000) * 100 = 20%
      // Adherence = 100 - 20 = 80%
      db.run(`
        INSERT INTO transactions (id, account_id, category_id, direction, amount, currency, date, note)
        VALUES (104, 1, 4, 'outflow', 118000, 'NGN', '2026-09-20', 'Discretionary spike')
      `);

      const resOver = await getOverallAdherence(mockEnv.DB, '2026-09');
      expect(resOver.total_planned).toBe(290000);
      expect(resOver.total_actual).toBe(348000);
      expect(resOver.overall_adherence_pct).toBe(80);
      expect(resOver.worst_offenders.length).toBe(2); // cat 4 (overage 78k) and cat 2 (overage 10k)
      expect(resOver.worst_offenders[0].category_id).toBe(4);
      expect(resOver.worst_offenders[0].overage_amount).toBe(78000);
      expect(resOver.worst_offenders[1].category_id).toBe(2);
      expect(resOver.worst_offenders[1].overage_amount).toBe(10000);
    });

    it('should strictly clamp adherence at 0% when overage exceeds 100% of planned', async () => {
      // Month 2026-07: planned = 50,000, actual = 200,000 (300% overage)
      // 100 - ((200k - 50k)/50k * 100) = 100 - 300 = -200% -> clamped to 0%
      await setBudget(mockEnv.DB, '2026-07', 1, 50000);
      db.run(`
        INSERT INTO transactions (id, account_id, category_id, direction, amount, currency, date, note)
        VALUES (301, 1, 1, 'outflow', 200000, 'NGN', '2026-07-10', 'Catastrophic expense')
      `);

      const result = await getOverallAdherence(mockEnv.DB, '2026-07');
      expect(result.overall_adherence_pct).toBe(0);
      expect(result.overall_adherence_pct).toBeGreaterThanOrEqual(0);
      expect(result.worst_offenders[0].overage_amount).toBe(150000);
    });
  });

  describe('5. Copy Previous Month Budget Functionality', () => {
    it('should copy all planned amounts from targetMonth - 1 into targetMonth', async () => {
      // 2026-09 has budgets configured for categories 1, 2, 3, 4
      const copyRes = await copyPreviousMonthBudget(mockEnv.DB, '2026-10');
      expect(copyRes.count).toBe(4);
      expect(copyRes.target_month).toBe('2026-10');
      expect(copyRes.previous_month).toBe('2026-09');

      // Verify copied rows in DB
      const octBudgets = await getBudgetVariance(mockEnv.DB, '2026-10');
      const b1 = octBudgets.find((b) => b.category_id === 1);
      const b2 = octBudgets.find((b) => b.category_id === 2);
      expect(b1?.planned).toBe(120000);
      expect(b2?.planned).toBe(50000);
    });

    it('should handle year boundaries properly (e.g. copying 2026-12 into 2027-01)', async () => {
      await setBudget(mockEnv.DB, '2026-12', 5, 75000);
      const copyRes = await copyPreviousMonthBudget(mockEnv.DB, '2027-01');
      expect(copyRes.count).toBe(1);
      expect(copyRes.previous_month).toBe('2026-12');
      expect(copyRes.target_month).toBe('2027-01');

      const janBudgets = await getBudgetVariance(mockEnv.DB, '2027-01');
      const b5 = janBudgets.find((b) => b.category_id === 5);
      expect(b5?.planned).toBe(75000);
    });

    it('should return count 0 if previous month had no budgets', async () => {
      const copyRes = await copyPreviousMonthBudget(mockEnv.DB, '2025-05');
      expect(copyRes.count).toBe(0);
      expect(copyRes.items.length).toBe(0);
    });
  });

  describe('6. Month-over-Month Adherence Trend Engine', () => {
    it('should return chronological adherence data points across months', async () => {
      const trend = await getBudgetTrend(mockEnv.DB, '2026-07', '2026-09');
      expect(trend.length).toBe(3);
      expect(trend[0].month).toBe('2026-07');
      expect(trend[0].overall_adherence_pct).toBe(0);

      expect(trend[1].month).toBe('2026-08');
      expect(trend[1].overall_adherence_pct).toBe(100);

      expect(trend[2].month).toBe('2026-09');
      expect(trend[2].overall_adherence_pct).toBe(80);
    });
  });

  describe('7. API Endpoints Integration (Hono)', () => {
    it('GET /api/budgets should return adherence %, category breakdown, and worst offenders', async () => {
      const res = await app.request('/api/budgets?month=2026-09', {
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.month).toBe('2026-09');
      expect(data.overall_adherence_pct).toBe(80);
      expect(data.total_planned).toBe(290000);
      expect(data.total_actual).toBe(348000);
      expect(Array.isArray(data.categories)).toBe(true);
      expect(Array.isArray(data.worst_offenders)).toBe(true);
      expect(data.worst_offenders.length).toBe(2);
    });

    it('GET /api/budgets should reject invalid month format', async () => {
      const res = await app.request('/api/budgets?month=invalid', {
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toContain('Invalid month format');
    });

    it('POST /api/budgets should upsert single budget item', async () => {
      const res = await app.request('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          month: '2026-11',
          category_id: 1,
          planned_amount: 150000,
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.budget.planned_amount).toBe(150000);
      expect(data.adherence.month).toBe('2026-11');
    });

    it('POST /api/budgets should bulk upsert budget items', async () => {
      const res = await app.request('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          month: '2026-11',
          items: [
            { category_id: 2, planned_amount: 60000 },
            { category_id: 3, planned_amount: 90000 },
          ],
        }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);
      expect(data.adherence.total_planned).toBe(300000); // 150k + 60k + 90k
    });

    it('POST /api/budgets/copy-previous should copy budget and return updated adherence', async () => {
      const res = await app.request('/api/budgets/copy-previous', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          target_month: '2026-12',
        }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.target_month).toBe('2026-12');
      expect(data.previous_month).toBe('2026-11');
      expect(data.count).toBe(3); // categories 1, 2, 3
    });

    it('GET /api/budgets/trend should return month series', async () => {
      const res = await app.request('/api/budgets/trend?from=2026-07&to=2026-10', {
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.from).toBe('2026-07');
      expect(data.to).toBe('2026-10');
      expect(data.series.length).toBe(4);
    });

    it('Health check endpoint should report Module 4 status', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.module).toContain('Module 4: Budgets');
    });
  });
});
