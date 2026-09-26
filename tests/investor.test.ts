import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';
import {
  calculateGainLoss,
  createInvestment,
  createStrategy,
  deleteInvestment,
  getInvestmentById,
  getInvestments,
  getLivePrices,
  getPriceHistory,
  getStrategies,
  recordPriceUpdate,
  simulateStages,
  simulateStrategy,
  updateInvestment,
} from '../worker/lib/investor';
import { computeNetWorth } from '../worker/lib/analytics';

describe('Module 6: Investor Module (Holdings, NGX Manual Journal, Live Crypto Proxy, & Staged Compounding Simulator)', () => {
  let db: Database;
  let mockEnv: any;
  const kvStore = new Map<string, string>();

  beforeAll(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Run migrations 0001 through 0006
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

    // Mock KV namespace for CACHE
    const mockKV = {
      get: async (key: string, type?: string) => {
        const val = kvStore.get(key);
        if (!val) return null;
        if (type === 'json') return JSON.parse(val);
        return val;
      },
      put: async (key: string, val: string, _opts?: any) => {
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
            const lastId = db.exec('SELECT last_insert_rowid() as id');
            return {
              success: true,
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
      },
    };
  });

  describe('1. Schema & Seeding Verification (Migration 0006)', () => {
    it('should verify investments table exists with correct schema', () => {
      const res = db.exec("PRAGMA table_info('investments')");
      const columns = res[0].values.map((col) => col[1]);
      expect(columns).toContain('id');
      expect(columns).toContain('type');
      expect(columns).toContain('symbol_or_name');
      expect(columns).toContain('market');
      expect(columns).toContain('quantity');
      expect(columns).toContain('cost_basis');
      expect(columns).toContain('currency');
      expect(columns).toContain('current_value');
      expect(columns).toContain('strategy_id');
      expect(columns).toContain('account_id');
    });

    it('should verify investment_price_updates table exists with source column', () => {
      const res = db.exec("PRAGMA table_info('investment_price_updates')");
      const columns = res[0].values.map((col) => col[1]);
      expect(columns).toContain('id');
      expect(columns).toContain('investment_id');
      expect(columns).toContain('date');
      expect(columns).toContain('price');
      expect(columns).toContain('source');
    });

    it('should verify strategies and strategy_stages tables exist and have seeded data', async () => {
      const strategies = await getStrategies(mockEnv.DB);
      expect(strategies.length).toBeGreaterThanOrEqual(2);
      expect(strategies[0].name).toBe('Conservative Capital Preservation');
      expect(strategies[0].stages.length).toBe(2);
      expect(strategies[1].name).toBe('Balanced Wealth Accumulator');
      expect(strategies[1].stages.length).toBe(3);
    });
  });

  describe('2. Core Portfolio Valuation & Gain/Loss Logic', () => {
    it('should calculate gain/loss and percentage correctly', () => {
      // Gain case
      const res1 = calculateGainLoss(1300, 1000);
      expect(res1.unrealized_gain_loss).toBe(300);
      expect(res1.unrealized_gain_loss_pct).toBe(30.0);

      // Loss case
      const res2 = calculateGainLoss(800, 1000);
      expect(res2.unrealized_gain_loss).toBe(-200);
      expect(res2.unrealized_gain_loss_pct).toBe(-20.0);

      // Cost basis zero edge case
      const res3 = calculateGainLoss(500, 0);
      expect(res3.unrealized_gain_loss).toBe(500);
      expect(res3.unrealized_gain_loss_pct).toBe(0);

      // Null current value
      const res4 = calculateGainLoss(null, 1000);
      expect(res4.unrealized_gain_loss).toBe(0);
      expect(res4.unrealized_gain_loss_pct).toBe(0);
    });

    it('should create an NGX equity holding and compute gain/loss', async () => {
      const holding = await createInvestment(mockEnv.DB, {
        type: 'equity',
        symbol_or_name: 'DANGCEM',
        market: 'NGX',
        quantity: 1000,
        cost_basis: 500000,
        currency: 'NGN',
        current_value: 650000,
      });

      expect(holding.id).toBeDefined();
      expect(holding.symbol_or_name).toBe('DANGCEM');
      expect(holding.market).toBe('NGX');
      expect(holding.unrealized_gain_loss).toBe(150000);
      expect(holding.unrealized_gain_loss_pct).toBe(30.0);
    });

    it('should create a crypto holding in USD and convert to NGN in portfolio summary', async () => {
      const cryptoHolding = await createInvestment(mockEnv.DB, {
        type: 'crypto',
        symbol_or_name: 'BTC',
        market: 'crypto',
        quantity: 0.1,
        cost_basis: 6000, // 6,000 USD
        currency: 'USD',
        current_value: 6850, // 6,850 USD
      });

      expect(cryptoHolding.symbol_or_name).toBe('BTC');
      expect(cryptoHolding.currency).toBe('USD');
      expect(cryptoHolding.unrealized_gain_loss).toBe(850);
      expect(cryptoHolding.unrealized_gain_loss_pct).toBe(14.17);

      // Verify portfolio summary includes both holdings converted to NGN
      const { investments, summary } = await getInvestments(mockEnv.DB);
      expect(investments.length).toBeGreaterThanOrEqual(2);
      expect(summary.total_portfolio_value_ngn).toBeGreaterThan(0);
      expect(summary.markets.ngx.count).toBe(1);
      expect(summary.markets.crypto.count).toBe(1);
    });

    it('should filter investments by market', async () => {
      const ngxOnly = await getInvestments(mockEnv.DB, { market: 'NGX' });
      expect(ngxOnly.investments.every((i) => i.market.toUpperCase() === 'NGX')).toBe(true);

      const cryptoOnly = await getInvestments(mockEnv.DB, { market: 'crypto' });
      expect(cryptoOnly.investments.every((i) => i.market.toLowerCase() === 'crypto')).toBe(true);
    });

    it('should update holding details and preserve gain/loss math', async () => {
      const ngxHolding = (await getInvestments(mockEnv.DB, { market: 'NGX' })).investments[0];
      const updated = await updateInvestment(mockEnv.DB, ngxHolding.id, {
        cost_basis: 600000,
      });

      expect(updated.cost_basis).toBe(600000);
      // current_value was 650000, new gain = 50000, pct = 8.33%
      expect(updated.unrealized_gain_loss).toBe(50000);
      expect(updated.unrealized_gain_loss_pct).toBe(8.33);
    });
  });

  describe('3. Manual NGX Price Update Journal Engine', () => {
    it('should log a manual price update and recalculate holding current value', async () => {
      const ngxHolding = (await getInvestments(mockEnv.DB, { market: 'NGX' })).investments[0];
      const newPricePerShare = 720; // 1,000 shares * 720 = 720,000 NGN

      const { investment, price_update } = await recordPriceUpdate(
        mockEnv.DB,
        ngxHolding.id,
        newPricePerShare,
        '2026-09-26',
        'manual'
      );

      expect(price_update.price).toBe(720);
      expect(price_update.source).toBe('manual');
      expect(price_update.investment_id).toBe(ngxHolding.id);

      // Verify holding's current_value was updated to 720,000
      expect(investment.current_value).toBe(720000);
      // Cost basis was 600,000, so new gain = 120,000 (+20%)
      expect(investment.unrealized_gain_loss).toBe(120000);
      expect(investment.unrealized_gain_loss_pct).toBe(20.0);
    });

    it('should retrieve historical price updates for a holding', async () => {
      const ngxHolding = (await getInvestments(mockEnv.DB, { market: 'NGX' })).investments[0];
      // Add second update
      await recordPriceUpdate(mockEnv.DB, ngxHolding.id, 750, '2026-09-27', 'manual');

      const history = await getPriceHistory(mockEnv.DB, ngxHolding.id);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].price).toBe(750);
      expect(history[0].source).toBe('manual');
    });
  });

  describe('4. Staged Compounding Simulation Engine (Section 7, APP_LOGIC.md)', () => {
    it('should calculate staged compounding capital curve according to mathematical formula', () => {
      const stages = [
        { stage_order: 1, asset_type: 'Money Market Fund', duration_months: 6, expected_return_pct: 14.5 },
        { stage_order: 2, asset_type: 'FGN Treasury Bill', duration_months: 12, expected_return_pct: 18.0 },
      ];

      const startingCapital = 1000000; // 1,000,000 NGN
      const sim = simulateStages(stages, startingCapital, { name: 'Preservation Test' });

      // Stage 1: 1,000,000 * 1.145 = 1,145,000 (gain: 145,000)
      expect(sim.timeline[0].starting_capital).toBe(1000000);
      expect(sim.timeline[0].gain_amount).toBe(145000);
      expect(sim.timeline[0].ending_capital).toBe(1145000);
      expect(sim.timeline[0].cumulative_months).toBe(6);

      // Stage 2: 1,145,000 * 1.18 = 1,351,100 (gain: 206,100)
      expect(sim.timeline[1].starting_capital).toBe(1145000);
      expect(sim.timeline[1].gain_amount).toBe(206100);
      expect(sim.timeline[1].ending_capital).toBe(1351100);
      expect(sim.timeline[1].cumulative_months).toBe(18);

      expect(sim.final_capital).toBe(1351100);
      expect(sim.total_gain).toBe(351100);
      expect(sim.total_return_pct).toBe(35.11);
      expect(sim.total_duration_months).toBe(18);

      // Explicit disclaimer requirement
      expect(sim.disclaimer).toBe('Projection, not a live position');
    });

    it('should run simulation using stored strategy ID from database', async () => {
      const result = await simulateStrategy(mockEnv.DB, 1, 500000);
      expect(result.strategy_id).toBe(1);
      expect(result.strategy_name).toBe('Conservative Capital Preservation');
      expect(result.starting_capital).toBe(500000);
      expect(result.timeline.length).toBe(2);
      expect(result.final_capital).toBeGreaterThan(500000);
      expect(result.disclaimer).toBe('Projection, not a live position');
    });

    it('should create a custom strategy and simulate it', async () => {
      const custom = await createStrategy(mockEnv.DB, {
        name: 'Aggressive Tech & Crypto Compounder',
        description: 'Multi-stage rotation from crypto staking to tech equities.',
        stages: [
          { stage_order: 1, asset_type: 'Crypto Yield', duration_months: 6, expected_return_pct: 25.0 },
          { stage_order: 2, asset_type: 'Global Tech Index', duration_months: 12, expected_return_pct: 20.0 },
        ],
      });

      expect(custom.id).toBeDefined();
      expect(custom.stages.length).toBe(2);

      const sim = await simulateStrategy(mockEnv.DB, custom.id, 100000);
      // 100,000 * 1.25 = 125,000; 125,000 * 1.20 = 150,000
      expect(sim.final_capital).toBe(150000);
      expect(sim.total_gain).toBe(50000);
      expect(sim.total_return_pct).toBe(50.0);
    });
  });

  describe('5. Live Price Proxy with KV Caching (15-min TTL)', () => {
    it('should fetch live prices, write to KV cache, and serve cached on subsequent calls', async () => {
      // First call: cache miss, cached should be false
      const prices1 = await getLivePrices(mockEnv, ['BTC', 'ETH']);
      expect(prices1.BTC).toBeDefined();
      expect(prices1.BTC.price_usd).toBe(68500);
      expect(prices1.BTC.cached).toBe(false);

      // Verify KV received the entry
      const kvVal = await mockEnv.CACHE.get('live_price_BTC', 'json');
      expect(kvVal).not.toBeNull();
      expect(kvVal.price_usd).toBe(68500);

      // Second call: should be served from KV cache with cached = true
      const prices2 = await getLivePrices(mockEnv, ['BTC']);
      expect(prices2.BTC.cached).toBe(true);
      expect(prices2.BTC.price_usd).toBe(68500);
    });
  });

  describe('6. Net Worth Engine Integration (computeNetWorth)', () => {
    it('should aggregate live investment valuations converted to NGN into total_assets', async () => {
      const snapshot = await computeNetWorth(mockEnv.DB, '2026-09-26');
      expect(snapshot.total_assets).toBeGreaterThan(0);
      expect(snapshot.net_worth).toBeGreaterThan(0);
      expect(snapshot.base_currency).toBe('NGN');
    });
  });

  describe('7. API Route Endpoints Testing via Hono app.request', () => {
    const headers = {
      'Content-Type': 'application/json',
      'x-dev-bypass': 'true',
    };

    it('GET /api/investments should return holdings and summary', async () => {
      const res = await app.request('/api/investments', { headers }, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.investments).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.summary.total_portfolio_value_ngn).toBeGreaterThan(0);
    });

    it('POST /api/investments should add a new holding', async () => {
      const payload = {
        type: 'equity',
        symbol_or_name: 'GTCO',
        market: 'NGX',
        quantity: 2000,
        cost_basis: 80000,
        current_value: 95000,
        currency: 'NGN',
      };

      const res = await app.request('/api/investments', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }, mockEnv);

      expect(res.status).toBe(201);
      const created = await res.json() as any;
      expect(created.symbol_or_name).toBe('GTCO');
      expect(created.unrealized_gain_loss).toBe(15000);
    });

    it('POST /api/investments/:id/price-update should record price update', async () => {
      const listRes = await app.request('/api/investments?market=NGX', { headers }, mockEnv);
      const { investments } = await listRes.json() as any;
      const gtco = investments.find((i: any) => i.symbol_or_name === 'GTCO');

      const res = await app.request(`/api/investments/${gtco.id}/price-update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ price: 50.0, date: '2026-09-26', source: 'manual' }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      // 2,000 quantity * 50 = 100,000 current value
      expect(data.investment.current_value).toBe(100000);
      expect(data.price_update.source).toBe('manual');
    });

    it('GET /api/investments/live-prices should return proxy prices', async () => {
      const res = await app.request('/api/investments/live-prices?symbols=BTC,ETH,AAPL', { headers }, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.prices.BTC).toBeDefined();
      expect(data.prices.ETH).toBeDefined();
      expect(data.prices.AAPL).toBeDefined();
    });

    it('GET /api/strategies should return strategy templates with stages', async () => {
      const res = await app.request('/api/strategies', { headers }, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.strategies.length).toBeGreaterThanOrEqual(2);
      expect(data.strategies[0].stages).toBeDefined();
    });

    it('POST /api/strategies/:id/simulate should run compounding simulation', async () => {
      const res = await app.request('/api/strategies/1/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ starting_capital: 1000000 }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.starting_capital).toBe(1000000);
      expect(data.final_capital).toBe(1351100);
      expect(data.disclaimer).toBe('Projection, not a live position');
    });

    it('DELETE /api/investments/:id should delete holding and cascading price updates', async () => {
      const listRes = await app.request('/api/investments', { headers }, mockEnv);
      const { investments } = await listRes.json() as any;
      const target = investments[investments.length - 1];

      const delRes = await app.request(`/api/investments/${target.id}`, {
        method: 'DELETE',
        headers,
      }, mockEnv);

      expect(delRes.status).toBe(200);

      // Verify not found
      const getRes = await app.request(`/api/investments/${target.id}`, { headers }, mockEnv);
      expect(getRes.status).toBe(404);
    });
  });
});
