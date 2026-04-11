/**
 * GEX/VEX Confluence Scanner
 * ==========================
 * Scans the approved watchlist for high-confluence gamma + vanna setups.
 * Uses calculateAggregateGammaExposure for reliable GEX data (Tradier → Yahoo fallback).
 *
 * Confluence scoring (0-100):
 *   - flipProximity (0-25): how close spot is to the gamma flip
 *   - wallSetup    (0-25): clean call/put wall bracketing spot
 *   - vexAlignment (0-20): vanna direction supports thesis
 *   - liquidity    (0-15): OI concentration on key strikes
 *   - regime       (0-15): positive-gamma pin or negative-gamma volatility
 */

import { logger } from './logger';
import { calculateAggregateGammaExposure } from './gamma-exposure';
import { getTradierQuote } from './tradier-api';
import { getChartLastPrice, safeQuote, getBestPrice } from './yahoo-finance-service';
import {
  APPROVED_TICKERS,
  S_TIER,
  A_TIER,
  INDEX_TICKERS,
  SECONDARY,
  getTier,
  getSector,
  SECTOR_LABELS,
  type Sector,
} from '../shared/approved-tickers';
import {
  ConfluenceRow,
  ConfluenceBreakdown,
  ConfluenceScanResult,
  GEXSnapshot,
  GEXLevel,
  GEXHubData,
  HubLeaderRow,
  SectorAggregate,
  RegimeDistribution,
  scoreToTier,
} from '../shared/gex-types';

// ─── Cache ──────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
let cachedResult: { data: ConfluenceScanResult; expiresAt: number } | null = null;

// ─── Quote Helper ──────────────────────────────────────────
async function getQuoteWithChange(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    // Try Tradier first
    const tradier = await getTradierQuote(symbol);
    if (tradier?.last && tradier?.prevclose) {
      const change = tradier.last - tradier.prevclose;
      return {
        price: tradier.last,
        change,
        changePct: (change / tradier.prevclose) * 100,
      };
    }

    // Yahoo fallback
    const yq = await safeQuote(symbol);
    const price = getBestPrice(yq);
    if (price > 0) {
      const prev = (yq as any)?.regularMarketPreviousClose || price;
      const change = price - prev;
      return {
        price,
        change,
        changePct: prev > 0 ? (change / prev) * 100 : 0,
      };
    }

    // Last resort — chart candle
    const chart = await getChartLastPrice(symbol);
    if (chart > 0) {
      return { price: chart, change: 0, changePct: 0 };
    }

    return null;
  } catch (e: any) {
    logger.warn(`[GEX-SCAN] Quote failed for ${symbol}: ${e.message}`);
    return null;
  }
}

// ─── Convert gamma-exposure result → GEXSnapshot ──────────
export function toSnapshot(result: NonNullable<Awaited<ReturnType<typeof calculateAggregateGammaExposure>>>): GEXSnapshot {
  const {
    symbol,
    spotPrice,
    totalNetGEX,
    flipPoint,
    maxGammaStrike,
    strikes,
    totalVEX,
    callGEX: callGexExtra,
    putGEX: putGexExtra,
    putCallGEXRatio,
    callWall: callWallExtra,
    putWall: putWallExtra,
    zeroGammaProjection: projExtra,
    regime: regimeExtra,
    dataSource,
    dataQuality,
  } = result;

  // Prefer the real values from the unified aggregator; fall back to derivation if missing.
  const callGEX =
    callGexExtra ?? strikes.reduce((sum, s) => sum + (s.callGEX > 0 ? s.callGEX : 0), 0);
  const putGEX =
    putGexExtra ??
    Math.abs(strikes.reduce((sum, s) => sum + (s.putGEX < 0 ? s.putGEX : 0), 0));
  const pcr = putCallGEXRatio ?? (callGEX > 0 ? putGEX / callGEX : 0);
  const totalAbsGEX = strikes.reduce((sum, s) => sum + Math.abs(s.netGEX), 0);

  const callWall =
    callWallExtra ??
    strikes
      .filter((s) => s.strike > spotPrice && s.netGEX > 0)
      .sort((a, b) => b.netGEX - a.netGEX)[0]?.strike ??
    null;

  const putWall =
    putWallExtra ??
    strikes
      .filter((s) => s.strike < spotPrice && s.netGEX < 0)
      .sort((a, b) => a.netGEX - b.netGEX)[0]?.strike ??
    null;

  const zeroGammaProjection = projExtra ?? (totalNetGEX > 0 ? maxGammaStrike : flipPoint);

  // Build level list with roles — now includes real VEX
  const levels: GEXLevel[] = strikes
    .filter((s) => Math.abs(s.netGEX) > 0 || Math.abs(s.netVEX || 0) > 0)
    .map((s) => {
      let role: GEXLevel['role'] = 'neutral';
      if (s.strike === maxGammaStrike) role = 'max_gamma';
      else if (s.strike === callWall) role = 'call_wall';
      else if (s.strike === putWall) role = 'put_wall';
      else if (s.strike === flipPoint) role = 'flip';
      else if (s.netGEX > 0 && s.strike > spotPrice) role = 'resistance';
      else if (s.netGEX < 0 && s.strike < spotPrice) role = 'support';

      return {
        strike: s.strike,
        gex: s.netGEX,
        callGex: s.callGEX,
        putGex: s.putGEX,
        vex: s.netVEX ?? 0,
        gammaPct: totalAbsGEX > 0 ? Math.abs(s.netGEX) / totalAbsGEX : 0,
        openInterest: s.callOI + s.putOI,
        role,
        distancePct: spotPrice > 0 ? ((s.strike - spotPrice) / spotPrice) * 100 : 0,
      };
    })
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
    .slice(0, 20);

  const regime: GEXSnapshot['regime'] =
    regimeExtra ??
    (totalNetGEX > 0.5
      ? 'positive_gamma'
      : totalNetGEX < -0.5
        ? 'negative_gamma'
        : Math.abs(totalNetGEX) < 0.2
          ? 'neutral'
          : 'transitioning');

  return {
    symbol,
    spotPrice,
    calculatedAt: Date.now(),
    totalGEX: totalNetGEX,
    totalVEX: totalVEX ?? 0,
    callGEX,
    putGEX,
    putCallRatio: pcr,
    gammaFlipPrice: flipPoint,
    maxGammaStrike,
    callWall,
    putWall,
    zeroGammaProjection,
    levels,
    regime,
    volatilityRegime: 'normal',
    source: (dataSource as GEXSnapshot['source']) || 'mixed',
    expirationsUsed: [],
    dataQuality,
  };
}

// ─── Confluence Scoring ────────────────────────────────────
function scoreConfluence(snap: GEXSnapshot): ConfluenceBreakdown {
  const { spotPrice, gammaFlipPrice, callWall, putWall, levels, totalGEX, regime } = snap;

  // 1. Flip proximity (0-25) — closer flip = higher energy
  let flipProximity = 0;
  if (gammaFlipPrice && spotPrice > 0) {
    const distPct = Math.abs(gammaFlipPrice - spotPrice) / spotPrice;
    // Within 0.5% = 25, 3% = 0
    flipProximity = Math.max(0, 25 * (1 - distPct / 0.03));
  }

  // 2. Wall setup (0-25) — reward clean bracket around spot
  let wallSetup = 0;
  if (callWall && putWall) {
    const bracket = (callWall - putWall) / spotPrice;
    // Tight (2-5%) = best
    if (bracket >= 0.02 && bracket <= 0.06) wallSetup = 25;
    else if (bracket < 0.02) wallSetup = 18; // very tight — squeeze
    else if (bracket <= 0.1) wallSetup = 15;
    else wallSetup = 8;
  } else if (callWall || putWall) {
    wallSetup = 10; // one-sided
  }

  // 3. VEX alignment (0-20) — uses REAL vanna from options-exposures
  //    Positive VEX + positive gamma → vol tailwind, dealers add thrust (good long)
  //    Negative VEX + negative gamma → vol headwind, break plays favored
  //    Divergent VEX/GEX signs → transitioning, lower confidence
  const totalVEX = snap.totalVEX || 0;
  let vexAlignment = 0;
  const gexSign = Math.sign(totalGEX);
  const vexSign = Math.sign(totalVEX);
  const vexMag = Math.min(1, Math.abs(totalVEX) / 0.5); // 0.5B+ = full magnitude

  if (gexSign !== 0 && vexSign !== 0 && gexSign === vexSign) {
    // Aligned — best case
    vexAlignment = Math.round(12 + 8 * vexMag); // 12-20
  } else if (gexSign !== 0 && vexSign !== 0 && gexSign !== vexSign) {
    // Divergent — expect chop / transition
    vexAlignment = Math.round(6 + 6 * vexMag); // 6-12
  } else if (regime === 'negative_gamma') {
    vexAlignment = 14; // vol regime = opportunity even without vanna signal
  } else if (regime === 'transitioning') {
    vexAlignment = 10;
  } else {
    vexAlignment = 6;
  }

  // 4. Liquidity (0-15) — top-3 levels OI weight
  const top3OI = levels.slice(0, 3).reduce((sum, l) => sum + l.openInterest, 0);
  let liquidity = 0;
  if (top3OI > 20000) liquidity = 15;
  else if (top3OI > 8000) liquidity = 12;
  else if (top3OI > 3000) liquidity = 8;
  else if (top3OI > 500) liquidity = 4;

  // 5. Regime (0-15) — reward strong regimes
  let regimeScore = 0;
  if (regime === 'negative_gamma') regimeScore = 15; // volatility plays
  else if (regime === 'positive_gamma') regimeScore = 12; // pin plays
  else if (regime === 'transitioning') regimeScore = 10;
  else regimeScore = 5;

  return {
    flipProximity: Math.round(flipProximity),
    wallSetup: Math.round(wallSetup),
    vexAlignment: Math.round(vexAlignment),
    liquidity: Math.round(liquidity),
    regime: Math.round(regimeScore),
  };
}

function deriveBias(snap: GEXSnapshot): {
  bias: 'long' | 'short' | 'neutral';
  target: number | null;
  stop: number | null;
  rr: number | null;
} {
  const { spotPrice, callWall, putWall, totalGEX, regime, zeroGammaProjection } = snap;

  // Positive gamma regime → mean revert to max-gamma (pin)
  // Negative gamma regime → trend toward nearest wall
  let bias: 'long' | 'short' | 'neutral' = 'neutral';
  let target: number | null = null;
  let stop: number | null = null;

  if (regime === 'positive_gamma' && zeroGammaProjection) {
    if (zeroGammaProjection > spotPrice) {
      bias = 'long';
      target = callWall || zeroGammaProjection;
      stop = putWall || spotPrice * 0.98;
    } else if (zeroGammaProjection < spotPrice) {
      bias = 'short';
      target = putWall || zeroGammaProjection;
      stop = callWall || spotPrice * 1.02;
    }
  } else if (regime === 'negative_gamma') {
    // Negative gamma → break toward nearest wall with momentum
    if (callWall && putWall) {
      const distCall = Math.abs(callWall - spotPrice);
      const distPut = Math.abs(spotPrice - putWall);
      if (distCall < distPut) {
        bias = 'long';
        target = callWall;
        stop = spotPrice * 0.985;
      } else {
        bias = 'short';
        target = putWall;
        stop = spotPrice * 1.015;
      }
    }
  }

  let rr: number | null = null;
  if (target && stop && bias !== 'neutral') {
    const reward = Math.abs(target - spotPrice);
    const risk = Math.abs(stop - spotPrice);
    rr = risk > 0 ? reward / risk : null;
  }

  return { bias, target, stop, rr };
}

// ─── Main Scanner ──────────────────────────────────────────
export async function scanWatchlistConfluence(options?: {
  tickers?: string[];
  minScore?: number;
  useCache?: boolean;
}): Promise<ConfluenceScanResult> {
  const useCache = options?.useCache !== false;
  if (useCache && cachedResult && cachedResult.expiresAt > Date.now()) {
    logger.info('[GEX-SCAN] Returning cached result');
    return cachedResult.data;
  }

  const universe: string[] =
    options?.tickers && options.tickers.length > 0
      ? options.tickers.map((t) => t.toUpperCase()).filter((t) => (APPROVED_TICKERS as Set<string>).has(t))
      : [
          ...(INDEX_TICKERS as readonly string[]),
          ...(S_TIER as readonly string[]),
          ...(A_TIER as readonly string[]).slice(0, 20), // Cap to keep scan fast
          ...(SECONDARY as readonly string[]).slice(0, 5),
        ];

  logger.info(`[GEX-SCAN] Scanning ${universe.length} tickers...`);
  const startedAt = Date.now();

  const rows: ConfluenceRow[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];

  // Process in batches of 5 to respect rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (symbol) => {
        const [gex, quote] = await Promise.all([
          calculateAggregateGammaExposure(symbol),
          getQuoteWithChange(symbol),
        ]);

        if (!gex) throw new Error('no_gex_data');
        if (!quote) throw new Error('no_quote');

        const snap = toSnapshot(gex);
        // Override spot with fresh quote if more recent
        if (quote.price > 0) snap.spotPrice = quote.price;

        const breakdown = scoreConfluence(snap);
        const score =
          breakdown.flipProximity +
          breakdown.wallSetup +
          breakdown.vexAlignment +
          breakdown.liquidity +
          breakdown.regime;

        const { bias, target, stop, rr } = deriveBias(snap);

        const row: ConfluenceRow = {
          symbol,
          tier: getTier(symbol),
          spotPrice: snap.spotPrice,
          change: quote.change,
          changePct: quote.changePct,
          score,
          breakdown,
          scoreTier: scoreToTier(score),
          gammaFlip: snap.gammaFlipPrice,
          callWall: snap.callWall,
          putWall: snap.putWall,
          projection: snap.zeroGammaProjection,
          maxGammaStrike: snap.maxGammaStrike,
          totalGEX: snap.totalGEX,
          totalVEX: snap.totalVEX,
          regime: snap.regime,
          sector: getSector(symbol),
          bias,
          target,
          stop,
          riskReward: rr,
          dataSource: snap.source,
          calculatedAt: snap.calculatedAt,
        };
        return row;
      }),
    );

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        rows.push(res.value);
      } else {
        errors.push({ symbol: batch[idx], error: res.reason?.message || 'unknown' });
      }
    });
  }

  // Filter by min score
  const minScore = options?.minScore ?? 0;
  const filtered = rows.filter((r) => r.score >= minScore);
  filtered.sort((a, b) => b.score - a.score);

  // Market regime from SPY/QQQ
  const spy = filtered.find((r) => r.symbol === 'SPY');
  const qqq = filtered.find((r) => r.symbol === 'QQQ');
  let marketRegime: ConfluenceScanResult['marketRegime'] = 'choppy';
  if (spy && qqq) {
    if (spy.changePct > 0.3 && qqq.changePct > 0.3) marketRegime = 'risk_on';
    else if (spy.changePct < -0.3 && qqq.changePct < -0.3) marketRegime = 'risk_off';
    else if (Math.abs(spy.changePct) > 0.5) marketRegime = 'trending';
  }

  const result: ConfluenceScanResult = {
    rows: filtered,
    scannedAt: startedAt,
    tickersScanned: universe.length,
    tickersWithData: rows.length,
    marketRegime,
    topPick: filtered[0]?.symbol ?? null,
    errors,
  };

  cachedResult = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };

  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `[GEX-SCAN] Done in ${duration}s: ${rows.length}/${universe.length} scored, ${errors.length} errors, top: ${result.topPick} (${filtered[0]?.score ?? 0})`,
  );

  return result;
}

export function clearConfluenceCache(): void {
  cachedResult = null;
}

// ─────────────────────────────────────────────────────────────
// GEX HUB AGGREGATION
// ─────────────────────────────────────────────────────────────
// Wraps the existing scan and reshapes it into the market-wide
// hub view: top GEX longs/shorts, top VEX movers, sector splits,
// regime distribution. Cheap reshape — no extra fetches.
// ─────────────────────────────────────────────────────────────

const HUB_LEADER_COUNT = 6;

function toLeaderRow(r: ConfluenceRow): HubLeaderRow {
  return {
    symbol: r.symbol,
    tier: r.tier,
    spotPrice: r.spotPrice,
    changePct: r.changePct,
    totalGEX: r.totalGEX,
    totalVEX: r.totalVEX,
    score: r.score,
    regime: r.regime,
    bias: r.bias,
    sector: r.sector,
    callWall: r.callWall,
    putWall: r.putWall,
  };
}

export function buildGEXHub(scan: ConfluenceScanResult): GEXHubData {
  const rows = scan.rows;

  // ─── Top positive GEX (call wall heavy / pin candidates) ───
  const topPositiveGEX = [...rows]
    .filter((r) => r.totalGEX > 0)
    .sort((a, b) => b.totalGEX - a.totalGEX)
    .slice(0, HUB_LEADER_COUNT)
    .map(toLeaderRow);

  // ─── Top negative GEX (volatility / break candidates) ──────
  const topNegativeGEX = [...rows]
    .filter((r) => r.totalGEX < 0)
    .sort((a, b) => a.totalGEX - b.totalGEX) // most negative first
    .slice(0, HUB_LEADER_COUNT)
    .map(toLeaderRow);

  // ─── Top VEX (vanna movers — by absolute magnitude) ────────
  const topVEX = [...rows]
    .filter((r) => Math.abs(r.totalVEX) > 0)
    .sort((a, b) => Math.abs(b.totalVEX) - Math.abs(a.totalVEX))
    .slice(0, HUB_LEADER_COUNT)
    .map(toLeaderRow);

  // ─── Sector aggregation ───────────────────────────────────
  const sectorMap = new Map<string, ConfluenceRow[]>();
  for (const r of rows) {
    const arr = sectorMap.get(r.sector) || [];
    arr.push(r);
    sectorMap.set(r.sector, arr);
  }

  const sectors: SectorAggregate[] = [];
  for (const [sector, sectorRows] of Array.from(sectorMap.entries())) {
    if (sectorRows.length === 0) continue;
    const netGEX = sectorRows.reduce((sum, r) => sum + r.totalGEX, 0);
    const netVEX = sectorRows.reduce((sum, r) => sum + r.totalVEX, 0);
    const avgScore = sectorRows.reduce((sum, r) => sum + r.score, 0) / sectorRows.length;
    const bullishCount = sectorRows.filter((r) => r.bias === 'long').length;
    const bearishCount = sectorRows.filter((r) => r.bias === 'short').length;
    const neutralCount = sectorRows.filter((r) => r.bias === 'neutral').length;
    const topPick = [...sectorRows].sort((a, b) => b.score - a.score)[0]?.symbol ?? null;

    sectors.push({
      sector,
      label: SECTOR_LABELS[sector as Sector] || sector,
      symbols: sectorRows.map((r) => r.symbol),
      netGEX,
      netVEX,
      avgScore,
      bullishCount,
      bearishCount,
      neutralCount,
      topPick,
    });
  }
  sectors.sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX));

  // ─── Regime distribution ──────────────────────────────────
  const regimeDistribution: RegimeDistribution = {
    positive_gamma: 0,
    negative_gamma: 0,
    neutral: 0,
    transitioning: 0,
    total: rows.length,
  };
  for (const r of rows) {
    regimeDistribution[r.regime] = (regimeDistribution[r.regime] || 0) + 1;
  }

  const marketNetGEX = rows.reduce((sum, r) => sum + r.totalGEX, 0);
  const marketNetVEX = rows.reduce((sum, r) => sum + r.totalVEX, 0);

  return {
    scannedAt: scan.scannedAt,
    marketRegime: scan.marketRegime,
    totalTickers: rows.length,
    topPositiveGEX,
    topNegativeGEX,
    topVEX,
    sectors,
    regimeDistribution,
    marketNetGEX,
    marketNetVEX,
  };
}
