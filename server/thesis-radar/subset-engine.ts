/**
 * THESIS RADAR — Subset Engine
 * ==============================
 * The filter compiler. Takes a PatternSpec, walks its filter chain, and either
 * returns a list of matching tickers (when running across the universe) or a
 * boolean for a single ticker (when checking a candidate).
 *
 * Key design decision: each filter "predicate" is a small, testable handler.
 * Patterns are declarative (data) — only the engine knows HOW to evaluate them.
 * That means we can add a new pattern in pure data without touching engine code.
 *
 * Predicate handlers map to existing analyzers:
 *   - cap.lt / cap.between          → tradier-api / yahoo for market cap
 *   - sector.in_layers              → shared/layer-taxonomy
 *   - options_flow.call_volume_spike → server/options-flow-scanner
 *   - options_flow.oi_concentration → server/options-exposures
 *   - news.hyperscaler_mention      → server/news-options-pipeline
 *   - iv.iv_percentile_low          → server/options-quant
 *
 * For v1, the engine is wired with STUB resolvers that return the data shape
 * the conviction-agent expects. Each stub is clearly marked TODO with the
 * upstream module to call. This unblocks the full pipeline (scan → grade →
 * persist → push) BEFORE every analyzer is integrated.
 *
 * Wiring an analyzer = replacing one stub with the real call. Each replacement
 * is a separate PR that doesn't risk the rest of the pipeline.
 */

import { logger } from '../logger';
import type { PatternFilter, PatternSpec } from '@shared/thesis-radar-types';
import { getAllApprovedSymbols } from '@shared/approved-tickers';
import { LAYERS, type CapTier, type DerivativeOrder } from '@shared/layer-taxonomy';
import { getSymbolFlowHistory } from '../options-flow-scanner';

// Cap tier → numeric upper bound (USD). Used so cap.lt / cap.between filters
// can run without hitting the market-cap API for every ticker on every scan.
const CAP_TIER_NUMERIC: Record<CapTier, number> = {
  mega: 200_000_000_000,
  large: 50_000_000_000,
  mid: 5_000_000_000,
  small: 1_500_000_000,
  micro: 300_000_000,
};

// Build a fast lookup of layer + derivative metadata per symbol once at module load.
// Re-built only when the layer-taxonomy module hot-reloads.
const _layerLookup: Map<string, { layerId: string; derivativeOrder: DerivativeOrder; cap: CapTier }> =
  (() => {
    const m = new Map<string, { layerId: string; derivativeOrder: DerivativeOrder; cap: CapTier }>();
    for (const layer of LAYERS) {
      for (const t of layer.tickers) {
        m.set(t.symbol, { layerId: layer.id, derivativeOrder: layer.derivativeOrder, cap: t.cap });
      }
    }
    return m;
  })();

// ─── Universe loader ────────────────────────────────────────────────

export interface UniverseTicker {
  symbol: string;
  spot: number;
  marketCap: number;
  sector?: string;
  layerId?: string;
  derivativeOrder?: number;
}

/**
 * Load the universe of tickers to scan against.
 * Union of approved-tickers + layer-taxonomy. Each ticker enriched with
 * layer + derivative-order + cap-tier metadata so filters can run without
 * extra round-trips.
 *
 * Spot is left as 0 — fetchTickerData will hydrate it lazily from CBOE
 * if a filter actually needs it (price.not_extended, options_flow filters).
 */
export async function loadUniverse(): Promise<UniverseTicker[]> {
  const approved = getAllApprovedSymbols();
  const universe: UniverseTicker[] = [];
  const seen = new Set<string>();

  // 1) Symbols that are in BOTH approved-tickers AND layer-taxonomy → enriched
  for (const sym of approved) {
    if (seen.has(sym)) continue;
    seen.add(sym);
    const meta = _layerLookup.get(sym);
    if (meta) {
      universe.push({
        symbol: sym,
        spot: 0,
        marketCap: CAP_TIER_NUMERIC[meta.cap],
        layerId: meta.layerId,
        derivativeOrder: meta.derivativeOrder,
      });
    } else {
      // Approved but un-classified — still scannable, just without layer context
      universe.push({
        symbol: sym,
        spot: 0,
        marketCap: CAP_TIER_NUMERIC.large, // conservative default
      });
    }
  }

  // 2) Layer-only symbols not in approved-tickers (e.g. small-caps in MCU layer)
  _layerLookup.forEach((meta, sym) => {
    if (seen.has(sym)) return;
    seen.add(sym);
    universe.push({
      symbol: sym,
      spot: 0,
      marketCap: CAP_TIER_NUMERIC[meta.cap as CapTier],
      layerId: meta.layerId,
      derivativeOrder: meta.derivativeOrder,
    });
  });

  logger.info(
    `[SUBSET] loadUniverse(): ${universe.length} tickers (approved=${approved.length}, layer-classified=${_layerLookup.size})`,
  );
  return universe;
}

// ─── Filter evaluation ──────────────────────────────────────────────

export interface FilterEvalContext {
  ticker: UniverseTicker;
  /** Pre-fetched data bundle so each filter doesn't re-hit the DB/API */
  fetched: Record<string, unknown>;
}

export type PredicateHandler = (
  filter: PatternFilter,
  ctx: FilterEvalContext,
) => Promise<boolean> | boolean;

const PREDICATE_REGISTRY: Record<string, PredicateHandler> = {
  // ─── Cap predicates ──────────────────────────────────
  'cap.lt': (f, ctx) => ctx.ticker.marketCap < (f.params?.value as number),
  'cap.between': (f, ctx) =>
    ctx.ticker.marketCap >= (f.params?.min as number) &&
    ctx.ticker.marketCap <= (f.params?.max as number),

  // ─── Sector / layer predicates ───────────────────────
  'sector.in_layers': (f, ctx) => {
    const layers = ((f.params?.layers as string) ?? '').split(',').map(s => s.trim());
    return layers.includes(ctx.ticker.layerId ?? '');
  },
  'sector.first_order_layer_up': async (_f, _ctx) => {
    // TODO: check rotation engine output for first-order layer momentum
    return true;
  },
  'sector.derivative_layer_flat': async (_f, ctx) => {
    // TODO: check that ticker's layer (>= derivative_order param) is flat
    const minOrder = (_f.params?.layer_min_derivative_order as number) ?? 2;
    return (ctx.ticker.derivativeOrder ?? 1) >= minOrder;
  },

  // ─── Options flow predicates ─────────────────────────
  'options_flow.call_volume_spike': async (f, ctx) => {
    const data = ctx.fetched.optionsFlow as { callVolMultiplier?: number } | undefined;
    const mult = data?.callVolMultiplier ?? 1;
    return mult >= ((f.params?.multiplier as number) ?? 3);
  },
  'options_flow.oi_concentration': async (f, ctx) => {
    const data = ctx.fetched.optionsFlow as { oiConcentrationPct?: number; topStrikeOI?: number } | undefined;
    const pct = data?.oiConcentrationPct ?? 0;
    const minOI = (f.params?.min_oi as number) ?? 0;
    const minPct = (f.params?.min_oi_pct_of_total as number) ?? 0;
    if (minPct > 0 && pct < minPct) return false;
    if (minOI > 0 && (data?.topStrikeOI ?? 0) < minOI) return false;
    return true;
  },
  'options_flow.recent_sweep': async (f, ctx) => {
    const data = ctx.fetched.optionsFlow as { sweepCount?: number; sweepPremium?: number } | undefined;
    const minPremium = (f.params?.min_premium as number) ?? 0;
    return (data?.sweepPremium ?? 0) >= minPremium;
  },
  'options_flow.has_leaps': async (f, ctx) => {
    const data = ctx.fetched.options as { longestDTE?: number } | undefined;
    return (data?.longestDTE ?? 0) >= ((f.params?.min_dte as number) ?? 200);
  },

  // ─── News predicates ─────────────────────────────────
  'news.hyperscaler_mention_recent': async (f, ctx) => {
    const data = ctx.fetched.news as { hyperscalerMentions?: number } | undefined;
    return (data?.hyperscalerMentions ?? 0) >= 1;
  },
  'news.transcript_keyword_cluster': async (f, ctx) => {
    const data = ctx.fetched.news as { bottleneckCluster?: number } | undefined;
    return (data?.bottleneckCluster ?? 0) >= ((f.params?.min_company_mentions as number) ?? 3);
  },
  'news.transcript_supplier_named': async (f, ctx) => {
    const data = ctx.fetched.news as { hyperscalerMentions?: number } | undefined;
    return (data?.hyperscalerMentions ?? 0) >= ((f.params?.min_hyperscaler_mentions as number) ?? 2);
  },
  'news.scheduled_catalyst_within': async (f, ctx) => {
    const data = ctx.fetched.news as { catalystWithinDays?: number } | undefined;
    if (data?.catalystWithinDays == null) return false;
    return data.catalystWithinDays <= ((f.params?.max_days as number) ?? 30) && data.catalystWithinDays >= 0;
  },

  // ─── IV predicates ───────────────────────────────────
  'iv.iv_percentile_low': async (f, ctx) => {
    const data = ctx.fetched.iv as { ivPercentile?: number } | undefined;
    return (data?.ivPercentile ?? 100) <= ((f.params?.max_percentile as number) ?? 30);
  },
  'iv.iv_term_structure_steep': async (f, ctx) => {
    const data = ctx.fetched.iv as { termStructureRatio?: number } | undefined;
    return (data?.termStructureRatio ?? 1) >= ((f.params?.min_front_back_ratio as number) ?? 1.3);
  },

  // ─── Analyst predicates ──────────────────────────────
  'analysts.coverage_increasing': async (f, ctx) => {
    const data = ctx.fetched.analysts as { newInitiations90d?: number } | undefined;
    return (data?.newInitiations90d ?? 0) >= ((f.params?.min_new_initiations_90d as number) ?? 2);
  },

  // ─── Fundamentals predicates ─────────────────────────
  'fundamentals.recent_13f_buy': async (f, ctx) => {
    const data = ctx.fetched.institutional as { recent13fBuyShares?: number } | undefined;
    return (data?.recent13fBuyShares ?? 0) >= ((f.params?.min_share_count as number) ?? 1_000_000);
  },
  'fundamentals.recent_form4_buy': async (f, ctx) => {
    const data = ctx.fetched.institutional as { insiderBuys90dDollars?: number } | undefined;
    return (data?.insiderBuys90dDollars ?? 0) >= ((f.params?.min_dollar_value as number) ?? 100_000);
  },

  // ─── Price predicates ────────────────────────────────
  'price.not_extended': async (f, ctx) => {
    const data = ctx.fetched.priceAction as { pctFrom50DMA?: number } | undefined;
    return (data?.pctFrom50DMA ?? 0) <= ((f.params?.max_pct_above_50d_ma as number) ?? 15);
  },
};

// ─── Data fetcher ───────────────────────────────────────────────────

/**
 * Pre-fetch all data needed for a ticker before evaluating filters.
 * Avoids N+1 round trips during scan.
 *
 * v1.1 wiring status:
 *   ✅ optionsFlow   → server/options-flow-scanner.getSymbolFlowHistory
 *   ⏳ news          → STUB (next: server/news-options-pipeline)
 *   ⏳ iv            → STUB (next: server/options-quant)
 *   ⏳ priceAction   → STUB (next: server/chart-analysis)
 *   ⏳ institutional → STUB (next: SEC 13F + Form 4 services)
 *   ⏳ analysts      → STUB (next: server/analyst-data-service)
 *
 * The wired sections produce real data. Stubs return undefined — predicate
 * handlers tolerate that and the conviction agent skips graders with no input.
 */
export async function fetchTickerData(symbol: string): Promise<Record<string, unknown>> {
  const fetched: Record<string, unknown> = {
    optionsFlow: await fetchOptionsFlowSnapshot(symbol),
    options: { longestDTE: undefined }, // TODO: tradier expiration endpoint
    news: { hyperscalerMentions: undefined, sentimentScore: undefined, catalystWithinDays: undefined, bottleneckCluster: undefined },
    iv: { ivPercentile: undefined, termStructureRatio: undefined },
    analysts: { newInitiations90d: undefined, consensusUpside: undefined },
    institutional: { recent13fBuyShares: undefined, insiderBuys90dDollars: undefined, whaleNames: [] },
    priceAction: { aboveSMA20: undefined, aboveEMA20: undefined, rsi14: undefined, pctFrom50DMA: undefined, macdBullishCross: undefined },
  };

  return fetched;
}

// ─── Options-flow snapshot (real wiring, v1.1) ──────────────────────

/**
 * Compute the options-flow signal bundle for a single ticker from the
 * persisted flow-history table. Uses the last 30 days of detected flows:
 *   - callVolMultiplier  = today's call volume / 30d avg call volume
 *   - oiConcentrationPct = top-strike OI / total OI (uses recent flows as proxy)
 *   - topStrikeOI        = OI on the most-loaded strike
 *   - sweepCount         = # sweep flows in last 5 days
 *   - sweepPremium       = total premium of sweeps in last 5 days
 *   - putCallRatio       = put volume / call volume (last 5 days)
 *
 * Returns undefined fields when there's not enough history — the conviction
 * agent treats those signals as "not applicable" rather than zeroing them.
 */
async function fetchOptionsFlowSnapshot(symbol: string): Promise<{
  callVolMultiplier?: number;
  oiConcentrationPct?: number;
  topStrikeOI?: number;
  sweepCount?: number;
  sweepPremium?: number;
  putCallRatio?: number;
}> {
  try {
    const flows = (await getSymbolFlowHistory(symbol, 30)) as Array<{
      symbol?: string;
      optionType?: string;
      strikePrice?: number | string;
      volume?: number | string;
      openInterest?: number | string;
      premium?: number | string;
      flowType?: string;
      detectedDate?: string;
      detectedAt?: string;
    }>;
    if (!flows || flows.length === 0) return {};

    const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
    const today = new Date().toISOString().split('T')[0];
    const fiveDaysAgoMs = Date.now() - 5 * 24 * 60 * 60 * 1000;

    // Today's call volume (for multiplier numerator)
    const todaysCallVol = flows
      .filter(f => f.detectedDate === today && f.optionType === 'call')
      .reduce((sum, f) => sum + num(f.volume), 0);

    // Per-day call volume across history (for multiplier denominator)
    const callsByDay = new Map<string, number>();
    for (const f of flows) {
      if (f.optionType !== 'call') continue;
      const day = f.detectedDate ?? '';
      callsByDay.set(day, (callsByDay.get(day) ?? 0) + num(f.volume));
    }
    const dayVolumes = Array.from(callsByDay.values()).filter(v => v > 0);
    const avgDailyCallVol = dayVolumes.length > 0
      ? dayVolumes.reduce((a, b) => a + b, 0) / dayVolumes.length
      : 0;

    const callVolMultiplier = avgDailyCallVol > 0 && todaysCallVol > 0
      ? todaysCallVol / avgDailyCallVol
      : undefined;

    // Top-strike OI concentration (from most recent 30d flows)
    const oiByStrike = new Map<number, number>();
    let totalOI = 0;
    for (const f of flows) {
      if (f.optionType !== 'call') continue;
      const strike = num(f.strikePrice);
      const oi = num(f.openInterest);
      if (strike <= 0) continue;
      oiByStrike.set(strike, Math.max(oiByStrike.get(strike) ?? 0, oi));
      totalOI += oi;
    }
    let topStrikeOI = 0;
    oiByStrike.forEach((oi) => {
      if (oi > topStrikeOI) topStrikeOI = oi;
    });
    const oiConcentrationPct = totalOI > 0 ? topStrikeOI / totalOI : undefined;

    // Sweeps in last 5 days
    const recentSweeps = flows.filter(f => {
      if (f.flowType !== 'sweep') return false;
      const t = f.detectedAt ? new Date(f.detectedAt).getTime() : 0;
      return t >= fiveDaysAgoMs;
    });
    const sweepCount = recentSweeps.length;
    const sweepPremium = recentSweeps.reduce((sum, f) => sum + num(f.premium), 0);

    // Put/call ratio (last 5 days)
    let recentCallVol = 0;
    let recentPutVol = 0;
    for (const f of flows) {
      const t = f.detectedAt ? new Date(f.detectedAt).getTime() : 0;
      if (t < fiveDaysAgoMs) continue;
      if (f.optionType === 'call') recentCallVol += num(f.volume);
      else if (f.optionType === 'put') recentPutVol += num(f.volume);
    }
    const putCallRatio = recentCallVol > 0 ? recentPutVol / recentCallVol : undefined;

    return {
      callVolMultiplier,
      oiConcentrationPct,
      topStrikeOI: topStrikeOI || undefined,
      sweepCount: sweepCount || undefined,
      sweepPremium: sweepPremium || undefined,
      putCallRatio,
    };
  } catch (e) {
    logger.warn(`[SUBSET] options-flow snapshot failed for ${symbol}: ${(e as Error).message}`);
    return {};
  }
}

// ─── Pattern evaluation ─────────────────────────────────────────────

export async function evaluatePattern(
  pattern: PatternSpec,
  ticker: UniverseTicker,
): Promise<{ matched: boolean; failedFilters: PatternFilter[]; data: Record<string, unknown> }> {
  const fetched = await fetchTickerData(ticker.symbol);
  const ctx: FilterEvalContext = { ticker, fetched };

  const failed: PatternFilter[] = [];
  for (const f of pattern.filters) {
    const key = `${f.domain}.${f.predicate}`;
    const handler = PREDICATE_REGISTRY[key];
    if (!handler) {
      logger.warn(`[SUBSET] No handler for predicate ${key} — skipping filter`);
      continue;
    }
    try {
      const ok = await handler(f, ctx);
      if (!ok) failed.push(f);
    } catch (e) {
      logger.warn(`[SUBSET] Handler ${key} threw: ${(e as Error).message}`);
      failed.push(f);
    }
  }

  return { matched: failed.length === 0, failedFilters: failed, data: fetched };
}

// ─── Scan: run a pattern across the universe ────────────────────────

export interface ScanMatch {
  ticker: UniverseTicker;
  /** Pre-fetched data bundle to pass to conviction-agent (saves a 2nd fetch) */
  data: Record<string, unknown>;
}

export async function scanPattern(pattern: PatternSpec): Promise<ScanMatch[]> {
  const universe = await loadUniverse();
  if (universe.length === 0) {
    logger.warn(`[SUBSET] Universe is empty — pattern ${pattern.id} found 0 candidates`);
    return [];
  }

  const matches: ScanMatch[] = [];
  for (const ticker of universe) {
    const result = await evaluatePattern(pattern, ticker);
    if (result.matched) {
      matches.push({ ticker, data: result.data });
    }
  }

  logger.info(
    `[SUBSET] Pattern ${pattern.id} matched ${matches.length}/${universe.length} tickers`,
  );
  return matches;
}
