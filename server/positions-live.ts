/**
 * POSITIONS LIVE
 * ==============
 * Aggregates user's open trade ideas with LIVE spot prices and computed P&L.
 * Powers /positions Heat Map page.
 */

import { logger } from './logger';
import { tradeIdeas } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface LivePosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  assetType: string;
  entry: number;
  /** Underlying spot (context only for options — never the option's mark). */
  spot: number | null;
  /**
   * The price P&L is measured on: the underlying for stock/crypto, the OPTION
   * contract's own mark for options (entry is a premium). Null = no mark.
   */
  mark: number | null;
  markSource: string | null;
  target: number;
  stop: number;
  /** Null when there is no mark — never 0 (an outage is not a flat position). */
  pnlPct: number | null;
  pnlAbs: number | null;
  daysActive: number;
  source: string;
  status: string;
  expiryDate?: string | null;
  daysToExpiry?: number | null;
  isOption: boolean;
  strikePrice?: number | null;
  optionType?: string | null;
  // Heat — for heat map coloring
  heatScore: number;       // -100 to +100 (red → green)
  heatRank: 'fire' | 'hot' | 'warm' | 'cool' | 'frozen' | 'red' | 'nomark';
}

/**
 * P&L of one open idea against its mark (audit 2026-10-01 P0 #4/#6). Options are
 * measured on the contract's mark, never the underlying (entry is a premium);
 * no mark → null P&L and the 'nomark' rank, never a flat 0%.
 */
export function markPnl(
  t: { direction: string; entryPrice: number; assetType: string },
  underlyingSpot: number | null,
  optionMark: number | null,
): { mark: number | null; pnlPct: number | null; pnlAbs: number | null } {
  const isOption = t.assetType === 'option';
  const mark = isOption ? optionMark : underlyingSpot;
  if (mark == null || !Number.isFinite(mark) || mark <= 0 || !(t.entryPrice > 0)) return { mark: null, pnlPct: null, pnlAbs: null };
  // A bought option profits when its premium rises whatever the idea's direction.
  const long = isOption ? true : t.direction === 'long';
  const pnlAbs = long ? mark - t.entryPrice : t.entryPrice - mark;
  return { mark, pnlPct: +((pnlAbs / t.entryPrice) * 100).toFixed(2), pnlAbs: +pnlAbs.toFixed(2) };
}

async function fetchSpot(symbol: string): Promise<number | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j: any = await r.json();
    return j?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  } catch {
    return null;
  }
}

function classifyHeat(pnlPct: number | null, daysActive: number): { score: number; rank: LivePosition['heatRank'] } {
  if (pnlPct == null) return { score: 0, rank: 'nomark' };
  // Heat = pnl / time-decay-adjusted
  let score = pnlPct;

  if (score > 100) score = 100;
  if (score < -100) score = -100;

  let rank: LivePosition['heatRank'] = 'cool';
  if (score >= 50) rank = 'fire';
  else if (score >= 20) rank = 'hot';
  else if (score >= 5) rank = 'warm';
  else if (score >= -5) rank = 'cool';
  else if (score >= -20) rank = 'frozen';
  else rank = 'red';

  return { score, rank };
}

export async function getLivePositions(userId: string): Promise<LivePosition[]> {
  // Lazy: keeps the pure P&L helpers above importable without a database.
  const { db } = await import('./db');
  const open = await db
    .select()
    .from(tradeIdeas)
    .where(and(eq(tradeIdeas.userId, userId), eq(tradeIdeas.outcomeStatus, 'open')))
    .limit(100);

  if (!open.length) return [];

  // Fetch spot for unique symbols in parallel
  const symbols = Array.from(new Set(open.map(t => t.symbol)));
  const spotMap = new Map<string, number | null>();
  await Promise.all(symbols.map(async s => {
    spotMap.set(s, await fetchSpot(s));
  }));

  // Option contracts are marked on their own premium (Tradier → CBOE delayed).
  const optionMarks = new Map<string, { price: number; source: string } | null>();
  const opts = open.filter((t) => t.assetType === 'option' && t.expiryDate && t.strikePrice && t.optionType);
  if (opts.length) {
    const { getOptionMark } = await import('./tradier-api');
    await Promise.all(opts.map(async (t) => {
      try {
        const m = await Promise.race([
          getOptionMark({ underlying: t.symbol, expiryDate: String(t.expiryDate), optionType: t.optionType as 'call' | 'put', strike: Number(t.strikePrice) }),
          new Promise<null>((r) => setTimeout(() => r(null), 6_000)),
        ]);
        const px = m ? (m.mid > 0 ? m.mid : m.last > 0 ? m.last : 0) : 0;
        optionMarks.set(t.id, px > 0 ? { price: px, source: `${m!.source}${m!.delayed ? ' (delayed)' : ''}` } : null);
      } catch {
        optionMarks.set(t.id, null);
      }
    }));
  }

  const now = Date.now();
  const positions: LivePosition[] = open.map(t => {
    const spot = spotMap.get(t.symbol) ?? null;
    const issued = new Date(t.timestamp).getTime();
    const daysActive = Math.max(1, Math.floor((now - issued) / 86400000));
    const om = optionMarks.get(t.id) ?? null;
    const { mark, pnlPct, pnlAbs } = markPnl(t, spot, om?.price ?? null);
    const markSource = mark == null ? null : t.assetType === 'option' ? om?.source ?? null : 'yahoo spot';

    const { score, rank } = classifyHeat(pnlPct, daysActive);
    const dte = t.expiryDate ? Math.floor((new Date(t.expiryDate).getTime() - now) / 86400000) : null;

    return {
      id: t.id,
      symbol: t.symbol,
      direction: t.direction as 'long' | 'short',
      assetType: t.assetType,
      entry: t.entryPrice,
      spot,
      mark,
      markSource,
      target: t.targetPrice,
      stop: t.stopLoss,
      pnlPct,
      pnlAbs,
      daysActive,
      source: t.source || 'unknown',
      status: t.outcomeStatus || 'open',
      expiryDate: t.expiryDate,
      daysToExpiry: dte,
      isOption: t.assetType === 'option',
      strikePrice: t.strikePrice ?? null,
      optionType: t.optionType ?? null,
      heatScore: score,
      heatRank: rank
    };
  });

  // Sort by heat (hottest first); unmarked rows last.
  return positions.sort((a, b) => (a.pnlPct == null ? 1 : 0) - (b.pnlPct == null ? 1 : 0) || b.heatScore - a.heatScore);
}

export interface PositionsSummary {
  total: number;
  winners: number;
  losers: number;
  /**
   * Headline net open P&L %: the equal-weight mean return of MARKED positions
   * (each idea = the same $ at entry, so this is the capital-weighted return of
   * that book). Was the SUM of per-position % (10 × +5% read "+50%"). Null when
   * nothing is marked.
   */
  totalPnLPct: number | null;
  /** Sum of per-unit $ P&L of marked positions (1 share / 1 contract-premium each). */
  totalPnLAbs: number | null;
  pnlBasis: string;
  marked: number;
  unmarked: number;
  hotCount: number;       // fire+hot
  coldCount: number;      // frozen+red
  bestPosition: LivePosition | null;
  worstPosition: LivePosition | null;
  bySource: Record<string, number>;
  byAssetType: Record<string, number>;
}

export function computePositionsSummary(positions: LivePosition[]): PositionsSummary {
  const marked = positions.filter(p => p.pnlPct != null);
  const winners = marked.filter(p => p.pnlPct! > 0);
  const losers = marked.filter(p => p.pnlPct! < 0);
  const totalPnLPct = marked.length ? marked.reduce((s, p) => s + p.pnlPct!, 0) / marked.length : null;
  const totalPnLAbs = marked.length ? marked.reduce((s, p) => s + (p.pnlAbs ?? 0), 0) : null;
  const byPnl = [...marked].sort((a, b) => b.pnlPct! - a.pnlPct!);
  const hotCount = positions.filter(p => p.heatRank === 'fire' || p.heatRank === 'hot').length;
  const coldCount = positions.filter(p => p.heatRank === 'frozen' || p.heatRank === 'red').length;

  const bySource: Record<string, number> = {};
  const byAssetType: Record<string, number> = {};
  for (const p of positions) {
    bySource[p.source] = (bySource[p.source] || 0) + 1;
    byAssetType[p.assetType] = (byAssetType[p.assetType] || 0) + 1;
  }

  return {
    total: positions.length,
    winners: winners.length,
    losers: losers.length,
    totalPnLPct: totalPnLPct == null ? null : +totalPnLPct.toFixed(2),
    totalPnLAbs: totalPnLAbs == null ? null : +totalPnLAbs.toFixed(2),
    pnlBasis: 'average per marked position (equal $ each)',
    marked: marked.length,
    unmarked: positions.length - marked.length,
    hotCount,
    coldCount,
    bestPosition: byPnl[0] ?? null,
    worstPosition: byPnl[byPnl.length - 1] ?? null,
    bySource,
    byAssetType
  };
}
