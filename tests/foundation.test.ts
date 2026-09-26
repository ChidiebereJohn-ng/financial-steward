import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';

describe('Module 1: Foundation Tests', () => {
  let db: Database;

  beforeAll(async () => {
    // Initialize WebAssembly SQLite and run 0001_foundation.sql
    const SQL = await initSqlJs();
    db = new SQL.Database();

    const migrationSql = readFileSync(
      join(__dirname, '../worker/migrations/0001_foundation.sql'),
      'utf-8'
    );
    db.run(migrationSql);
  });

  describe('D1 Migration 0001_foundation.sql Integrity', () => {
    it('should create all foundation reference tables', () => {
      const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables = res[0].values.map((v) => v[0] as string);

      expect(tables).toContain('allocation_buckets');
      expect(tables).toContain('allocation_rules');
      expect(tables).toContain('categories');
      expect(tables).toContain('income_sources');
      expect(tables).toContain('accounts');
      expect(tables).toContain('auth_credentials');
    });

    it('should seed exactly the six core allocation buckets with correct pass-through flags', () => {
      const stmt = db.prepare('SELECT id, key, name, is_pass_through FROM allocation_buckets ORDER BY id ASC');
      const buckets: any[] = [];
      while (stmt.step()) {
        buckets.push(stmt.getAsObject());
      }
      stmt.free();

      expect(buckets).toHaveLength(6);
      const bucketMap = Object.fromEntries(buckets.map((b) => [b.key, b]));

      expect(bucketMap['tithe']).toBeDefined();
      expect(bucketMap['tithe'].is_pass_through).toBe(1);

      expect(bucketMap['kingdom']).toBeDefined();
      expect(bucketMap['kingdom'].is_pass_through).toBe(1);

      expect(bucketMap['savings']).toBeDefined();
      expect(bucketMap['savings'].is_pass_through).toBe(0);

      expect(bucketMap['invest']).toBeDefined();
      expect(bucketMap['invest'].is_pass_through).toBe(0);

      expect(bucketMap['charity']).toBeDefined();
      expect(bucketMap['charity'].is_pass_through).toBe(0);

      expect(bucketMap['expense']).toBeDefined();
      expect(bucketMap['expense'].is_pass_through).toBe(0);
    });

    it('should seed allocation rule v1 with valid waterfall percentages', () => {
      const stmt = db.prepare('SELECT * FROM allocation_rules WHERE version = 1');
      let rule: any = null;
      if (stmt.step()) {
        rule = stmt.getAsObject();
      }
      stmt.free();

      expect(rule).toBeDefined();
      expect(rule.tithe_pct).toBe(10);
      expect(rule.kingdom_pct).toBe(20);
      expect(rule.savings_pct).toBe(20);
      expect(rule.invest_pct).toBe(20);
      expect(rule.charity_pct).toBe(10);
      expect(rule.expense_pct).toBe(50);
      expect(rule.effective_to).toBeNull();

      // Invariant: remainder components must sum to 100%
      const remainderSum = rule.savings_pct + rule.invest_pct + rule.charity_pct + rule.expense_pct;
      expect(remainderSum).toBe(100);
    });

    it('should enforce Seed flexible sourcing vs Offering fixed expenses sourcing', () => {
      const expenseBucketRes = db.exec("SELECT id FROM allocation_buckets WHERE key = 'expense'");
      const expenseBucketId = expenseBucketRes[0].values[0][0];

      const seedStmt = db.prepare("SELECT * FROM categories WHERE name = 'Seed'");
      seedStmt.step();
      const seed = seedStmt.getAsObject();
      seedStmt.free();

      expect(seed.bucket_is_flexible).toBe(1);
      expect(seed.default_bucket_id).toBeNull();

      const offeringStmt = db.prepare("SELECT * FROM categories WHERE name = 'Offering'");
      offeringStmt.step();
      const offering = offeringStmt.getAsObject();
      offeringStmt.free();

      expect(offering.bucket_is_flexible).toBe(0);
      expect(offering.default_bucket_id).toBe(expenseBucketId);
    });

    it('should seed 13 initial categories and standard income sources', () => {
      const catCountRes = db.exec('SELECT count(*) FROM categories');
      const count = catCountRes[0].values[0][0] as number;
      expect(count).toBeGreaterThanOrEqual(13);

      const sourcesRes = db.exec('SELECT name FROM income_sources');
      const sourceNames = sourcesRes[0].values.map((v) => v[0] as string);

      expect(sourceNames).toContain('Salary');
      expect(sourceNames).toContain('Portfolio Income');
      expect(sourceNames).toContain('Business Revenue');
      expect(sourceNames).toContain('Gift');
      expect(sourceNames).toContain('Other');
    });
  });

  describe('Hono Worker Routing & Middleware', () => {
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
                    return { meta: { last_row_id: Number(lastId[0]?.values[0]?.[0] || 0), changes: 1 } };
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
                return { meta: { last_row_id: Number(lastId[0]?.values[0]?.[0] || 0), changes: 1 } };
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
        DEV_AUTH_BYPASS: 'false',
      };
    }

    it('GET /api/health should respond 200 without authentication', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe('ok');
      expect(data.module).toMatch(/Module \d+/);
    });

    it('GET /api/categories should return 401 when unauthenticated', async () => {
      const mockEnv = createMockEnv();
      const res = await app.request('/api/categories', {}, mockEnv);
      expect(res.status).toBe(401);
    });

    it('GET /api/categories should return categories when dev bypass header is provided', async () => {
      const mockEnv = createMockEnv();
      const res = await app.request(
        '/api/categories',
        { headers: { 'x-dev-bypass': 'true' } },
        mockEnv
      );
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.categories).toBeInstanceOf(Array);
      expect(data.categories.length).toBeGreaterThanOrEqual(13);
    });

    it('GET /api/allocation-rules/current should return active v1 rule', async () => {
      const mockEnv = createMockEnv();
      const res = await app.request(
        '/api/allocation-rules/current',
        { headers: { 'x-dev-bypass': 'true' } },
        mockEnv
      );
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.rule.version).toBe(1);
      expect(data.rule.tithe_pct).toBe(10);
      expect(data.rule.kingdom_pct).toBe(20);
    });

    it('POST /api/allocation-rules should validate percentages and close out previous rule', async () => {
      const mockEnv = createMockEnv();

      // Invalid percentages: remainder does not sum to 100 (20+20+10+40 = 90)
      const invalidRes = await app.request(
        '/api/allocation-rules',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            tithe_pct: 10,
            kingdom_pct: 20,
            savings_pct: 20,
            invest_pct: 20,
            charity_pct: 10,
            expense_pct: 40,
          }),
        },
        mockEnv
      );
      expect(invalidRes.status).toBe(400);

      // Valid percentages: creates v2 and closes v1
      const validRes = await app.request(
        '/api/allocation-rules',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            tithe_pct: 10,
            kingdom_pct: 20,
            savings_pct: 25,
            invest_pct: 25,
            charity_pct: 10,
            expense_pct: 40,
          }),
        },
        mockEnv
      );
      expect(validRes.status).toBe(201);
      const validData = await validRes.json() as any;
      expect(validData.rule.version).toBe(2);

      // Verify in DB that v1 now has effective_to set
      const v1Stmt = db.prepare('SELECT * FROM allocation_rules WHERE version = 1');
      v1Stmt.step();
      const v1 = v1Stmt.getAsObject();
      v1Stmt.free();
      expect(v1.effective_to).not.toBeNull();
    });

    it('POST /api/categories should create new custom category', async () => {
      const mockEnv = createMockEnv();
      const res = await app.request(
        '/api/categories',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-dev-bypass': 'true',
          },
          body: JSON.stringify({
            name: 'Books & Courses',
            bucket_is_flexible: false,
          }),
        },
        mockEnv
      );

      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.category.name).toBe('Books & Courses');
    });

    it('POST /api/auth/dev-login should grant session cookie and token', async () => {
      const mockEnv = createMockEnv();
      const res = await app.request(
        '/api/auth/dev-login',
        {
          method: 'POST',
          headers: { 'x-dev-bypass': 'true' },
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.token).toContain('dev_session_');
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('steward_session=');
    });
  });
});
