import type {
  AllocationRule,
  ImportProcessingResult,
  WealthVaultCsvRow,
} from '../types';
import { calculateAllocationSplits, getBucketMap } from './ledger';
import { validateImportReconciliation } from './reconciliation';

/**
 * Normalizes WealthVault bucket names, keys, and Firestore aliases to canonical bucket keys.
 */
export function normalizeBucketKey(
  raw?: string | null
): 'tithe' | 'kingdom' | 'savings' | 'invest' | 'charity' | 'expense' | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'tithe') return 'tithe';
  if (s === 'kingdom' || s === 'kingdominvestment') return 'kingdom';
  if (s === 'savings' || s === 'saving') return 'savings';
  if (s === 'invest' || s === 'investment' || s === 'investments') return 'invest';
  if (s === 'charity') return 'charity';
  if (s === 'expense' || s === 'expenses') return 'expense';
  return null;
}

/**
 * Normalizes any date representation (ISO string, DD/MM/YYYY, MM/DD/YYYY, millisecond epoch, text dates)
 * into a strict, canonical YYYY-MM-DD string.
 * Guarantees accurate chronological sorting (ORDER BY date DESC) and SQLite date function support.
 */
export function normalizeDateToYyyyMmDd(val?: any): string {
  if (!val) return new Date().toISOString().split('T')[0];
  const s = String(val).trim();
  if (!s) return new Date().toISOString().split('T')[0];

  // 1. Millisecond or second epoch timestamp (numeric string: e.g. 1715520720000)
  if (/^\d{10,13}$/.test(s)) {
    const num = Number(s);
    const ms = s.length === 10 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD (with optional time or T)
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const part1 = Number(dmyMatch[1]);
    const part2 = Number(dmyMatch[2]);
    const y = dmyMatch[3];
    let m: string;
    let d: string;

    if (part1 > 12) {
      // First part > 12 -> must be day (DD/MM/YYYY)
      d = String(part1).padStart(2, '0');
      m = String(part2).padStart(2, '0');
    } else if (part2 > 12) {
      // Second part > 12 -> must be day (MM/DD/YYYY)
      m = String(part1).padStart(2, '0');
      d = String(part2).padStart(2, '0');
    } else {
      // Default to DD/MM/YYYY
      d = String(part1).padStart(2, '0');
      m = String(part2).padStart(2, '0');
    }
    return `${y}-${m}-${d}`;
  }

  // 4. Fallback: Native Date.parse for text formats like "Sep 25, 2024"
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Automatically repairs any historical non-canonical dates in transactions and bucket_ledger_entries.
 */
export async function repairHistoricalDates(db: D1Database): Promise<{ repaired: number }> {
  try {
    const { results: invalidTxs } = await db
      .prepare("SELECT id, date FROM transactions WHERE date NOT LIKE '____-__-__'")
      .all<{ id: number; date: string }>();

    let count = 0;
    for (const tx of invalidTxs) {
      const fixed = normalizeDateToYyyyMmDd(tx.date);
      await db.prepare('UPDATE transactions SET date = ? WHERE id = ?').bind(fixed, tx.id).run();
      await db.prepare('UPDATE bucket_ledger_entries SET date = ? WHERE transaction_id = ?').bind(fixed, tx.id).run();
      count++;
    }
    return { repaired: count };
  } catch {
    return { repaired: 0 };
  }
}

/**
 * Parses raw CSV text according to RFC 4180 specification.
 * Handles quoted fields, embedded newlines (\r\n and \n), escaped quotes (""), and commas.
 */
export function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  // Strip UTF-8 Byte Order Mark (BOM) if present
  let input = csv;
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < input.length && input[i + 1] === '"') {
          // Escaped double-quote: "" -> "
          currentField += '"';
          i += 2;
        } else {
          // Closing quote of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        currentRecord.push(currentField);
        currentField = '';
        i++;
      } else if (char === '\r') {
        if (i + 1 < input.length && input[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
        currentRecord.push(currentField);
        currentField = '';
        records.push(currentRecord);
        currentRecord = [];
      } else if (char === '\n') {
        currentRecord.push(currentField);
        currentField = '';
        records.push(currentRecord);
        currentRecord = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Push final field and record if content exists
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField);
    records.push(currentRecord);
  }

  // Filter out any empty trailing records (e.g. trailing newlines at end of file)
  return records.filter(
    (rec) => !(rec.length === 1 && rec[0].trim() === '')
  );
}

/**
 * Parses a 19-column WealthVault RFC 4180 CSV export into structured typed records.
 * Expected columns:
 * external_id, date, direction, subtype, amount, currency, category, note, purpose_label,
 * bucket, from_bucket, to_bucket, split_tithe, split_kingdom, split_savings, split_invest,
 * split_charity, split_expense, is_override
 */
export function parseWealthVaultCsv(csvContent: string): WealthVaultCsvRow[] {
  const records = parseCsvRecords(csvContent);
  if (records.length < 2) {
    return [];
  }

  // Parse header row and map column names (case-insensitive, trimmed) to column indices
  const headerRow = records[0];
  const colMap = new Map<string, number>();
  for (let c = 0; c < headerRow.length; c++) {
    const colName = headerRow[c].trim().toLowerCase().replace(/[\s-]+/g, '_');
    colMap.set(colName, c);
  }

  const getVal = (row: string[], name: string): string => {
    const idx = colMap.get(name);
    if (idx === undefined || idx >= row.length) return '';
    return row[idx].trim();
  };

  const getNum = (row: string[], name: string): number | null => {
    const val = getVal(row, name);
    if (!val) return null;
    const clean = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  };

  const getBool = (row: string[], name: string): boolean => {
    const val = getVal(row, name).toLowerCase();
    return val === '1' || val === 'true' || val === 'yes';
  };

  const rows: WealthVaultCsvRow[] = [];

  for (let r = 1; r < records.length; r++) {
    const record = records[r];
    // Skip empty lines
    if (record.length === 0 || (record.length === 1 && !record[0].trim())) {
      continue;
    }

    const directionRaw = getVal(record, 'direction').toLowerCase();
    const direction: 'inflow' | 'outflow' =
      directionRaw === 'inflow' ? 'inflow' : 'outflow';

    const amountVal = getNum(record, 'amount') ?? 0;

    const row: WealthVaultCsvRow = {
      external_id: getVal(record, 'external_id') || undefined,
      date: getVal(record, 'date'),
      direction,
      subtype: getVal(record, 'subtype') || null,
      amount: Math.abs(amountVal),
      currency: getVal(record, 'currency') || 'NGN',
      category: getVal(record, 'category') || null,
      note: getVal(record, 'note') || null,
      purpose_label: getVal(record, 'purpose_label') || null,
      bucket: getVal(record, 'bucket') || null,
      from_bucket: getVal(record, 'from_bucket') || null,
      to_bucket: getVal(record, 'to_bucket') || null,
      split_tithe: getNum(record, 'split_tithe'),
      split_kingdom: getNum(record, 'split_kingdom'),
      split_savings: getNum(record, 'split_savings'),
      split_invest: getNum(record, 'split_invest'),
      split_charity: getNum(record, 'split_charity'),
      split_expense: getNum(record, 'split_expense'),
      is_override: getBool(record, 'is_override'),
    };

    rows.push(row);
  }

  return rows;
}

/**
 * Ingestion Engine for WealthVault CSV data.
 * - Idempotently deduplicates against transactions.external_id.
 * - Reconstructs allocation_runs and bucket_ledger_entries for inflows.
 * - Reconstructs two-legged bucket_transfers and bucket_deploy outflows.
 * - Tracks import batch history and produces a post-import zero-variance reconciliation audit.
 */
export async function processWealthVaultImport(
  db: D1Database,
  fileName: string,
  rows: WealthVaultCsvRow[]
): Promise<ImportProcessingResult> {
  // 1. Create a pending import batch record
  const batchInsert = await db
    .prepare(
      'INSERT INTO import_batches (file_name, row_count, status, error_log) VALUES (?, ?, ?, ?)'
    )
    .bind(fileName, rows.length, 'pending', null)
    .run();
  const batchId = batchInsert.meta.last_row_id as number;

  // 2. Load bucket mapping and active allocation rule
  const bucketMap = await getBucketMap(db);
  const activeRule = await db
    .prepare(
      'SELECT * FROM allocation_rules WHERE effective_to IS NULL ORDER BY version DESC LIMIT 1'
    )
    .first<AllocationRule>();

  const defaultRule = activeRule || {
    version: 1,
    tithe_pct: 10,
    kingdom_pct: 20,
    savings_pct: 20,
    invest_pct: 20,
    charity_pct: 10,
    expense_pct: 50,
  };

  // 3. Load existing categories into memory map for fast case-insensitive lookup
  const { results: existingCategories } = await db
    .prepare('SELECT id, name, default_bucket_id, bucket_is_flexible FROM categories')
    .all<{
      id: number;
      name: string;
      default_bucket_id: number | null;
      bucket_is_flexible: number;
    }>();

  const categoryMap = new Map<
    string,
    { id: number; name: string; default_bucket_id: number | null; bucket_is_flexible: number }
  >();
  for (const cat of existingCategories) {
    categoryMap.set(cat.name.trim().toLowerCase(), cat);
  }

  // 4. Load all existing external_ids from transactions for idempotent deduplication
  const { results: existingTxExternalIds } = await db
    .prepare('SELECT external_id FROM transactions WHERE external_id IS NOT NULL')
    .all<{ external_id: string }>();

  const seenExternalIds = new Set<string>();
  for (const item of existingTxExternalIds) {
    if (item.external_id) {
      seenExternalIds.add(item.external_id);
    }
  }

  const importedTransactionIds: number[] = [];
  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors: Array<{ row: number; error: string; data?: any }> = [];

  // Helper to resolve or auto-create a category
  const resolveCategoryId = async (catName?: string | null): Promise<number | null> => {
    if (!catName || !catName.trim()) return null;
    const clean = catName.trim();
    const lower = clean.toLowerCase();

    if (categoryMap.has(lower)) {
      return categoryMap.get(lower)!.id;
    }

    // Auto-create missing category with expense bucket default
    const expenseBucketId = bucketMap['expense'];
    const insertCat = await db
      .prepare(
        'INSERT INTO categories (name, default_bucket_id, bucket_is_flexible, type) VALUES (?, ?, 0, ?)'
      )
      .bind(clean, expenseBucketId, 'expense')
      .run();

    const newId = insertCat.meta.last_row_id as number;
    const newCat = {
      id: newId,
      name: clean,
      default_bucket_id: expenseBucketId,
      bucket_is_flexible: 0,
    };
    categoryMap.set(lower, newCat);
    return newId;
  };

  // 5. Ingest each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Row number in CSV file (1-based, accounting for header)

    try {
      // Deduplication check
      if (row.external_id && seenExternalIds.has(row.external_id)) {
        skippedCount++;
        continue;
      }

      // Basic validation
      if (!row.amount || isNaN(row.amount) || row.amount <= 0) {
        errors.push({ row: rowNum, error: `Invalid amount '${row.amount}'`, data: row });
        failedCount++;
        continue;
      }

      const dateStr = normalizeDateToYyyyMmDd(row.date);

      const direction = row.direction === 'inflow' ? 'inflow' : 'outflow';
      const currency = row.currency || 'NGN';
      const categoryId = await resolveCategoryId(row.category);

      // Track external_id to deduplicate within the same import file
      if (row.external_id) {
        seenExternalIds.add(row.external_id);
      }

      if (direction === 'inflow') {
        // --- INFLOW INGESTION ---
        const hasSnapshot =
          row.split_tithe !== null ||
          row.split_kingdom !== null ||
          row.split_savings !== null ||
          row.split_invest !== null ||
          row.split_charity !== null ||
          row.split_expense !== null;

        let splits: {
          tithe: number;
          kingdom: number;
          savings: number;
          invest: number;
          charity: number;
          expense: number;
        };

        let isOverride = row.is_override ? 1 : 0;
        let ruleVersion: number | null = isOverride ? null : defaultRule.version;

        if (hasSnapshot) {
          splits = {
            tithe: Math.abs(Number(row.split_tithe) || 0),
            kingdom: Math.abs(Number(row.split_kingdom) || 0),
            savings: Math.abs(Number(row.split_savings) || 0),
            invest: Math.abs(Number(row.split_invest) || 0),
            charity: Math.abs(Number(row.split_charity) || 0),
            expense: Math.abs(Number(row.split_expense) || 0),
          };
        } else {
          splits = calculateAllocationSplits(row.amount, defaultRule);
        }

        // Insert transaction
        const txInsert = await db
          .prepare(
            `INSERT INTO transactions (
              external_id, date, direction, subtype, amount, currency,
              category_id, note, purpose_label, allocation_rule_version, is_override
            ) VALUES (?, ?, 'inflow', NULL, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            row.external_id || null,
            dateStr,
            row.amount,
            currency,
            categoryId,
            row.note || null,
            row.purpose_label || null,
            ruleVersion,
            isOverride
          )
          .run();

        const txId = txInsert.meta.last_row_id as number;
        importedTransactionIds.push(txId);

        // Reconstruct allocation_runs and bucket_ledger_entries (allocation_credit)
        const bucketKeys: (keyof typeof splits)[] = [
          'tithe',
          'kingdom',
          'savings',
          'invest',
          'charity',
          'expense',
        ];

        for (const bKey of bucketKeys) {
          const bId = bucketMap[bKey];
          const splitAmt = splits[bKey];

          // 1. Allocation run
          await db
            .prepare(
              'INSERT INTO allocation_runs (transaction_id, bucket_id, amount) VALUES (?, ?, ?)'
            )
            .bind(txId, bId, splitAmt)
            .run();

          // 2. Bucket ledger credit
          await db
            .prepare(
              `INSERT INTO bucket_ledger_entries (
                bucket_id, transaction_id, entry_type, amount, date, note
              ) VALUES (?, ?, 'allocation_credit', ?, ?, ?)`
            )
            .bind(
              bId,
              txId,
              splitAmt,
              dateStr,
              row.note ? `${row.note} (${bKey})` : `Historical inflow allocation (${bKey})`
            )
            .run();
        }

        importedCount++;
      } else {
        // --- OUTFLOW INGESTION ---
        const subtype = (row.subtype || '').trim().toLowerCase();

        if (subtype === 'bucket_transfer') {
          // Subtype: bucket_transfer (Linked 2-legged transfer)
          const fromKey = normalizeBucketKey(row.from_bucket || row.bucket) || 'savings';
          const toKey = normalizeBucketKey(row.to_bucket) || 'expense';
          const fromBucketId = bucketMap[fromKey];
          const toBucketId = bucketMap[toKey];

          const txInsert = await db
            .prepare(
              `INSERT INTO transactions (
                external_id, date, direction, subtype, amount, currency,
                category_id, note, purpose_label, is_override
              ) VALUES (?, ?, 'outflow', 'bucket_transfer', ?, ?, ?, ?, ?, 0)`
            )
            .bind(
              row.external_id || null,
              dateStr,
              row.amount,
              currency,
              categoryId,
              row.note || null,
              row.purpose_label || null
            )
            .run();

          const txId = txInsert.meta.last_row_id as number;
          importedTransactionIds.push(txId);

          const reason = row.note || `Transfer from ${fromKey} to ${toKey}`;

          // Leg 1: transfer_out
          const outRes = await db
            .prepare(
              `INSERT INTO bucket_ledger_entries (
                bucket_id, transaction_id, entry_type, amount, date, note
              ) VALUES (?, ?, 'transfer_out', ?, ?, ?)`
            )
            .bind(fromBucketId, txId, row.amount, dateStr, reason)
            .run();
          const outEntryId = outRes.meta.last_row_id as number;

          // Leg 2: transfer_in
          const inRes = await db
            .prepare(
              `INSERT INTO bucket_ledger_entries (
                bucket_id, transaction_id, entry_type, amount, date, note
              ) VALUES (?, ?, 'transfer_in', ?, ?, ?)`
            )
            .bind(toBucketId, txId, row.amount, dateStr, reason)
            .run();
          const inEntryId = inRes.meta.last_row_id as number;

          // Link in bucket_transfers
          await db
            .prepare(
              `INSERT INTO bucket_transfers (
                from_bucket_id, to_bucket_id, amount, date, reason,
                from_ledger_entry_id, to_ledger_entry_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(fromBucketId, toBucketId, row.amount, dateStr, reason, outEntryId, inEntryId)
            .run();

          importedCount++;
        } else if (subtype === 'bucket_deploy') {
          // Subtype: bucket_deploy (Explicit expense debit against designated bucket)
          const targetKey = normalizeBucketKey(row.bucket) || 'expense';
          const targetBucketId = bucketMap[targetKey];

          const txInsert = await db
            .prepare(
              `INSERT INTO transactions (
                external_id, date, direction, subtype, amount, currency,
                category_id, note, purpose_label, is_override
              ) VALUES (?, ?, 'outflow', 'bucket_deploy', ?, ?, ?, ?, ?, 0)`
            )
            .bind(
              row.external_id || null,
              dateStr,
              row.amount,
              currency,
              categoryId,
              row.note || null,
              row.purpose_label || 'Bucket Deployment'
            )
            .run();

          const txId = txInsert.meta.last_row_id as number;
          importedTransactionIds.push(txId);

          // Expense debit against designated bucket
          await db
            .prepare(
              `INSERT INTO bucket_ledger_entries (
                bucket_id, transaction_id, entry_type, amount, date, note
              ) VALUES (?, ?, 'expense_debit', ?, ?, ?)`
            )
            .bind(
              targetBucketId,
              txId,
              row.amount,
              dateStr,
              row.note || `Bucket deploy: ${row.purpose_label || targetKey}`
            )
            .run();

          importedCount++;
        } else {
          // Standard Outflow Expense
          let targetBucketId: number | undefined;

          // Check if bucket column specified
          if (row.bucket) {
            const bKey = normalizeBucketKey(row.bucket);
            if (bKey) targetBucketId = bucketMap[bKey];
          }

          // Otherwise resolve from category
          if (!targetBucketId && categoryId && row.category) {
            const cat = categoryMap.get(row.category.trim().toLowerCase());
            if (cat?.bucket_is_flexible && row.bucket) {
              const bKey = normalizeBucketKey(row.bucket);
              if (bKey) targetBucketId = bucketMap[bKey];
            } else if (cat?.default_bucket_id) {
              targetBucketId = cat.default_bucket_id;
            }
          }

          // Fallback to expense bucket
          if (!targetBucketId) {
            targetBucketId = bucketMap['expense'];
          }

          const txInsert = await db
            .prepare(
              `INSERT INTO transactions (
                external_id, date, direction, subtype, amount, currency,
                category_id, note, purpose_label, is_override
              ) VALUES (?, ?, 'outflow', NULL, ?, ?, ?, ?, ?, 0)`
            )
            .bind(
              row.external_id || null,
              dateStr,
              row.amount,
              currency,
              categoryId,
              row.note || null,
              row.purpose_label || null
            )
            .run();

          const txId = txInsert.meta.last_row_id as number;
          importedTransactionIds.push(txId);

          // Expense debit
          await db
            .prepare(
              `INSERT INTO bucket_ledger_entries (
                bucket_id, transaction_id, entry_type, amount, date, note
              ) VALUES (?, ?, 'expense_debit', ?, ?, ?)`
            )
            .bind(
              targetBucketId,
              txId,
              row.amount,
              dateStr,
              row.note || `Outflow: ${row.category || 'Expense'}`
            )
            .run();

          importedCount++;
        }
      }
    } catch (err: any) {
      errors.push({
        row: rowNum,
        error: err.message || 'Failed to process row',
        data: row,
      });
      failedCount++;
    }
  }

  // 6. Post-import reconciliation audit
  const reconciliation = await validateImportReconciliation(
    db,
    batchId,
    fileName,
    importedTransactionIds
  );

  // 7. Update batch record status and execution log
  const status: 'completed' | 'failed' = failedCount > 0 && importedCount === 0 ? 'failed' : 'completed';
  const errorLogPayload = JSON.stringify({
    total_rows: rows.length,
    imported_count: importedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    errors,
    reconciliation,
  });

  await db
    .prepare(
      'UPDATE import_batches SET row_count = ?, status = ?, error_log = ? WHERE id = ?'
    )
    .bind(rows.length, status, errorLogPayload, batchId)
    .run();

  return {
    batch_id: batchId,
    file_name: fileName,
    total_rows: rows.length,
    imported_count: importedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    status,
    reconciliation,
    errors,
  };
}
