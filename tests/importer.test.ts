import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import app from '../worker/index';
import {
  parseCsvRecords,
  parseWealthVaultCsv,
  normalizeBucketKey,
  processWealthVaultImport,
} from '../worker/lib/importer';
import {
  validateImportReconciliation,
  getBatchReconciliation,
} from '../worker/lib/reconciliation';
import { getBucketBalances } from '../worker/lib/ledger';

describe('Module 8: WealthVault Data Migration Engine & Reconciliation', () => {
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
      const migrationSql = readFileSync(
        join(__dirname, `../worker/migrations/${filename}`),
        'utf-8'
      );
      db.run(migrationSql);
    }

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

  // ----------------------------------------------------
  // 1. RFC 4180 CSV Parsing & Normalization
  // ----------------------------------------------------
  describe('1. RFC 4180 CSV Parsing & Normalization', () => {
    it('should parse simple CSV records and normalize bucket keys', () => {
      expect(normalizeBucketKey('tithe')).toBe('tithe');
      expect(normalizeBucketKey('Kingdom Investment')).toBe('kingdom');
      expect(normalizeBucketKey('kingdom_investment')).toBe('kingdom');
      expect(normalizeBucketKey('savings')).toBe('savings');
      expect(normalizeBucketKey('Investment')).toBe('invest');
      expect(normalizeBucketKey('investments')).toBe('invest');
      expect(normalizeBucketKey('charity')).toBe('charity');
      expect(normalizeBucketKey('Expenses')).toBe('expense');
      expect(normalizeBucketKey('unknown_bucket')).toBeNull();
    });

    it('should parse RFC 4180 CSV with quotes, commas, and escaped quotes', () => {
      const csv = `col1,col2,col3\r\n"hello, world","He said ""Amen""","normal"\r\nval1,val2,val3\n`;
      const records = parseCsvRecords(csv);
      expect(records.length).toBe(3);
      expect(records[1][0]).toBe('hello, world');
      expect(records[1][1]).toBe('He said "Amen"');
      expect(records[1][2]).toBe('normal');
      expect(records[2][0]).toBe('val1');
    });

    it('should parse all 19 columns from WealthVault CSV export', () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const row1 =
        'wv_1,2026-01-10,inflow,,100000,NGN,Salary,"Bonus inflow",,expense,,,10000,20000,14000,14000,7000,35000,0';
      const row2 =
        'wv_2,2026-01-12,outflow,bucket_transfer,15000,NGN,,,Quarterly rebalance,,savings,expense,,,,,,,0';
      const row3 =
        'wv_3,2026-01-15,outflow,bucket_deploy,25000,NGN,Business Expenses,"Equipment lease",Project Alpha,invest,,,,,,,,,0';

      const csvContent = `${header}\n${row1}\n${row2}\n${row3}\n`;
      const parsed = parseWealthVaultCsv(csvContent);

      expect(parsed.length).toBe(3);

      // Verify row 1 (inflow with snapshot)
      expect(parsed[0].external_id).toBe('wv_1');
      expect(parsed[0].date).toBe('2026-01-10');
      expect(parsed[0].direction).toBe('inflow');
      expect(parsed[0].amount).toBe(100000);
      expect(parsed[0].split_tithe).toBe(10000);
      expect(parsed[0].split_kingdom).toBe(20000);
      expect(parsed[0].split_savings).toBe(14000);
      expect(parsed[0].split_invest).toBe(14000);
      expect(parsed[0].split_charity).toBe(7000);
      expect(parsed[0].split_expense).toBe(35000);

      // Verify row 2 (bucket transfer)
      expect(parsed[1].external_id).toBe('wv_2');
      expect(parsed[1].subtype).toBe('bucket_transfer');
      expect(parsed[1].from_bucket).toBe('savings');
      expect(parsed[1].to_bucket).toBe('expense');
      expect(parsed[1].amount).toBe(15000);

      // Verify row 3 (bucket deploy)
      expect(parsed[2].external_id).toBe('wv_3');
      expect(parsed[2].subtype).toBe('bucket_deploy');
      expect(parsed[2].bucket).toBe('invest');
      expect(parsed[2].purpose_label).toBe('Project Alpha');
      expect(parsed[2].amount).toBe(25000);
    });
  });

  // ----------------------------------------------------
  // 2. WealthVault Ingestion & Ledger Reconstruction
  // ----------------------------------------------------
  describe('2. WealthVault Ingestion & Ledger Reconstruction', () => {
    it('should ingest inflows and reconstruct historical allocation_runs and ledger entries', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const inflowRow =
        'wv_inflow_100,2026-01-01,inflow,,500000,NGN,Consulting,"Client retainer",,expense,,,50000,100000,70000,70000,35000,175000,0';

      const csv = `${header}\n${inflowRow}\n`;
      const rows = parseWealthVaultCsv(csv);
      const res = await processWealthVaultImport(mockEnv.DB, 'test_inflow.csv', rows);

      expect(res.status).toBe('completed');
      expect(res.imported_count).toBe(1);
      expect(res.skipped_count).toBe(0);
      expect(res.failed_count).toBe(0);

      // Verify transaction row
      const tx = await mockEnv.DB
        .prepare('SELECT * FROM transactions WHERE external_id = ?')
        .bind('wv_inflow_100')
        .first();
      expect(tx).not.toBeNull();
      expect(tx.amount).toBe(500000);
      expect(tx.direction).toBe('inflow');

      // Verify 6 allocation_runs created
      const { results: allocRuns } = await mockEnv.DB
        .prepare('SELECT * FROM allocation_runs WHERE transaction_id = ?')
        .bind(tx.id)
        .all();
      expect(allocRuns.length).toBe(6);

      // Verify 6 ledger entries created
      const { results: ledgerEntries } = await mockEnv.DB
        .prepare('SELECT * FROM bucket_ledger_entries WHERE transaction_id = ?')
        .bind(tx.id)
        .all();
      expect(ledgerEntries.length).toBe(6);
      expect(ledgerEntries.every((e: any) => e.entry_type === 'allocation_credit')).toBe(true);

      const totalCredited = ledgerEntries.reduce((sum: number, e: any) => sum + e.amount, 0);
      expect(totalCredited).toBe(500000);
    });

    it('should ingest inflows without snapshot splits using active waterfall rule (10/20/20/20/10/50)', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const inflowRow =
        'wv_inflow_no_split,2026-01-02,inflow,,100000,NGN,Dividend,"NGX Dividend",,expense,,,,,,,,,,0';

      const csv = `${header}\n${inflowRow}\n`;
      const rows = parseWealthVaultCsv(csv);
      const res = await processWealthVaultImport(mockEnv.DB, 'test_no_split.csv', rows);

      expect(res.imported_count).toBe(1);

      const tx = await mockEnv.DB
        .prepare('SELECT * FROM transactions WHERE external_id = ?')
        .bind('wv_inflow_no_split')
        .first();

      const { results: ledgerEntries } = await mockEnv.DB
        .prepare('SELECT * FROM bucket_ledger_entries WHERE transaction_id = ?')
        .bind(tx.id)
        .all();

      expect(ledgerEntries.length).toBe(6);
      const totalCredited = ledgerEntries.reduce((sum: number, e: any) => sum + e.amount, 0);
      expect(totalCredited).toBe(100000);
    });

    it('should ingest bucket_transfer subtype and create two-legged linked transfer entries', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const transferRow =
        'wv_transfer_1,2026-01-05,outflow,bucket_transfer,20000,NGN,,,Emergency funding,,savings,expense,,,,,,,0';

      const csv = `${header}\n${transferRow}\n`;
      const rows = parseWealthVaultCsv(csv);
      const res = await processWealthVaultImport(mockEnv.DB, 'test_transfer.csv', rows);

      expect(res.imported_count).toBe(1);

      const tx = await mockEnv.DB
        .prepare('SELECT * FROM transactions WHERE external_id = ?')
        .bind('wv_transfer_1')
        .first();
      expect(tx.subtype).toBe('bucket_transfer');

      // Check linked ledger entries
      const { results: ledgerEntries } = await mockEnv.DB
        .prepare('SELECT * FROM bucket_ledger_entries WHERE transaction_id = ?')
        .bind(tx.id)
        .all();
      expect(ledgerEntries.length).toBe(2);

      const outEntry = ledgerEntries.find((e: any) => e.entry_type === 'transfer_out');
      const inEntry = ledgerEntries.find((e: any) => e.entry_type === 'transfer_in');
      expect(outEntry).toBeDefined();
      expect(inEntry).toBeDefined();
      expect(outEntry.amount).toBe(20000);
      expect(inEntry.amount).toBe(20000);

      // Check bucket_transfers link row
      const transferRecord = await mockEnv.DB
        .prepare('SELECT * FROM bucket_transfers WHERE from_ledger_entry_id = ? AND to_ledger_entry_id = ?')
        .bind(outEntry.id, inEntry.id)
        .first();
      expect(transferRecord).not.toBeNull();
      expect(transferRecord.amount).toBe(20000);
    });

    it('should ingest bucket_deploy subtype and record explicit expense debit against designated bucket', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const deployRow =
        'wv_deploy_1,2026-01-08,outflow,bucket_deploy,30000,NGN,Business Expenses,"Hardware buy",Server Cluster,invest,,,,,,,,,0';

      const csv = `${header}\n${deployRow}\n`;
      const rows = parseWealthVaultCsv(csv);
      const res = await processWealthVaultImport(mockEnv.DB, 'test_deploy.csv', rows);

      expect(res.imported_count).toBe(1);

      const tx = await mockEnv.DB
        .prepare('SELECT * FROM transactions WHERE external_id = ?')
        .bind('wv_deploy_1')
        .first();
      expect(tx.subtype).toBe('bucket_deploy');

      const ledgerEntry = await mockEnv.DB
        .prepare('SELECT * FROM bucket_ledger_entries WHERE transaction_id = ?')
        .bind(tx.id)
        .first();
      expect(ledgerEntry.entry_type).toBe('expense_debit');
      expect(ledgerEntry.amount).toBe(30000);

      // Verify it debited the 'invest' bucket
      const investBucket = await mockEnv.DB
        .prepare("SELECT id FROM allocation_buckets WHERE key = 'invest'")
        .first();
      expect(ledgerEntry.bucket_id).toBe(investBucket.id);
    });

    it('should auto-create missing categories on import', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const row =
        'wv_cat_test,2026-01-09,outflow,,5000,NGN,Cloud Subscriptions,"Hosting bill",,expense,,,,,,,,0';

      const csv = `${header}\n${row}\n`;
      const rows = parseWealthVaultCsv(csv);
      const res = await processWealthVaultImport(mockEnv.DB, 'test_cat.csv', rows);

      expect(res.imported_count).toBe(1);

      const createdCat = await mockEnv.DB
        .prepare('SELECT * FROM categories WHERE name = ?')
        .bind('Cloud Subscriptions')
        .first();
      expect(createdCat).not.toBeNull();
      expect(createdCat.type).toBe('expense');
    });
  });

  // ----------------------------------------------------
  // 3. Idempotent Deduplication Verification
  // ----------------------------------------------------
  describe('3. Idempotent Deduplication Verification', () => {
    it('should safely skip already imported external_ids without double-crediting or balance drift', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const duplicateRow =
        'wv_inflow_100,2026-01-01,inflow,,500000,NGN,Consulting,"Client retainer",,expense,,,,50000,100000,70000,70000,35000,175000,0';

      const csv = `${header}\n${duplicateRow}\n`;
      const rows = parseWealthVaultCsv(csv);

      // Re-run import with already existing external_id 'wv_inflow_100'
      const res = await processWealthVaultImport(mockEnv.DB, 'test_duplicate.csv', rows);

      expect(res.imported_count).toBe(0);
      expect(res.skipped_count).toBe(1);
      expect(res.failed_count).toBe(0);

      // Count matching transactions - must strictly remain 1
      const countTx = await mockEnv.DB
        .prepare('SELECT COUNT(*) as count FROM transactions WHERE external_id = ?')
        .bind('wv_inflow_100')
        .first();
      expect(countTx.count).toBe(1);
    });
  });

  // ----------------------------------------------------
  // 4. Ledger Reconciliation Validator
  // ----------------------------------------------------
  describe('4. Ledger Reconciliation Validator', () => {
    it('should verify zero variance across all 6 buckets for a balanced import dataset', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const rowsCsv = [
        'recon_inflow_1,2026-02-01,inflow,,200000,NGN,Salary,"Monthly Pay",,expense,,,,20000,40000,28000,28000,14000,70000,0',
        'recon_outflow_1,2026-02-02,outflow,,15000,NGN,Food,"Groceries",,expense,,,,,,,,0',
        'recon_deploy_1,2026-02-03,outflow,bucket_deploy,10000,NGN,Education,"Tuition deposit",Course,savings,,,,,,,,,0',
        'recon_transfer_1,2026-02-04,outflow,bucket_transfer,5000,NGN,,,Reserve move,,invest,expense,,,,,,,0',
      ].join('\n');

      const csv = `${header}\n${rowsCsv}\n`;
      const rows = parseWealthVaultCsv(csv);
      const res = await processWealthVaultImport(mockEnv.DB, 'reconcile_test.csv', rows);

      expect(res.imported_count).toBe(4);
      expect(res.reconciliation.reconciled).toBe(true);
      expect(res.reconciliation.total_variance).toBe(0);

      // Verify each individual bucket item in reconciliation report has variance = 0
      for (const bucketItem of res.reconciliation.buckets) {
        expect(bucketItem.variance).toBe(0);
        expect(bucketItem.reconciled).toBe(true);
      }
    });

    it('should retrieve existing batch reconciliation audit report via getBatchReconciliation', async () => {
      const report = await getBatchReconciliation(mockEnv.DB, 1);
      expect(report).not.toBeNull();
      expect(report?.reconciled).toBe(true);
      expect(report?.total_variance).toBe(0);
      expect(report?.buckets.length).toBe(6);
    });
  });

  // ----------------------------------------------------
  // 5. API Endpoint Integration Tests
  // ----------------------------------------------------
  describe('5. API Endpoint Integration Tests', () => {
    it('POST /api/transactions/import should ingest CSV payload via JSON and return 201', async () => {
      const header =
        'external_id,date,direction,subtype,amount,currency,category,note,purpose_label,bucket,from_bucket,to_bucket,split_tithe,split_kingdom,split_savings,split_invest,split_charity,split_expense,is_override';
      const row =
        'api_inflow_1,2026-03-01,inflow,,150000,NGN,Business,"Stipend",,expense,,,,15000,30000,21000,21000,10500,52500,0';
      const csv = `${header}\n${row}\n`;

      const res = await app.request('/api/transactions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          csv_content: csv,
          file_name: 'api_upload.csv',
        }),
      }, mockEnv);

      expect(res.status).toBe(201);
      const data = await res.json<any>();
      expect(data.status).toBe('completed');
      expect(data.imported_count).toBe(1);
      expect(data.reconciliation.reconciled).toBe(true);
      expect(data.reconciliation.total_variance).toBe(0);
    });

    it('POST /api/transactions/import should return 400 when empty CSV content is sent', async () => {
      const res = await app.request('/api/transactions/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
        },
        body: JSON.stringify({
          csv_content: '',
        }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const data = await res.json<any>();
      expect(data.error).toBeDefined();
    });

    it('GET /api/imports should return list of historical import batches', async () => {
      const res = await app.request('/api/imports', {
        method: 'GET',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(Array.isArray(data.batches)).toBe(true);
      expect(data.batches.length).toBeGreaterThan(0);
      expect(data.batches[0].status).toBe('completed');
    });

    it('GET /api/imports/:id should return details for a specific batch', async () => {
      const res = await app.request('/api/imports/1', {
        method: 'GET',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(data.batch.id).toBe(1);
      expect(data.batch.file_name).toBeDefined();
      expect(data.batch.status).toBe('completed');
    });

    it('GET /api/imports/:id/reconcile should return post-import zero-variance reconciliation report', async () => {
      const res = await app.request('/api/imports/1/reconcile', {
        method: 'GET',
        headers: { 'x-dev-bypass': 'true' },
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json<any>();
      expect(data.reconciliation.reconciled).toBe(true);
      expect(data.reconciliation.total_variance).toBe(0);
      expect(data.reconciliation.buckets.length).toBe(6);
    });

    it('should successfully import > 120 rows and reconcile without SQLite variable limit errors', async () => {
      // Generate 130 inflow rows to exceed standard SQLite 100-variable parameter thresholds
      const rows = [];
      for (let i = 1; i <= 130; i++) {
        rows.push({
          external_id: `LARGE_BATCH_TX_${i}`,
          date: '2026-03-01',
          direction: 'inflow' as const,
          subtype: null,
          amount: 1000,
          currency: 'NGN',
          category: 'Salary',
          note: `Batch Item ${i}`,
          purpose_label: null,
          bucket: null,
          from_bucket: null,
          to_bucket: null,
          split_tithe: null,
          split_kingdom: null,
          split_savings: null,
          split_invest: null,
          split_charity: null,
          split_expense: null,
          is_override: false,
        });
      }

      const res = await processWealthVaultImport(mockEnv.DB, 'large_scale_test.csv', rows);
      expect(res.status).toBe('completed');
      expect(res.imported_count).toBe(130);
      expect(res.reconciliation.reconciled).toBe(true);
      expect(res.reconciliation.total_variance).toBe(0);
    });
  });
});
