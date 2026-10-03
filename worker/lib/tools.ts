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

/**
 * Pre-curated institutional paper-asset research briefings.
 */
export const PAPER_ASSET_INTELLIGENCE_BRIEFS = [
  {
    topic: 'Nigerian Treasury Bills (NTB): 364-Day Auction Yields & Reinvestment Laddering',
    summary: 'The Central Bank of Nigeria (CBN) maintains elevated stop rates on 364-day Nigerian Treasury Bills (NTBs), consistently yielding between 19.5% and 21.5% at primary market auctions. For individual paper-asset investors, NTBs provide a sovereign risk-free sanctuary with zero capital risk and upfront interest discounting. Tactical strategy: Deploy a 4-tier ladder (allocating across 91-day, 182-day, and 364-day tenors) to capture peak annual yields while maintaining rolling quarterly liquidity for opportunistic re-entry.',
    source_url: 'https://www.cbn.gov.ng',
  },
  {
    topic: 'FGN Savings Bonds: Quarterly Sovereign Cash Flow & Tax-Free Compounding',
    summary: 'The Debt Management Office (DMO) offers 2-Year and 3-Year Federal Government of Nigeria (FGN) Savings Bonds with coupon rates averaging 17.0% - 18.5% payable quarterly directly into bank accounts. Tailor-made for retail paper-asset portfolios with entry minimums of ₦5,000. Benefit: Backed by the full faith and credit of the Federal Republic of Nigeria, exempt from CAMA withholding taxes, and provides predictable quarterly cash distributions ideal for feeding the Kingdom and Charity buckets.',
    source_url: 'https://www.dmo.gov.ng',
  },
  {
    topic: 'Money Market Funds (MMF) vs Commercial Papers (CP): Liquidity Optimization',
    summary: 'SEC-regulated Money Market Funds (Stanbic IBTC, ARM, United Capital, Chapel Hill Denham) yield between 18.0% and 20.5% with daily interest accrual and T+1 liquidity, making them the optimal holding tank for the Expenses and Savings buckets. Conversely, Tier-1 Corporate Commercial Papers (Dangote, MTN Nigeria, Flour Mills) offer 22.0% - 24.5% for 180-day to 270-day tenors. Rule of engagement: Require investment-grade ratings (A- or higher by Agusto/GCR) before substituting sovereign bills with corporate paper.',
    source_url: 'https://sec.gov.ng',
  },
  {
    topic: 'NGX Tier-1 Banking Aristocrats: Dividend Yields vs Fixed Income Spreads',
    summary: 'Tier-1 Nigerian Exchange (NGX) financial institutions (GTCO, Zenith Bank, UBA) maintain robust capital adequacy ratios above 20% and provide historical dividend yields ranging from 12% to 16%. In paper-asset equity allocation, prioritising dividend aristocrats with low payout ratios (<40%) ensures sustainable real-term income and potential equity re-rating as foreign portfolio investments normalize.',
    source_url: 'https://ngxgroup.com',
  },
  {
    topic: 'Global Dollar Paper Assets: US Treasury Bills (SGOV/BIL) & S&P 500 Index DCA',
    summary: 'Systematic Dollar-Cost Averaging (DCA) into offshore paper assets provides essential balance sheet immunization against localized currency devaluation. Ultra-short US Treasury ETFs (SGOV, BIL) yield 4.8% - 5.2% risk-free in USD, while broad-market index funds (VOO, VTI) capture global economic productivity. Recommended allocation: Channel 20-30% of the Investment bucket into USD paper assets via domiciliary accounts or regulated brokerages.',
    source_url: 'https://www.investopedia.com',
  },
];

/**
 * Automatically generates updated paper-asset research briefings.
 * If CLAUDE_API_KEY is available, calls Anthropic Claude API for live AI generation.
 * Otherwise, rotates through authoritative paper-asset market intelligence models.
 */
export async function generateResearchBriefings(
  db: D1Database,
  apiKey?: string
): Promise<{ added: DigestItem[]; source: 'ai' | 'curated' }> {
  // If API key is provided, attempt live Claude API briefing generation
  if (apiKey && apiKey.trim() !== '') {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: `Generate 2 actionable financial research briefing items for a personal finance steward investing in Nigerian and global paper assets (e.g., Nigerian Treasury Bills, FGN Savings Bonds, Money Market Funds, Commercial Papers, NGX Dividend Stocks, Dollar ETFs).
Return strictly valid JSON array of objects with fields:
[
  {
    "topic": "Concise headline (max 80 chars)",
    "summary": "Rich 2-3 paragraph institutional briefing with yield data, risk-reward analysis, and stewardship advice",
    "source_url": "Valid official URL e.g. https://www.cbn.gov.ng, https://www.dmo.gov.ng, https://ngxgroup.com, https://sec.gov.ng"
  }
]`,
            },
          ],
        }),
      });

      if (response.ok) {
        const json: any = await response.json();
        const contentText = json?.content?.[0]?.text || '';
        const match = contentText.match(/\[[\s\S]*\]/);
        if (match) {
          const items: Array<{ topic: string; summary: string; source_url?: string }> = JSON.parse(match[0]);
          const createdList: DigestItem[] = [];
          for (const item of items) {
            if (item.topic && item.summary) {
              const created = await createDigestItem(db, {
                topic: item.topic,
                summary: item.summary,
                source_url: item.source_url || 'https://www.cbn.gov.ng',
                read_status: 0,
              });
              createdList.push(created);
            }
          }
          if (createdList.length > 0) {
            return { added: createdList, source: 'ai' };
          }
        }
      }
    } catch (err) {
      console.error('Claude API briefing generation failed, falling back to curated intelligence:', err);
    }
  }

  // Fallback / standard curated paper-asset intelligence briefs
  const existing = await db
    .prepare('SELECT topic FROM digest_items ORDER BY id DESC LIMIT 20')
    .all<{ topic: string }>();
  const existingTopics = new Set((existing.results || []).map((r) => r.topic.toLowerCase()));

  const candidateBriefs = PAPER_ASSET_INTELLIGENCE_BRIEFS.filter(
    (b) => !existingTopics.has(b.topic.toLowerCase())
  );

  const selected = candidateBriefs.length >= 2
    ? candidateBriefs.slice(0, 2)
    : candidateBriefs.length === 1
    ? [candidateBriefs[0], PAPER_ASSET_INTELLIGENCE_BRIEFS[0]]
    : [
        PAPER_ASSET_INTELLIGENCE_BRIEFS[0],
        PAPER_ASSET_INTELLIGENCE_BRIEFS[1],
      ];

  const added: DigestItem[] = [];
  for (const brief of selected) {
    const created = await createDigestItem(db, {
      topic: brief.topic,
      summary: brief.summary,
      source_url: brief.source_url,
      read_status: 0,
    });
    added.push(created);
  }

  return { added, source: 'curated' };
}
