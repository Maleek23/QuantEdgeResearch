/**
 * Net Gamma Exposure (GEX) Calculator — v2
 * =========================================
 * NO GAPS: real VEX, cross-validated spot, Schwab → Tradier → Yahoo cascade.
 *
 * Backwards-compatible contract:
 *   calculateGammaExposure(symbol, expiration?)  →  GammaExposureResult
 *   calculateAggregateGammaExposure(symbol)      →  GammaExposureResult
 *
 * New fields added to the result (all optional, old consumers ignore them):
 *   totalVEX, totalDEX, totalCharm, callWall, putWall, vannaFlipPrice,
 *   maxVannaStrike, regime, vexRegime, dataSource, dataQuality
 */

import { logger } from './logger';
import { getTradierOptionsChain } from './tradier-api';
import { getYahooOptionsChain, getYahooExpirations } from './yahoo-options-fallback';
import { getSchwabOptionsChain, getSchwabExpirations, isSchwabConfigured } from './schwab-options-adapter';
import { getCrossValidatedQuote } from './data-quality';
import {
  computeExposures,
  optionToInput,
  type OptionInput,
  type ExposureSnapshot,
} from './options-exposures';

// ─── Legacy-compat types ───────────────────────────────────

interface GammaByStrike {
  strike: number;
  callGamma: number;
  putGamma: number;
  callOI: number;
  putOI: number;
  netGEX: number;
  callGEX: number;
  putGEX: number;
  // New fields (optional — legacy consumers ignore)
  callVEX?: number;
  putVEX?: number;
  netVEX?: number;
}

export interface GammaExposureResult {
  symbol: string;
  spotPrice: number;
  expiration: string;
  totalNetGEX: number;
  flipPoint: number | null;
  maxGammaStrike: number;
  strikes: GammaByStrike[];
  timestamp: string;

  // ─── New optional fields (no gaps)
  totalVEX?: number;
  totalDEX?: number;
  totalCharm?: number;
  callGEX?: number;
  putGEX?: number;
  putCallGEXRatio?: number;
  callWall?: number | null;
  putWall?: number | null;
  vannaFlipPrice?: number | null;
  maxVannaStrike?: number;
  zeroGammaProjection?: number | null;
  regime?: ExposureSnapshot['regime'];
  vexRegime?: ExposureSnapshot['vexRegime'];
  dataSource?: 'schwab' | 'tradier' | 'yahoo' | 'mixed' | 'none';
  dataQuality?: {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    score: number;
    sourceCount: number;
    spreadPct: number;
    isStale: boolean;
    hasDisagreement: boolean;
  };
}

// ─── Options Fetch Cascade ─────────────────────────────────

type OptionsSource = 'schwab' | 'tradier' | 'yahoo' | 'mixed' | 'none';
type OptionsFetchResult = {
  options: any[];
  source: OptionsSource;
};

async function fetchOptionsChain(
  symbol: string,
  expiration?: string,
): Promise<OptionsFetchResult> {
  // 1. Schwab (real-time, free for brokerage account holders)
  if (isSchwabConfigured()) {
    try {
      const schwab = await getSchwabOptionsChain(symbol, expiration);
      if (schwab.length > 0) {
        return { options: schwab, source: 'schwab' };
      }
    } catch (e: any) {
      logger.warn(`[GEX] Schwab chain failed for ${symbol}: ${e.message}`);
    }
  }

  // 2. Tradier (paid, reliable)
  try {
    const tradier = await getTradierOptionsChain(symbol, expiration);
    if (tradier.length > 0) {
      return { options: tradier, source: 'tradier' };
    }
  } catch (e: any) {
    logger.warn(`[GEX] Tradier chain failed for ${symbol}: ${e.message}`);
  }

  // 3. Yahoo (free fallback, BS greeks)
  try {
    const yahoo = await getYahooOptionsChain(symbol, expiration);
    if (yahoo.length > 0) {
      return { options: yahoo, source: 'yahoo' };
    }
  } catch (e: any) {
    logger.warn(`[GEX] Yahoo chain failed for ${symbol}: ${e.message}`);
  }

  return { options: [], source: 'none' };
}

async function fetchExpirationsCascade(symbol: string): Promise<string[]> {
  if (isSchwabConfigured()) {
    try {
      const schwab = await getSchwabExpirations(symbol);
      if (schwab.length > 0) return schwab;
    } catch { /* fall through */ }
  }

  // Tradier expirations
  try {
    const apiKey = process.env.TRADIER_API_KEY;
    if (apiKey) {
      const baseUrl = 'https://api.tradier.com/v1';
      const res = await fetch(`${baseUrl}/markets/options/expirations?symbol=${symbol}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.expirations?.date || [];
        if (list.length > 0) return list;
      }
    }
  } catch { /* fall through */ }

  // Yahoo
  try {
    return await getYahooExpirations(symbol);
  } catch {
    return [];
  }
}

// ─── Snapshot → Legacy result adapter ──────────────────────

function snapshotToLegacy(
  snap: ExposureSnapshot,
  expirationLabel: string,
  source: OptionsSource,
  cq: Awaited<ReturnType<typeof getCrossValidatedQuote>>,
): GammaExposureResult {
  const strikes: GammaByStrike[] = snap.strikes.map((s) => ({
    strike: s.strike,
    callGamma: s.callGamma,
    putGamma: s.putGamma,
    callOI: s.callOI,
    putOI: s.putOI,
    netGEX: s.netGEX,
    callGEX: s.callGEX,
    putGEX: s.putGEX,
    callVEX: s.callVEX,
    putVEX: s.putVEX,
    netVEX: s.netVEX,
  }));

  return {
    symbol: snap.symbol,
    spotPrice: snap.spotPrice,
    expiration: expirationLabel,
    totalNetGEX: snap.totalGEX,
    flipPoint: snap.gammaFlipPrice,
    maxGammaStrike: snap.maxGammaStrike,
    strikes,
    timestamp: new Date(snap.calculatedAt).toISOString(),
    // Extras
    totalVEX: snap.totalVEX,
    totalDEX: snap.totalDEX,
    totalCharm: snap.totalCharm,
    callGEX: snap.callGEX,
    putGEX: snap.putGEX,
    putCallGEXRatio: snap.putCallGEXRatio,
    callWall: snap.callWall,
    putWall: snap.putWall,
    vannaFlipPrice: snap.vannaFlipPrice,
    maxVannaStrike: snap.maxVannaStrike,
    zeroGammaProjection: snap.zeroGammaProjection,
    regime: snap.regime,
    vexRegime: snap.vexRegime,
    dataSource: source === 'none' ? undefined : source,
    dataQuality: {
      grade: cq.qualityGrade,
      score: cq.qualityScore,
      sourceCount: cq.sourceCount,
      spreadPct: cq.maxSpreadPct,
      isStale: cq.isStale,
      hasDisagreement: cq.hasDisagreement,
    },
  };
}

// ─── Single Expiration ──────────────────────────────────────

export async function calculateGammaExposure(
  symbol: string,
  expiration?: string,
): Promise<GammaExposureResult | null> {
  try {
    // 1. Cross-validated spot price
    const cq = await getCrossValidatedQuote(symbol);
    if (cq.bestPrice <= 0) {
      logger.error(`[GEX] No valid spot price for ${symbol}`);
      return null;
    }

    // 2. Fetch options chain via cascade
    const { options, source } = await fetchOptionsChain(symbol, expiration);
    if (options.length === 0) {
      logger.warn(`[GEX] No options data for ${symbol} from any source`);
      return null;
    }

    const actualExpiration = options[0]?.expiration_date || expiration || 'unknown';

    // 3. Map to OptionInput
    const inputs: OptionInput[] = [];
    for (const opt of options) {
      const input = optionToInput(opt, actualExpiration);
      if (input) inputs.push(input);
    }

    if (inputs.length === 0) {
      logger.warn(`[GEX] No usable option contracts for ${symbol}`);
      return null;
    }

    // 4. Compute exposures
    const snap = computeExposures(symbol, cq.bestPrice, inputs, [actualExpiration]);

    return snapshotToLegacy(snap, actualExpiration, source, cq);
  } catch (error: any) {
    logger.error(`[GEX] Error calculating gamma exposure for ${symbol}: ${error?.message || error}`);
    return null;
  }
}

// ─── Multi-Expiration Aggregate ────────────────────────────

export async function calculateAggregateGammaExposure(
  symbol: string,
): Promise<GammaExposureResult | null> {
  try {
    // 1. Cross-validated spot
    const cq = await getCrossValidatedQuote(symbol);
    if (cq.bestPrice <= 0) {
      logger.warn(`[GEX-AGG] No valid spot price for ${symbol}`);
      return null;
    }

    // 2. Get expirations
    const allExps = await fetchExpirationsCascade(symbol);
    if (allExps.length === 0) {
      logger.warn(`[GEX-AGG] No expirations found for ${symbol}`);
      return null;
    }

    const nearExps = allExps.slice(0, 4);

    // 3. Fetch each expiration in parallel with cascade
    const chainResults = await Promise.all(
      nearExps.map((exp) => fetchOptionsChain(symbol, exp)),
    );

    // 4. Collect all inputs
    const allInputs: OptionInput[] = [];
    const expsUsed: string[] = [];
    const sourcesUsed = new Set<string>();
    for (let i = 0; i < chainResults.length; i++) {
      const { options, source } = chainResults[i];
      if (options.length === 0) continue;
      expsUsed.push(nearExps[i]);
      sourcesUsed.add(source);
      for (const opt of options) {
        const input = optionToInput(opt, nearExps[i]);
        if (input) allInputs.push(input);
      }
    }

    if (allInputs.length === 0) {
      logger.warn(`[GEX-AGG] No option contracts for ${symbol} across ${nearExps.length} exps`);
      return null;
    }

    // 5. Compute unified exposures
    const snap = computeExposures(symbol, cq.bestPrice, allInputs, expsUsed);

    const mixedSource: OptionsSource =
      sourcesUsed.size === 1
        ? (Array.from(sourcesUsed)[0] as OptionsSource)
        : sourcesUsed.size > 1 ? 'mixed' : 'none';

    const legacyExp = `Aggregate (${expsUsed.length} exp)`;
    return snapshotToLegacy(snap, legacyExp, mixedSource, cq);
  } catch (error: any) {
    logger.error(`[GEX] Aggregate calculation error for ${symbol}: ${error?.message || error}`);
    return null;
  }
}
