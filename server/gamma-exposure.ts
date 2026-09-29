/**
 * Net Gamma Exposure (GEX) Calculator — v2
 * =========================================
 * Chain cascade: Alpaca (indicative feed, primary) → Schwab (if configured) →
 * CBOE delayed → Yahoo → Tradier (token currently rejected; last).
 * Math: server/options-exposures.ts + shared/gex-math.ts; methodology in
 * docs/GEX_VEX_METHODOLOGY.md. Every result says which source it came from.
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
import { getCBOEExpirations, getCBOEOptionsChain } from './cboe-options-fallback';
import { getCrossValidatedQuote, assessOptionsStaleness } from './data-quality';
import {
  computeExposures,
  optionToInput,
  type OptionInput,
  type ExposureSnapshot,
  type StrikeExpiryCell,
} from './options-exposures';
import { tradierBase } from './tradier-api';
import { getAlpacaOptionsChain, alpacaToTradierShape, isAlpacaOptionsConfigured } from './alpaca-options';
import type { GammaRegimeRead } from '../shared/gex-regime';

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
  /** Alias of totalNetGEX — see the emit site for why both names ship. */
  totalGEX?: number;
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
  regimeRead?: GammaRegimeRead;
  vexRegime?: ExposureSnapshot['vexRegime'];
  /** Units v2: GEX $B per 1% (unweighted), VEX $M per IV point. */
  unitsVersion?: 2;
  grossGEX?: number;
  gexByScope?: ExposureSnapshot['gexByScope'];
  zeroGammaLevel?: number | null;
  zeroGammaCrossings?: number[];
  gammaProfile?: Array<{ spot: number; netGEX: number }>;
  callWallOI?: number | null;
  putWallOI?: number | null;
  dataSource?: 'alpaca' | 'schwab' | 'tradier' | 'yahoo' | 'cboe' | 'mixed' | 'none';
  dataQuality?: {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    score: number;
    sourceCount: number;
    spreadPct: number;
    isStale: boolean;
    hasDisagreement: boolean;
    // ── Options-chain provenance (SR 11-7 F3.5 / P1-3). The fields above
    // describe the SPOT quote only; these describe the chain the levels came from.
    /** When the cascade received the chain (oldest leg for aggregates). ISO. Provider-side caches (e.g. CBOE's 60s) are not visible here. */
    chainFetchedAt?: string;
    /** Age of the chain at emit time, ms. */
    chainAgeMs?: number;
    /** Verdict from assessOptionsStaleness (5 min live / 15 min otherwise). */
    chainIsFresh?: boolean;
    chainStaleReason?: string;
    /** True when any leg came from CBOE's delayed (~15 min) feed. */
    chainDelayedFeed?: boolean;
    /** Feed label — 'indicative' for Alpaca (not OPRA), 'cboe-delayed', etc. */
    chainFeed?: string;
    /** Open-interest as-of date (Alpaca: lags 1–2 sessions). */
    openInterestDate?: string | null;
    /** Share of gross GEX on contracts excluded from the zero-gamma sweep (no feed IV). */
    profileExcludedGrossShare?: number;
    /** Share of aggregated contracts whose greeks were computed on the DEFAULT_IV fallback. */
    ivFallbackShare?: number;
    /** Share of aggregated contracts whose gamma/delta were computed by Black-Scholes here (not feed-supplied). */
    bsComputedShare?: number;
    /** The fixed Black-Scholes assumptions those computed greeks used. */
    bsAssumptions?: ExposureSnapshot['bsAssumptions'];
  };
  strikeExpiryMatrix?: StrikeExpiryCell[];
}

// ─── Options Fetch Cascade ─────────────────────────────────

type OptionsSource = 'alpaca' | 'schwab' | 'tradier' | 'yahoo' | 'cboe' | 'mixed' | 'none';
type OptionsFetchResult = {
  options: any[];
  source: OptionsSource;
  /** When this cascade received the chain (ms epoch) — the chain's own age, F3.5. */
  fetchedAt: number;
  openInterestDate?: string | null;
};

async function fetchOptionsChain(
  symbol: string,
  expiration?: string,
): Promise<OptionsFetchResult> {
  // 1. Alpaca (indicative feed, greeks + IV + OI; throttled process-wide)
  if (isAlpacaOptionsConfigured()) {
    try {
      const chain = await getAlpacaOptionsChain(symbol, expiration ? { expiration } : {});
      if (chain && chain.contracts.length > 0) {
        return { options: alpacaToTradierShape(chain, expiration), source: 'alpaca', fetchedAt: chain.fetchedAt, openInterestDate: chain.openInterestDate };
      }
    } catch (e: any) {
      logger.warn(`[GEX] Alpaca chain failed for ${symbol}: ${e.message}`);
    }
  }

  // 2. Schwab (real-time, when the operator has configured it)
  if (isSchwabConfigured()) {
    try {
      const schwab = await getSchwabOptionsChain(symbol, expiration);
      if (schwab.length > 0) {
        return { options: schwab, source: 'schwab', fetchedAt: Date.now() };
      }
    } catch (e: any) {
      logger.warn(`[GEX] Schwab chain failed for ${symbol}: ${e.message}`);
    }
  }

  // 3. CBOE delayed (free, no key, ~15-min delay)
  try {
    const cboe = await getCBOEOptionsChain(symbol);
    if (cboe && cboe.options.length > 0) {
      // CBOE returns all expirations at once. Use the FULL strike ladder
      // (allOptions): the ±15% `options` slice drops the OTM wings that carry
      // most of the vanna — measured 2026-09-29 on BE it cut VEX by 94%.
      const all = (cboe.allOptions ?? cboe.options).filter((o: any) => (o.open_interest || 0) > 0 || (o.volume || 0) > 0);
      let filtered = all;
      if (expiration) {
        filtered = all.filter((o: any) => o.expiration_date === expiration);
      }
      if (filtered.length > 0) {
        return { options: filtered, source: 'cboe', fetchedAt: Date.now() };
      }
    }
  } catch (e: any) {
    logger.warn(`[GEX] CBOE chain failed for ${symbol}: ${e.message}`);
  }

  // 4. Yahoo (free, BS greeks, 429-prone)
  try {
    const yahoo = await getYahooOptionsChain(symbol, expiration);
    if (yahoo.length > 0) {
      return { options: yahoo, source: 'yahoo', fetchedAt: Date.now() };
    }
  } catch (e: any) {
    logger.warn(`[GEX] Yahoo chain failed for ${symbol}: ${e.message}`);
  }

  // 5. Tradier (token currently rejected — kept last so it cannot delay the rest)
  if (process.env.TRADIER_API_KEY) {
    try {
      const tradier = await getTradierOptionsChain(symbol, expiration);
      if (tradier.length > 0) {
        return { options: tradier, source: 'tradier', fetchedAt: Date.now() };
      }
    } catch (e: any) {
      logger.warn(`[GEX] Tradier chain failed for ${symbol}: ${e.message}`);
    }
  }

  return { options: [], source: 'none', fetchedAt: Date.now() };
}

async function fetchExpirationsCascade(symbol: string): Promise<string[]> {
  if (isAlpacaOptionsConfigured()) {
    try {
      const chain = await getAlpacaOptionsChain(symbol);
      if (chain && chain.expirations.length > 0) return chain.expirations;
    } catch { /* fall through */ }
  }

  if (isSchwabConfigured()) {
    try {
      const schwab = await getSchwabExpirations(symbol);
      if (schwab.length > 0) return schwab;
    } catch { /* fall through */ }
  }

  // CBOE delayed (free, no key, ~15-min delay)
  try {
    const cboeExps = await getCBOEExpirations(symbol);
    if (cboeExps.length > 0) {
      logger.info(`[GEX-AGG] Using CBOE delayed expirations for ${symbol}`);
      return cboeExps;
    }
  } catch { /* fall through */ }

  // Yahoo
  try {
    const yahooExps = await getYahooExpirations(symbol);
    if (yahooExps.length > 0) return yahooExps;
  } catch { /* fall through */ }

  // Tradier expirations (token currently rejected)
  try {
    const apiKey = process.env.TRADIER_API_KEY;
    if (apiKey) {
      const baseUrl = tradierBase();
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

  return [];
}

// ─── Snapshot → Legacy result adapter ──────────────────────

function snapshotToLegacy(
  snap: ExposureSnapshot,
  expirationLabel: string,
  source: OptionsSource,
  cq: Awaited<ReturnType<typeof getCrossValidatedQuote>>,
  chain: { fetchedAt: number; expirationsUsed: string[]; delayedFeed: boolean; feed?: string; openInterestDate?: string | null },
): GammaExposureResult {
  // Chain age + staleness verdict (F3.5). assessOptionsStaleness existed with
  // no callers; this is its first. Levels built from an old chain are old levels.
  const staleness = assessOptionsStaleness(chain.expirationsUsed, chain.fetchedAt);
  const used = snap.contractsUsed;

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
    /**
     * Emitted under BOTH names on purpose.
     *
     * The wire has always carried `totalNetGEX`, but shared/gex-types.ts
     * declares the field as `totalGEX`, so six client components read
     * `snapshot.totalGEX` and got `undefined` — with no type error, because the
     * type agreed with them and the server did not.
     *
     * The visible symptom was prism-board's `(snap.totalGEX ?? 0) >= 0`
     * evaluating `0 >= 0` on every symbol, so that panel printed "Positive
     * gamma — dealer hedging dampens moves" for SPY at −4.5B, directly beneath
     * a split reading 77% puts and beside a chip reading negative_gamma.
     *
     * Renaming either side alone breaks the other, so both are sent. The type
     * is now true of the payload, which is what lets the compiler catch the
     * next one of these.
     */
    totalNetGEX: snap.totalGEX,
    totalGEX: snap.totalGEX,
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
    zeroGammaLevel: snap.zeroGammaLevel,
    zeroGammaCrossings: snap.zeroGammaCrossings,
    gammaProfile: snap.gammaProfile,
    callWallOI: snap.callWallOI,
    putWallOI: snap.putWallOI,
    grossGEX: snap.grossGEX,
    gexByScope: snap.gexByScope,
    unitsVersion: snap.unitsVersion,
    regime: snap.regime,
    regimeRead: snap.regimeRead,
    vexRegime: snap.vexRegime,
    strikeExpiryMatrix: snap.strikeExpiryMatrix,
    dataSource: source === 'none' ? undefined : source,
    dataQuality: {
      grade: cq.qualityGrade,
      score: cq.qualityScore,
      sourceCount: cq.sourceCount,
      spreadPct: cq.maxSpreadPct,
      isStale: cq.isStale,
      hasDisagreement: cq.hasDisagreement,
      chainFetchedAt: new Date(chain.fetchedAt).toISOString(),
      chainAgeMs: staleness.ageMs,
      chainIsFresh: staleness.isFresh,
      chainStaleReason: staleness.reason,
      chainDelayedFeed: chain.delayedFeed,
      chainFeed: chain.feed ?? (source === 'alpaca' ? 'indicative' : source === 'cboe' ? 'cboe-delayed' : source),
      openInterestDate: chain.openInterestDate ?? null,
      profileExcludedGrossShare: snap.profileExcludedGrossShare,
      ivFallbackShare: snap.ivFallbackShare,
      bsComputedShare: used > 0 ? snap.bsComputedCount / used : 0,
      bsAssumptions: snap.bsAssumptions,
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
    const { options, source, fetchedAt, openInterestDate } = await fetchOptionsChain(symbol, expiration);
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

    return snapshotToLegacy(snap, actualExpiration, source, cq, {
      fetchedAt,
      expirationsUsed: [actualExpiration],
      delayedFeed: source === 'cboe',
      openInterestDate,
    });
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

    // 1.25 — Alpaca full chain (indicative feed): every expiry ≤180d, strikes ±40%,
    // greeks + IV + OI in a handful of paginated calls instead of 30 per-expiry fetches.
    if (isAlpacaOptionsConfigured()) {
      try {
        const chain = await getAlpacaOptionsChain(symbol);
        if (chain && chain.contracts.length >= 10) {
          const inputs: OptionInput[] = [];
          for (const opt of alpacaToTradierShape(chain)) {
            const input = optionToInput(opt, opt.expiration_date);
            if (input) inputs.push(input);
          }
          if (inputs.length >= 10) {
            const snap = computeExposures(symbol, cq.bestPrice, inputs, chain.expirations);
            return snapshotToLegacy(snap, `Aggregate (${chain.expirations.length} exp · Alpaca indicative)`, 'alpaca', cq, {
              fetchedAt: chain.fetchedAt,
              expirationsUsed: chain.expirations,
              delayedFeed: false,
              feed: 'indicative',
              openInterestDate: chain.openInterestDate,
            });
          }
        }
      } catch (e: any) {
        logger.warn(`[GEX-AGG] ${symbol}: Alpaca chain unusable — ${e?.message ?? e}`);
      }
    }

    // 1.5 — Massive chain snapshot: the whole chain (greeks, IV, OI, volume)
    // in one OPRA-fed call. Entitlement-gated: silently unavailable until the
    // operator's Options Starter subscription activates, at which point this
    // becomes the primary leg and the per-expiry fetch storm below becomes
    // the fallback. See server/massive-options.ts.
    try {
      const { getMassiveChainInputs } = await import('./massive-options');
      const massiveInputs = await getMassiveChainInputs(symbol);
      const massiveFetchedAt = Date.now();
      if (massiveInputs && massiveInputs.length >= 10) {
        const snap = computeExposures(symbol, cq.bestPrice, massiveInputs, ['massive-chain']);
        logger.info(`[GEX-AGG] ${symbol}: Massive chain snapshot — ${massiveInputs.length} contracts, one call`);
        return snapshotToLegacy(snap, `Aggregate (massive chain)`, 'mixed', cq, {
          fetchedAt: massiveFetchedAt,
          expirationsUsed: ['massive-chain'],
          delayedFeed: false,
        });
      }
    } catch { /* fall through to the cascade */ }

    // 1.75 — CBOE delayed full chain in ONE fetch (every listed expiry, full
    // strike ladder). The per-expiry loop below capped at 30 expiries and 30
    // cascade calls; CBOE already returns the whole book in one payload.
    try {
      const cboe = await getCBOEOptionsChain(symbol);
      if (cboe && (cboe.allOptions ?? cboe.options).length > 0) {
        const fetchedAt = Date.now();
        const inputs: OptionInput[] = [];
        for (const opt of cboe.allOptions ?? cboe.options) {
          if (!((opt.open_interest || 0) > 0 || (opt.volume || 0) > 0)) continue;
          const input = optionToInput(opt, opt.expiration_date);
          if (input) inputs.push(input);
        }
        if (inputs.length >= 10) {
          const exps = cboe.expirations.filter((e) => Date.parse(`${e}T21:00:00Z`) > Date.now() - 6 * 3600_000);
          const snap = computeExposures(symbol, cq.bestPrice, inputs, exps);
          return snapshotToLegacy(snap, `Aggregate (${exps.length} exp · CBOE delayed)`, 'cboe', cq, {
            fetchedAt,
            expirationsUsed: exps,
            delayedFeed: true,
            feed: 'cboe-delayed',
          });
        }
      }
    } catch (e: any) {
      logger.warn(`[GEX-AGG] ${symbol}: CBOE full chain unusable — ${e?.message ?? e}`);
    }

    // 2. Get expirations
    const allExps = await fetchExpirationsCascade(symbol);
    if (allExps.length === 0) {
      logger.warn(`[GEX-AGG] No expirations found for ${symbol}`);
      return null;
    }

    // Fetch a wide window with a hard cap — uncapping fires too many parallel
    // requests per symbol and Tradier rate-limits the entire scan to zero.
    // 30 expiries gives ~3 months for daily-expiry symbols; for the LEAPS view
    // the dedicated buckets/CBOE-fallback endpoint pulls the full chain.
    const nearExps = allExps.slice(0, 30);

    // 3. Fetch in chunks (concurrency limit) with cascade — keeps under rate-limit
    const CHUNK = 6;
    const chainResults: Awaited<ReturnType<typeof fetchOptionsChain>>[] = [];
    for (let i = 0; i < nearExps.length; i += CHUNK) {
      const slice = nearExps.slice(i, i + CHUNK);
      const part = await Promise.all(slice.map((exp) => fetchOptionsChain(symbol, exp)));
      chainResults.push(...part);
    }

    // 4. Collect all inputs
    const allInputs: OptionInput[] = [];
    const expsUsed: string[] = [];
    const sourcesUsed = new Set<string>();
    // Oldest leg governs the aggregate's chain age — the book is only as fresh as its stalest expiry.
    let oldestChainFetchedAt = Number.POSITIVE_INFINITY;
    let oiDate: string | null = null;
    for (let i = 0; i < chainResults.length; i++) {
      const { options, source, fetchedAt, openInterestDate } = chainResults[i];
      if (openInterestDate && (!oiDate || openInterestDate < oiDate)) oiDate = openInterestDate;
      if (options.length === 0) continue;
      expsUsed.push(nearExps[i]);
      sourcesUsed.add(source);
      if (fetchedAt < oldestChainFetchedAt) oldestChainFetchedAt = fetchedAt;
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
    return snapshotToLegacy(snap, legacyExp, mixedSource, cq, {
      fetchedAt: oldestChainFetchedAt,
      expirationsUsed: expsUsed,
      delayedFeed: sourcesUsed.has('cboe'),
      openInterestDate: oiDate,
    });
  } catch (error: any) {
    logger.error(`[GEX] Aggregate calculation error for ${symbol}: ${error?.message || error}`);
    return null;
  }
}
