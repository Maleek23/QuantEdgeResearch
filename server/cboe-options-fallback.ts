/**
 * CBOE Delayed Options Fallback
 * ==============================
 * Free delayed options chain data from CBOE's public API.
 * No API key required. Data is 15-min delayed during market hours.
 *
 * Used as a last-resort fallback when both Tradier and Yahoo fail.
 * Returns TradierOption-compatible format so GEX/VEX calculators work unchanged.
 */

import { logger } from './logger';

interface CBOEOption {
  option: string;         // OCC symbol
  bid: number;
  ask: number;
  last_sale_price: number;
  volume: number;
  open_interest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  strike: number;
  expiration_date: string; // "2026-04-18"
  option_type: string;     // "Call" | "Put"
}

interface CBOEQuote {
  current_price: number;
  prev_day_close: number;
  change: number;
  change_percent: number;
}

// ─── CBOE Delayed API ────────────────────────────────────────

/**
 * CBOE ships contract details ONLY inside the OCC symbol — there are no strike /
 * expiration_date / option_type fields on the option objects. Parse them out.
 *   NVDA260819C00110000 -> { root: NVDA, expiration: 2026-08-19, type: call, strike: 110 }
 */
export function parseOccSymbol(occ: string): { root: string; expirationDate: string; optionType: 'call' | 'put'; strike: number } | null {
  const m = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/.exec((occ || '').trim().toUpperCase());
  if (!m) return null;
  const [, root, yymmdd, cp, strike8] = m;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = 2000 + yy;
  const month = Number(mm), day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    root,
    expirationDate: `${year}-${mm}-${dd}`,
    optionType: cp === 'C' ? 'call' : 'put',
    strike: Number(strike8) / 1000,
  };
}

/**
 * In-flight coalescing + a short TTL cache.
 *
 * The boot scanners were requesting the SAME symbol from several call sites at once —
 * the logs showed PLTR fetched four times and 429'd three times inside one second. CBOE
 * then rate-limited us, every retry queued, and unrelated endpoints (convictions) stalled
 * behind the storm. Concurrent callers for a symbol now share ONE request, and repeat
 * calls inside the TTL are served from memory. Chains are delayed data; a short cache
 * costs nothing in accuracy.
 */
const _cboeInflight = new Map<string, Promise<any>>();
const _cboeCache = new Map<string, { data: any; expiresAt: number }>();
const CBOE_TTL_MS = 60_000;

export async function getCBOEOptionsChain(symbol: string): Promise<{
  options: any[];
  spotPrice: number;
  expirations: string[];
  source: 'cboe';
} | null> {
  const key = symbol.toUpperCase();
  const now = Date.now();

  const cached = _cboeCache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  const inflight = _cboeInflight.get(key);
  if (inflight) return inflight;

  const p = _fetchCBOEOptionsChain(symbol)
    .then((data) => {
      _cboeCache.set(key, { data, expiresAt: Date.now() + CBOE_TTL_MS });
      if (_cboeCache.size > 300) {
        const oldest = Array.from(_cboeCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
        if (oldest) _cboeCache.delete(oldest[0]);
      }
      return data;
    })
    .finally(() => { _cboeInflight.delete(key); });

  _cboeInflight.set(key, p);
  return p;
}

async function _fetchCBOEOptionsChain(symbol: string): Promise<{
  options: any[];
  spotPrice: number;
  expirations: string[];
  source: 'cboe';
} | null> {
  try {
    // CBOE serves delayed quotes via their market data API
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol.toUpperCase()}.json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      logger.warn(`[CBOE-OPT] API ${res.status} for ${symbol}`);
      return null;
    }

    const data = await res.json();
    // CBOE moved the underlying quote fields up one level: they used to live on
    // data.quote, and now sit directly on data. Accept BOTH shapes — reading only the
    // old path silently returned null here, which killed every Tradier fallback that
    // depends on this (options-flow ingestion and GEX included).
    const payload = data?.data ?? {};
    const quote: Partial<CBOEQuote> = payload.quote ?? payload;
    const rawOptions: CBOEOption[] = payload.options || [];

    if (rawOptions.length === 0) {
      logger.warn(`[CBOE-OPT] No options returned for ${symbol}`);
      return null;
    }

    const spotPrice = Number(quote?.current_price ?? quote?.prev_day_close ?? 0);
    if (!spotPrice || spotPrice <= 0) {
      logger.warn(`[CBOE-OPT] No usable spot price for ${symbol}`);
      return null;
    }

    // Decode each contract from its OCC symbol (CBOE sends no strike/expiry/type fields)
    const decoded = rawOptions
      .map((opt: any) => ({ opt, occ: parseOccSymbol(opt.option) }))
      .filter((d): d is { opt: any; occ: NonNullable<ReturnType<typeof parseOccSymbol>> } => d.occ !== null);

    if (decoded.length === 0) {
      logger.warn(`[CBOE-OPT] Could not decode any OCC symbols for ${symbol}`);
      return null;
    }

    // Collect unique expirations
    const expirationSet = new Set<string>();
    for (const d of decoded) expirationSet.add(d.occ.expirationDate);
    const expirations = Array.from(expirationSet).sort();

    // Convert to Tradier-compatible format
    // Filter to strikes within ~15% of spot
    const lowerBound = spotPrice * 0.85;
    const upperBound = spotPrice * 1.15;

    const options = decoded
      .filter(({ occ }) => occ.strike >= lowerBound && occ.strike <= upperBound)
      .filter(({ opt }) => (opt.open_interest || 0) > 0 || (opt.volume || 0) > 0)
      .map(({ opt, occ }) => ({
        symbol: opt.option,
        description: `${symbol} ${occ.expirationDate} ${occ.strike} ${occ.optionType}`,
        exch: 'CBOE',
        type: occ.optionType,
        last: opt.last_trade_price || opt.theo || 0,
        change: opt.change || 0,
        volume: opt.volume || 0,
        open: opt.open || 0,
        high: opt.high || 0,
        low: opt.low || 0,
        close: opt.last_trade_price || 0,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        underlying: symbol,
        strike: occ.strike,
        greeks: {
          delta: opt.delta || 0,
          gamma: opt.gamma || 0,
          theta: opt.theta || 0,
          vega: opt.vega || 0,
          rho: opt.rho || 0,
          phi: 0,
          bid_iv: opt.iv || 0,
          mid_iv: opt.iv || 0,
          ask_iv: opt.iv || 0,
          smv_vol: opt.iv || 0,
          updated_at: new Date().toISOString(),
        },
        change_percentage: opt.percent_change || 0,
        average_volume: opt.volume || 0,
        last_volume: opt.volume || 0,
        trade_date: Date.now(),
        prevclose: opt.prev_day_close || 0,
        week_52_high: 0,
        week_52_low: 0,
        bidsize: opt.bid_size || 0,
        bidexch: 'CBOE',
        bid_date: Date.now(),
        asksize: opt.ask_size || 0,
        askexch: 'CBOE',
        ask_date: Date.now(),
        open_interest: opt.open_interest || 0,
        contract_size: 100,
        expiration_date: occ.expirationDate,
        expiration_type: 'standard',
        option_type: occ.optionType,
        root_symbol: symbol,
      }));

    logger.info(`[CBOE-OPT] ${symbol}: ${options.length} options across ${expirations.length} expirations, spot=$${spotPrice.toFixed(2)}`);

    return { options, spotPrice, expirations, source: 'cboe' };
  } catch (e: any) {
    logger.warn(`[CBOE-OPT] Error for ${symbol}: ${e.message}`);
    return null;
  }
}

/**
 * Get expirations from CBOE delayed data
 */
export async function getCBOEExpirations(symbol: string): Promise<string[]> {
  try {
    const result = await getCBOEOptionsChain(symbol);
    return result?.expirations || [];
  } catch {
    return [];
  }
}

logger.info('[CBOE-OPT] CBOE delayed options fallback loaded');
