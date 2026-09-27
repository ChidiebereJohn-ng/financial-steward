import { Hono } from 'hono';
import type { Env } from '../types';
import { parseWealthVaultCsv, processWealthVaultImport } from '../lib/importer';
import { getBatchReconciliation } from '../lib/reconciliation';

const importsApp = new Hono<{ Bindings: Env }>();

/**
 * Helper to extract CSV content and file name from various request content types
 * (multipart/form-data, application/json, or text/csv).
 */
export async function extractCsvFromRequest(c: any): Promise<{ csvContent: string; fileName: string }> {
  const contentType = c.req.header('content-type') || '';
  const queryFileName = c.req.query('file_name');
  let fileName = queryFileName || 'wealthvault_import.csv';
  let csvContent = '';

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const file = body['file'] || body['csv'];
    if (file && typeof file === 'object' && typeof (file as any).text === 'function') {
      fileName = (file as any).name || fileName;
      csvContent = await (file as any).text();
    } else if (typeof file === 'string') {
      csvContent = file;
    }
  } else if (contentType.includes('application/json')) {
    const json = await c.req.json<{ csv_content?: string; csv?: string; file_name?: string }>();
    csvContent = json.csv_content || json.csv || '';
    if (json.file_name) {
      fileName = json.file_name;
    }
  } else {
    // Raw text/csv body
    csvContent = await c.req.text();
  }

  return { csvContent, fileName };
}

/**
 * POST /api/transactions/import & POST /api/imports
 * Ingests a WealthVault 19-column CSV export file.
 * Idempotently deduplicates, reconstructs allocation runs, and validates zero variance reconciliation.
 */
importsApp.post('/', async (c) => {
  try {
    const { csvContent, fileName } = await extractCsvFromRequest(c);

    if (!csvContent || csvContent.trim().length === 0) {
      return c.json({ error: 'No CSV content provided' }, 400);
    }

    const rows = parseWealthVaultCsv(csvContent);
    if (rows.length === 0) {
      return c.json({ error: 'No valid data rows found in the provided CSV file' }, 400);
    }

    const result = await processWealthVaultImport(c.env.DB, fileName, rows);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to process CSV import' }, 400);
  }
});

/**
 * GET /api/imports
 * Lists all historical import batches, newest first.
 */
importsApp.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);

  const { results } = await c.env.DB
    .prepare(
      `SELECT id, file_name, row_count, status, error_log, imported_at
       FROM import_batches
       ORDER BY imported_at DESC, id DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  const formatted = results.map((r: any) => {
    let parsedLog = null;
    if (r.error_log) {
      try {
        parsedLog = JSON.parse(r.error_log);
      } catch {
        parsedLog = r.error_log;
      }
    }
    return {
      id: r.id,
      file_name: r.file_name,
      row_count: r.row_count,
      status: r.status,
      imported_at: r.imported_at,
      details: parsedLog,
    };
  });

  return c.json({ batches: formatted });
});

/**
 * GET /api/imports/:id
 * Retrieves details, status, and error logs for a specific import batch.
 */
importsApp.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: 'Invalid import batch ID' }, 400);
  }

  const batch = await c.env.DB
    .prepare('SELECT id, file_name, row_count, status, error_log, imported_at FROM import_batches WHERE id = ?')
    .bind(id)
    .first<any>();

  if (!batch) {
    return c.json({ error: 'Import batch not found' }, 404);
  }

  let details = null;
  if (batch.error_log) {
    try {
      details = JSON.parse(batch.error_log);
    } catch {
      details = batch.error_log;
    }
  }

  return c.json({
    batch: {
      id: batch.id,
      file_name: batch.file_name,
      row_count: batch.row_count,
      status: batch.status,
      imported_at: batch.imported_at,
      details,
    },
  });
});

/**
 * GET /api/imports/:id/reconcile
 * Computes variance between import totals and live ledger state.
 */
importsApp.get('/:id/reconcile', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: 'Invalid import batch ID' }, 400);
  }

  const report = await getBatchReconciliation(c.env.DB, id);
  if (!report) {
    return c.json({ error: 'Import batch not found' }, 404);
  }

  return c.json({ reconciliation: report });
});

export default importsApp;
