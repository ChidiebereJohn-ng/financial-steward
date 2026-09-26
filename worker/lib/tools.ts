import type {
  PurchaseTier,
  PurchaseCalculation,
  PurchaseRiskResult,
  DigestItem,
} from '../types';
import { computeNetWorth } from './analytics';

/**
 * Section 5 APP_LOGIC.md: Purchase Risk Tier Evaluator
 * Evaluates purchase cost ratio against net worth:
 *   ratio < 1%   -> "Safe"
 *   ratio < 5%   -> "Comfortable"
 *   ratio < 10%  -> "Major Purchase"
 *   ratio < 20%  -> "Good Reason to Purchase"
 *   ratio < 30%  -> "Call a Family Member"
 *   ratio <= 50% -> "Whatever You Bought Owns You"
 *   ratio > 50%  -> "Call Your Ancestors"
 */
export function evaluatePurchaseRiskTier(ratioPct: number): PurchaseTier {
  if (ratioPct < 1) {
    return 'Safe';
  }
  if (ratioPct < 5) {
    return 'Comfortable';
  }
  if (ratioPct < 10) {
    return 'Major Purchase';
  }
  if (ratioPct < 20) {
    return 'Good Reason to Purchase';
  }
  if (ratioPct < 30) {
    return 'Call a Family Member';
  }
  if (ratioPct <= 50) {
    return 'Whatever You Bought Owns You';
  }
  return 'Call Your Ancestors';
}

/**
 * Section 5 APP_LOGIC.md: Calculate purchase risk ratio and persist calculation.
 * INVARIANT: Net worth is always the last persistent snapshot, never a live
 * recompute mid-calculation, so the result is reproducible and auditable later.
 */
export async function calculatePurchaseRisk(
  db: D1Database,
  input: {
    item: string;
    cost: number;
    date?: string;
  }
): Promise<PurchaseRiskResult & { calculation_id: number }> {
  const { item, cost } = input;
  const date = input.date || new Date().toISOString().split('T')[0];

  if (!item || item.trim() === '') {
    throw new Error('Item name is required for purchase calculation');
  }
  if (typeof cost !== 'number' || isNaN(cost) || cost < 0) {
    throw new Error('Valid non-negative purchase cost is required');
  }

  // Fetch the latest snapshot
  let latestSnapshot = await db
    .prepare('SELECT * FROM net_worth_snapshots ORDER BY date DESC, created_at DESC LIMIT 1')
    .first<{ id: number; net_worth: number; date: string }>();

  // If no snapshot exists yet, initialize a baseline snapshot
  if (!latestSnapshot) {
    const computed = await computeNetWorth(db, date);
    latestSnapshot = await db
      .prepare('SELECT * FROM net_worth_snapshots ORDER BY date DESC, created_at DESC LIMIT 1')
      .first<{ id: number; net_worth: number; date: string }>();

    if (!latestSnapshot) {
      latestSnapshot = { id: 0, net_worth: computed.net_worth, date };
    }
  }

  const netWorthAtTime = latestSnapshot.net_worth;
  let ratioPct = 0;

  if (cost === 0) {
    ratioPct = 0;
  } else if (netWorthAtTime <= 0) {
    // If net worth is zero or underwater (negative), any positive purchase cost is 100% or above
    ratioPct = 100;
  } else {
    ratioPct = (cost / netWorthAtTime) * 100;
  }

  // Round ratio to 2 decimal places for clean storage & display
  const roundedRatio = Number(ratioPct.toFixed(2));
  const tierResult = evaluatePurchaseRiskTier(roundedRatio);

  const insertResult = await db
    .prepare(`
      INSERT INTO purchase_calculations (item, cost, net_worth_at_time, ratio_pct, tier_result, date)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(item.trim(), cost, netWorthAtTime, roundedRatio, tierResult, date)
    .run();

  const calculationId = insertResult.meta.last_row_id as number;

  return {
    calculation_id: calculationId,
    item: item.trim(),
    cost,
    net_worth_at_time: netWorthAtTime,
    ratio_pct: roundedRatio,
    tier_result: tierResult,
    date,
  };
}

/**
 * Retrieve purchase calculation history, ordered newest first.
 */
export async function getPurchaseCalculations(
  db: D1Database,
  limit = 50
): Promise<PurchaseCalculation[]> {
  const result = await db
    .prepare(`
      SELECT id, item, cost, net_worth_at_time, ratio_pct, tier_result, date, created_at
      FROM purchase_calculations
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<PurchaseCalculation>();

  return result.results || [];
}

/**
 * Retrieve research digest items, ordered newest first.
 */
export async function getDigestItems(
  db: D1Database,
  limit = 50
): Promise<DigestItem[]> {
  const result = await db
    .prepare(`
      SELECT id, topic, summary, source_url, read_status, created_at
      FROM digest_items
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<DigestItem>();

  return result.results || [];
}

/**
 * Update read status of a research digest item.
 */
export async function markDigestItemRead(
  db: D1Database,
  id: number,
  readStatus: number = 1
): Promise<DigestItem | null> {
  await db
    .prepare('UPDATE digest_items SET read_status = ? WHERE id = ?')
    .bind(readStatus ? 1 : 0, id)
    .run();

  const updated = await db
    .prepare('SELECT id, topic, summary, source_url, read_status, created_at FROM digest_items WHERE id = ?')
    .bind(id)
    .first<DigestItem>();

  return updated || null;
}

/**
 * Create a new curated research digest item (used by scheduled cron or manual entry).
 */
export async function createDigestItem(
  db: D1Database,
  input: {
    topic: string;
    summary: string;
    source_url?: string | null;
    read_status?: number;
  }
): Promise<DigestItem> {
  const { topic, summary, source_url = null, read_status = 0 } = input;
  if (!topic || topic.trim() === '') {
    throw new Error('Topic is required for digest item');
  }
  if (!summary || summary.trim() === '') {
    throw new Error('Summary is required for digest item');
  }

  const result = await db
    .prepare(`
      INSERT INTO digest_items (topic, summary, source_url, read_status)
      VALUES (?, ?, ?, ?)
    `)
    .bind(topic.trim(), summary.trim(), source_url ? source_url.trim() : null, read_status ? 1 : 0)
    .run();

  const id = result.meta.last_row_id as number;
  const created = await db
    .prepare('SELECT id, topic, summary, source_url, read_status, created_at FROM digest_items WHERE id = ?')
    .bind(id)
    .first<DigestItem>();

  return created!;
}
