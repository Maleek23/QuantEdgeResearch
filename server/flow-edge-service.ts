/**
 * Flow Edge Service
 * =================
 * Aggregated options flow with stats, filtering, and repeat ticker detection.
 * Powers the /flow page (Algo Edge equivalent).
 * Queries the existing optionsFlowHistory table populated by flow scanners.
 */

import { logger } from './logger';
import { db } from './db';
import { optionsFlowHistory } from '@shared/schema';
import type { FlowStrategyCategory, FlowDteCategory } from '@shared/schema';
import { eq, desc, gte, and, sql, count, sum } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FlowTrade {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
  volume: number;
  openInterest: number | null;
  volumeOIRatio: number | null;
  premium: number;
  totalPremium: number;
  impliedVolatility: number | null;
  delta: number | null;
  underlyingPrice: number | null;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  flowType: 'block' | 'sweep' | 'unusual_volume' | 'dark_pool' | 'normal';
  unusualScore: number;
  strategyCategory: string | null;
  dteCategory: string | null;
  isLotto: boolean;
  detectedAt: string;
  detectedDate: string;
}

export interface FlowStats {
  totalTrades: number;
  totalValue: number;
  callCount: number;
  putCount: number;
  callPutRatio: number;
  peakHour: string;
  mostActiveTickers: { symbol: string; count: number; totalPremium: number }[];
  repeatTickers: { symbol: string; count: number }[];
  unusualActivity: { symbol: string; unusualScore: number; flowType: string }[];
  topTradesByValue: FlowTrade[];
}

export interface FlowFilters {
  symbol?: string;
  flowType?: string;
  minPremium?: number;
  strategyCategory?: string;
  dteCategory?: string;
  sentiment?: string;
  limit?: number;
  offset?: number;
  days?: number;
}

export interface FlowResponse {
  trades: FlowTrade[];
  stats: FlowStats;
  pagination: { limit: number; offset: number; total: number };
}

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function buildConditions(filters: FlowFilters) {
  const conditions: any[] = [];
  const days = filters.days || 7;
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  conditions.push(gte(optionsFlowHistory.detectedDate, startDate));

  if (filters.symbol) {
    conditions.push(eq(optionsFlowHistory.symbol, filters.symbol.toUpperCase()));
  }
  if (filters.flowType) {
    conditions.push(eq(optionsFlowHistory.flowType, filters.flowType as any));
  }
  if (filters.minPremium) {
    conditions.push(gte(optionsFlowHistory.totalPremium, filters.minPremium));
  }
  if (filters.strategyCategory) {
    conditions.push(eq(optionsFlowHistory.strategyCategory, filters.strategyCategory as FlowStrategyCategory));
  }
  if (filters.dteCategory) {
    conditions.push(eq(optionsFlowHistory.dteCategory, filters.dteCategory as FlowDteCategory));
  }
  if (filters.sentiment) {
    conditions.push(eq(optionsFlowHistory.sentiment, filters.sentiment as any));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function mapRow(f: any): FlowTrade {
  return {
    id: f.id,
    symbol: f.symbol,
    optionType: f.optionType as 'call' | 'put',
    strikePrice: f.strikePrice,
    expirationDate: f.expirationDate,
    volume: f.volume,
    openInterest: f.openInterest,
    volumeOIRatio: f.volumeOIRatio,
    premium: f.premium || 0,
    totalPremium: f.totalPremium || 0,
    impliedVolatility: f.impliedVolatility,
    delta: f.delta,
    underlyingPrice: f.underlyingPrice,
    sentiment: (f.sentiment || 'neutral') as 'bullish' | 'bearish' | 'neutral',
    flowType: (f.flowType || 'normal') as FlowTrade['flowType'],
    unusualScore: f.unusualScore || 0,
    strategyCategory: f.strategyCategory,
    dteCategory: f.dteCategory,
    isLotto: f.isLotto || false,
    detectedAt: f.detectedAt?.toISOString() || '',
    detectedDate: f.detectedDate || '',
  };
}

/**
 * Get paginated options flow trades with filters
 */
export async function getOptionsFlow(filters: FlowFilters): Promise<FlowResponse> {
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  try {
    const where = buildConditions(filters);

    // Get paginated trades
    const trades = await db.select()
      .from(optionsFlowHistory)
      .where(where)
      .orderBy(desc(optionsFlowHistory.detectedAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(optionsFlowHistory)
      .where(where);
    const total = Number(countResult[0]?.count || 0);

    // Get ALL rows for stats (up to 500 for performance)
    const allRows = await db.select()
      .from(optionsFlowHistory)
      .where(where)
      .orderBy(desc(optionsFlowHistory.totalPremium))
      .limit(500);

    const stats = computeStats(allRows);

    return {
      trades: trades.map(mapRow),
      stats,
      pagination: { limit, offset, total },
    };
  } catch (error) {
    logger.error('[FLOW-EDGE] Error fetching options flow:', error);
    return {
      trades: [],
      stats: emptyStats(),
      pagination: { limit, offset, total: 0 },
    };
  }
}

/**
 * Compute aggregated stats from flow rows
 */
function computeStats(rows: any[]): FlowStats {
  if (rows.length === 0) return emptyStats();

  let totalValue = 0;
  let callCount = 0;
  let putCount = 0;
  const symbolMap = new Map<string, { count: number; totalPremium: number }>();
  const hourMap = new Map<string, number>();
  const unusualMap = new Map<string, { score: number; flowType: string }>();

  for (const f of rows) {
    const premium = f.totalPremium || 0;
    totalValue += premium;

    if (f.optionType === 'call') callCount++;
    else putCount++;

    // Aggregate by symbol
    const sym = f.symbol;
    const entry = symbolMap.get(sym) || { count: 0, totalPremium: 0 };
    entry.count++;
    entry.totalPremium += premium;
    symbolMap.set(sym, entry);

    // Peak hour
    if (f.detectedAt) {
      const hour = new Date(f.detectedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    }

    // Unusual activity tracking
    const score = f.unusualScore || 0;
    if (score > 5) {
      const existing = unusualMap.get(sym);
      if (!existing || score > existing.score) {
        unusualMap.set(sym, { score, flowType: f.flowType || 'normal' });
      }
    }
  }

  // Most active tickers (top 10)
  const mostActiveTickers = [...symbolMap.entries()]
    .map(([symbol, data]) => ({ symbol, count: data.count, totalPremium: data.totalPremium }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Repeat tickers (3+ trades)
  const repeatTickers = [...symbolMap.entries()]
    .filter(([_, data]) => data.count >= 3)
    .map(([symbol, data]) => ({ symbol, count: data.count }))
    .sort((a, b) => b.count - a.count);

  // Peak hour
  let peakHour = '9:30 AM';
  let maxHourCount = 0;
  for (const [hour, cnt] of hourMap) {
    if (cnt > maxHourCount) { maxHourCount = cnt; peakHour = hour; }
  }

  // Unusual activity (top 10 by score)
  const unusualActivity = [...unusualMap.entries()]
    .map(([symbol, data]) => ({ symbol, unusualScore: data.score, flowType: data.flowType }))
    .sort((a, b) => b.unusualScore - a.unusualScore)
    .slice(0, 10);

  // Top trades by value
  const topTradesByValue = rows
    .sort((a, b) => (b.totalPremium || 0) - (a.totalPremium || 0))
    .slice(0, 5)
    .map(mapRow);

  return {
    totalTrades: rows.length,
    totalValue,
    callCount,
    putCount,
    callPutRatio: putCount > 0 ? +(callCount / putCount).toFixed(2) : callCount,
    peakHour,
    mostActiveTickers,
    repeatTickers,
    unusualActivity,
    topTradesByValue,
  };
}

function emptyStats(): FlowStats {
  return {
    totalTrades: 0,
    totalValue: 0,
    callCount: 0,
    putCount: 0,
    callPutRatio: 0,
    peakHour: '--',
    mostActiveTickers: [],
    repeatTickers: [],
    unusualActivity: [],
    topTradesByValue: [],
  };
}

logger.info('[FLOW-EDGE] Flow Edge Service initialized');
