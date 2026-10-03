import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';
import {
  evaluatePurchaseRiskTier,
  calculatePurchaseRisk,
  getPurchaseCalculations,
  getDigestItems,
  markDigestItemRead,
  createDigestItem,
  generateResearchBriefings,
} from '../worker/lib/tools';
import {
  escapeCsvCell,
  formatCsvRow,
  generateFullCsvExport,
} from '../worker/lib/export';

describe('Module 7: Purchase Calculator, Research Digest & CSV Export', () => {
  let db: Database;
  let mockEnv: any;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run migrations 0001 through 0007
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

    const m6 = readFileSync(join(__dirname, '../worker/migrations/0006_investor.sql'), 'utf-8');
    db.run(m6);

    const m7 = readFileSync(join(__dirname, '../worker/migrations/0007_tools.sql'), 'utf-8');
    db.run(m7);

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
      delete: async (key: string) => {
        kvStore.delete(key);
      },
    };

    mockEnv = {
      CACHE: mockKV,
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
              } catch (err: any) {
                return { results: [], error: err.message };
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
              } catch (err: any) {
                return null;
              }
            },
            run: async () => {
              try {
                db.run(sql, params);
                const lastIdRes = db.exec('SELECT last_insert_rowid() as id');
                const lastId = lastIdRes[0]?.values[0]?.[0] || 0;
                return { success: true, meta: { last_row_id: Number(lastId), changes: 1 } };
              } catch (err: any) {
                throw err;
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
            const lastIdRes = db.exec('SELECT last_insert_rowid() as id');
            const lastId = lastIdRes[0]?.values[0]?.[0] || 0;
            return { success: true, meta: { last_row_id: Number(lastId), changes: 1 } };
          },
        }),
      },
    };
  });

  // --------------------------------------------------------------------------
  // 1. D1 Migration 0007 Verification
  // --------------------------------------------------------------------------
  describe('1. D1 Migration 0007 Schema Verification', () => {
    it('should create purchase_calculations, digest_items, and import_batches tables', () => {
      const tables = db.exec(`
        SELECT name FROM sqlite_master WHERE type='table' 
        AND name IN ('purchase_calculations', 'digest_items', 'import_batches')
      `);
      const tableNames = tables[0].values.map((row) => row[0]);
      expect(tableNames).toContain('purchase_calculations');
      expect(tableNames).toContain('digest_items');
      expect(tableNames).toContain('import_batches');
    });

    it('should have pre-seeded curated digest items in digest_items', async () => {
      const items = await getDigestItems(mockEnv.DB);
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items[0].topic).toBeDefined();
      expect(items[0].summary).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Section 5 APP_LOGIC.md: Purchase Risk Tier Boundary Evaluation
  // --------------------------------------------------------------------------
  describe('2. Purchase Risk Tier Boundary Evaluation', () => {
    it('should categorize ratio < 1% as "Safe"', () => {
      expect(evaluatePurchaseRiskTier(0)).toBe('Safe');
      expect(evaluatePurchaseRiskTier(0.5)).toBe('Safe');
      expect(evaluatePurchaseRiskTier(0.99)).toBe('Safe');
    });

    it('should categorize 1% <= ratio < 5% as "Comfortable"', () => {
      expect(evaluatePurchaseRiskTier(1.0)).toBe('Comfortable');
      expect(evaluatePurchaseRiskTier(2.5)).toBe('Comfortable');
      expect(evaluatePurchaseRiskTier(4.99)).toBe('Comfortable');
    });

    it('should categorize 5% <= ratio < 10% as "Major Purchase"', () => {
      expect(evaluatePurchaseRiskTier(5.0)).toBe('Major Purchase');
      expect(evaluatePurchaseRiskTier(7.5)).toBe('Major Purchase');
      expect(evaluatePurchaseRiskTier(9.99)).toBe('Major Purchase');
    });

    it('should categorize 10% <= ratio < 20% as "Good Reason to Purchase"', () => {
      expect(evaluatePurchaseRiskTier(10.0)).toBe('Good Reason to Purchase');
      expect(evaluatePurchaseRiskTier(15.0)).toBe('Good Reason to Purchase');
      expect(evaluatePurchaseRiskTier(19.99)).toBe('Good Reason to Purchase');
    });

    it('should categorize 20% <= ratio < 30% as "Call a Family Member"', () => {
      expect(evaluatePurchaseRiskTier(20.0)).toBe('Call a Family Member');
      expect(evaluatePurchaseRiskTier(25.0)).toBe('Call a Family Member');
      expect(evaluatePurchaseRiskTier(29.99)).toBe('Call a Family Member');
    });

    it('should categorize 30% <= ratio <= 50% as "Whatever You Bought Owns You"', () => {
      expect(evaluatePurchaseRiskTier(30.0)).toBe('Whatever You Bought Owns You');
      expect(evaluatePurchaseRiskTier(40.0)).toBe('Whatever You Bought Owns You');
      expect(evaluatePurchaseRiskTier(50.0)).toBe('Whatever You Bought Owns You');
    });

    it('should categorize ratio > 50% as "Call Your Ancestors"', () => {
      expect(evaluatePurchaseRiskTier(50.01)).toBe('Call Your Ancestors');
      expect(evaluatePurchaseRiskTier(75.0)).toBe('Call Your Ancestors');
      expect(evaluatePurchaseRiskTier(150.0)).toBe('Call Your Ancestors');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Purchase Calculator Core Logic & Net Worth Grounding Invariant
  // --------------------------------------------------------------------------
  describe('3. Purchase Calculator Core Logic & Invariants', () => {
    beforeAll(() => {
      // Seed an explicit net worth snapshot of ₦10,000,000
      db.run(`
        INSERT INTO net_worth_snapshots (date, total_assets, total_liabilities, net_worth, created_at)
        VALUES ('2026-09-01', 12000000, 2000000, 10000000, '2026-09-01 10:00:00')
      `);
    });

    it('should ground calculation against the persistent snapshot (₦10,000,000)', async () => {
      // ₦80,000 out of ₦10,000,000 is 0.8% -> Safe
      const res1 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Espresso Machine',
        cost: 80000,
      });

      expect(res1.item).toBe('Espresso Machine');
      expect(res1.cost).toBe(80000);
      expect(res1.net_worth_at_time).toBe(10000000);
      expect(res1.ratio_pct).toBe(0.8);
      expect(res1.tier_result).toBe('Safe');
      expect(res1.calculation_id).toBeGreaterThan(0);

      // ₦300,000 out of ₦10,000,000 is 3.0% -> Comfortable
      const res2 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Noise Cancelling Headphones',
        cost: 300000,
      });
      expect(res2.ratio_pct).toBe(3.0);
      expect(res2.tier_result).toBe('Comfortable');

      // ₦600,000 out of ₦10,000,000 is 6.0% -> Major Purchase
      const res3 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'M3 MacBook Air',
        cost: 600000,
      });
      expect(res3.ratio_pct).toBe(6.0);
      expect(res3.tier_result).toBe('Major Purchase');

      // ₦1,500,000 out of ₦10,000,000 is 15.0% -> Good Reason to Purchase
      const res4 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Used Generator Overhaul',
        cost: 1500000,
      });
      expect(res4.ratio_pct).toBe(15.0);
      expect(res4.tier_result).toBe('Good Reason to Purchase');

      // ₦2,500,000 out of ₦10,000,000 is 25.0% -> Call a Family Member
      const res5 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Euro Trip Vacation',
        cost: 2500000,
      });
      expect(res5.ratio_pct).toBe(25.0);
      expect(res5.tier_result).toBe('Call a Family Member');

      // ₦4,500,000 out of ₦10,000,000 is 45.0% -> Whatever You Bought Owns You
      const res6 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Luxury Automobile Downpayment',
        cost: 4500000,
      });
      expect(res6.ratio_pct).toBe(45.0);
      expect(res6.tier_result).toBe('Whatever You Bought Owns You');

      // ₦6,000,000 out of ₦10,000,000 is 60.0% -> Call Your Ancestors
      const res7 = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Unverified Speculative Land Purchase',
        cost: 6000000,
      });
      expect(res7.ratio_pct).toBe(60.0);
      expect(res7.tier_result).toBe('Call Your Ancestors');
    });

    it('should preserve historical snapshot integrity even if net worth changes later', async () => {
      // Add a newer snapshot of ₦20,000,000
      db.run(`
        INSERT INTO net_worth_snapshots (date, total_assets, total_liabilities, net_worth, created_at)
        VALUES ('2026-09-15', 25000000, 5000000, 20000000, '2026-09-15 12:00:00')
      `);

      // Evaluate new calculation against current ₦20M snapshot
      const res = await calculatePurchaseRisk(mockEnv.DB, {
        item: 'Workstation Setup',
        cost: 1000000,
      });
      expect(res.net_worth_at_time).toBe(20000000);
      expect(res.ratio_pct).toBe(5.0);
      expect(res.tier_result).toBe('Major Purchase');

      // Retrieve previous calculation from history: verify original ₦10M snapshot remains intact
      const history = await getPurchaseCalculations(mockEnv.DB, 10);
      const espresso = history.find((h) => h.item === 'Espresso Machine');
      expect(espresso).toBeDefined();
      expect(espresso?.net_worth_at_time).toBe(10000000);
      expect(espresso?.ratio_pct).toBe(0.8);
      expect(espresso?.tier_result).toBe('Safe');
    });

    it('should reject invalid item names or negative costs', async () => {
      await expect(
        calculatePurchaseRisk(mockEnv.DB, { item: '', cost: 1000 })
      ).rejects.toThrow('Item name is required');

      await expect(
        calculatePurchaseRisk(mockEnv.DB, { item: 'Invalid', cost: -500 })
      ).rejects.toThrow('Valid non-negative purchase cost is required');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Research Digest Engine
  // --------------------------------------------------------------------------
  describe('4. Research Digest Management', () => {
    it('should list digest items ordered newest first', async () => {
      const items = await getDigestItems(mockEnv.DB, 10);
      expect(items.length).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < items.length - 1; i++) {
        expect(new Date(items[i].created_at).getTime()).toBeGreaterThanOrEqual(
          new Date(items[i + 1].created_at).getTime()
        );
      }
    });

    it('should allow marking digest item as read or unread', async () => {
      const items = await getDigestItems(mockEnv.DB, 1);
      const targetId = items[0].id;

      // Mark read
      const updatedRead = await markDigestItemRead(mockEnv.DB, targetId, 1);
      expect(updatedRead?.read_status).toBe(1);

      // Toggle back to unread
      const updatedUnread = await markDigestItemRead(mockEnv.DB, targetId, 0);
      expect(updatedUnread?.read_status).toBe(0);
    });

    it('should allow creating a new curated research digest item', async () => {
      const newItem = await createDigestItem(mockEnv.DB, {
        topic: 'AI Compute & Semiconductor Stocks',
        summary: 'Cloud infrastructure providers drive record demand for dedicated AI hardware.',
        source_url: 'https://example.com/ai-chips',
      });

      expect(newItem.id).toBeGreaterThan(0);
      expect(newItem.topic).toBe('AI Compute & Semiconductor Stocks');
      expect(newItem.read_status).toBe(0);

      const items = await getDigestItems(mockEnv.DB, 5);
      expect(items[0].topic).toBe('AI Compute & Semiconductor Stocks');
    });

    it('should generate updated paper-asset research briefings on demand', async () => {
      const result = await generateResearchBriefings(mockEnv.DB);
      expect(result.added.length).toBeGreaterThan(0);
      expect(result.source).toBe('curated');
      expect(result.added[0].topic).toBeDefined();
      expect(result.added[0].summary).toBeDefined();

      const items = await getDigestItems(mockEnv.DB, 10);
      expect(items.length).toBeGreaterThanOrEqual(4);
    });

    it('POST /api/digest/refresh should return fresh research briefings via HTTP', async () => {
      const res = await app.request('/api/digest/refresh', {
        method: 'POST',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const json = await res.json<any>();
      expect(json.message).toContain('Successfully generated');
      expect(Array.isArray(json.added)).toBe(true);
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(4);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Full Data CSV Exporter (RFC 4180 Compliance)
  // --------------------------------------------------------------------------
  describe('5. Full Data CSV Exporter (RFC 4180)', () => {
    it('should correctly escape cells per RFC 4180 rules', () => {
      // Normal text
      expect(escapeCsvCell('Ordinary text')).toBe('Ordinary text');
      // Numbers
      expect(escapeCsvCell(125000)).toBe('125000');
      // Null / undefined
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
      // Cell with comma
      expect(escapeCsvCell('Apple, Banana, Orange')).toBe('"Apple, Banana, Orange"');
      // Cell with quotes
      expect(escapeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""');
      // Cell with newline
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });

    it('should format a full CSV row with escaping', () => {
      const row = formatCsvRow(['101', 'Office Supplies, Pens', '₦45,000', 'He said "Approved"']);
      expect(row).toBe('101,"Office Supplies, Pens","₦45,000","He said ""Approved"""');
    });

    it('should generate a multi-entity CSV export containing all financial sections', async () => {
      const csv = await generateFullCsvExport(mockEnv.DB);

      expect(csv).toContain('# FINANCIAL STEWARD COMPLETE DATA ARCHIVE');
      expect(csv).toContain('# SECTION: TRANSACTIONS');
      expect(csv).toContain('# SECTION: BUCKET_LEDGER_ENTRIES');
      expect(csv).toContain('# SECTION: INVESTMENTS');
      expect(csv).toContain('# SECTION: BUDGETS');
      expect(csv).toContain('# SECTION: GOALS');
      expect(csv).toContain('# SECTION: LIABILITIES');
      expect(csv).toContain('# SECTION: NET_WORTH_SNAPSHOTS');

      // Verify CRLF line endings per RFC 4180
      expect(csv).toContain('\r\n');
    });
  });

  // --------------------------------------------------------------------------
  // 6. API Route Integration Tests
  // --------------------------------------------------------------------------
  describe('6. API Route Integration Tests', () => {
    it('POST /api/purchase-calculator should evaluate and record purchase risk', async () => {
      const res = await app.request('/api/purchase-calculator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          item: 'Enterprise Cloud Server',
          cost: 400000,
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
      const data = await res.json<any>();
      expect(data.calculation).toBeDefined();
      expect(data.calculation.item).toBe('Enterprise Cloud Server');
      expect(data.calculation.cost).toBe(400000);
      expect(data.calculation.ratio_pct).toBe(2.0); // 400k out of 20M = 2%
      expect(data.calculation.tier_result).toBe('Comfortable');
    });

    it('POST /api/purchase-calculator should return 400 on invalid input', async () => {
      const res = await app.request('/api/purchase-calculator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          item: '',
          cost: 400000,
        }),
      }, mockEnv);

      expect(res.status).toBe(400);
    });

    it('GET /api/purchase-calculator/history should return calculations history', async () => {
      const res = await app.request('/api/purchase-calculator/history', {
        method: 'GET',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.calculations)).toBe(true);
      expect(data.calculations.length).toBeGreaterThan(0);
    });

    it('GET /api/digest should return curated digest items', async () => {
      const res = await app.request('/api/digest', {
        method: 'GET',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThanOrEqual(3);
    });

    it('PATCH /api/digest/:id/read should toggle item read status', async () => {
      const res = await app.request('/api/digest/1/read', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({ read_status: 1 }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(data.item.id).toBe(1);
      expect(data.item.read_status).toBe(1);
    });

    it('GET /api/export should return RFC 4180 CSV attachment stream', async () => {
      const res = await app.request('/api/export?format=csv', {
        method: 'GET',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename=');

      const csvText = await res.text();
      expect(csvText).toContain('# FINANCIAL STEWARD COMPLETE DATA ARCHIVE');
      expect(csvText).toContain('# SECTION: TRANSACTIONS');
    });

    it('GET /api/health should reflect Module 7 status', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(data.status).toBe('ok');
      expect(data.module).toContain('Module 7');
    });
  });
});
