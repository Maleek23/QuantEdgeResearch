/**
 * IV / GREEK GAP-FILL — so an illiquid strike is a modelled strike, not a hole.
 * ============================================================================
 * Pure functions, no imports beyond shared/gex-math. Safe on server and client.
 *
 * WHY (measured 2026-09-29): Alpaca's indicative option snapshots return no
 * greeks and no impliedVolatility for contracts it has not priced — SPY exp
 * 2026-09-30, strikes 730–800: 33 of 142 contracts bare; exp 10-02: 12 of 142.
 * Downstream those contracts either contributed zero gamma (the cross-ticker
 * rankings: gamma 0, iv 0 → GEX 0) or were re-priced on a flat 30% DEFAULT_IV
 * (the exposure hub) and left out of the zero-gamma sweep — gaps in the strike
 * ladder and matrix, and a smile-blind gamma where they did appear.
 *
 * WHAT: for every contract without a provider IV/gamma, in this order
 *   1. implied-from-price — invert Black-Scholes on the quote mid (bid/ask both
 *      > 0 and the spread ≤ 60% of mid) or, failing that, a recent last trade.
 *      The inverted IV must carry time value (no inversion on pure intrinsic)
 *      and must sit within ×3 of the provider smile at that strike when the
 *      expiry has one — otherwise the quote is treated as stale/bad.
 *   2. smile-interpolated — linear in log-moneyness ln(K/S) between the nearest
 *      strikes of the SAME expiry that have an IV (provider or implied, OTM side
 *      preferred), flat at the wings.
 *   3. none — expiry has no IV anywhere; left for the caller's disclosed fallback.
 * Gamma and delta are then Black-Scholes on that IV (vanna/charm are computed
 * downstream from the same IV). Open interest is NEVER touched — it comes from
 * the contracts endpoint or not at all.
 *
 * Every contract carries `greekSource`, and the caller reports the shares, so
 * no surface can present a modelled gamma as a quoted one.
 */

import { bsGamma, normCdf, expiryInstantMs, YEAR_MS, MIN_T_YEARS } from './gex-math';

export type GreekSource = 'provider' | 'implied-from-price' | 'smile-interpolated' | 'none';

export interface FillableContract {
  expiration: string;          // YYYY-MM-DD
  strike: number;
  type: 'call' | 'put';
  iv: number | null;
  gamma: number | null;
  delta: number | null;
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** ISO time of the last trade — a last price older than maxLastAgeMs is not used. */
  lastTime?: string | null;
  greekSource?: GreekSource;
}

export interface GreekSourceCounts {
  provider: number;
  impliedFromPrice: number;
  smileInterpolated: number;
  none: number;
}

export interface FillResult {
  counts: GreekSourceCounts;
  /** (implied + smile) / all contracts — the share of greeks we modelled. */
  modelledShare: number;
}

export interface FillOptions {
  r?: number;
  q?: number;
  now?: number;
  /** Max relative spread (ask−bid)/mid for a quote mid to be inverted. Default 0.6. */
  maxRelSpread?: number;
  /** Max age of a last trade to invert. Default 3 days (covers a weekend). */
  maxLastAgeMs?: number;
}

// ─── Black-Scholes price / delta / inversion ─────────────────────────────

export function bsPrice(S: number, K: number, T: number, v: number, isCall: boolean, r = 0, q = 0): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return NaN;
  const sq = v * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / sq;
  const d2 = d1 - sq;
  const dfq = Math.exp(-q * T); const dfr = Math.exp(-r * T);
  return isCall
    ? S * dfq * normCdf(d1) - K * dfr * normCdf(d2)
    : K * dfr * normCdf(-d2) - S * dfq * normCdf(-d1);
}

export function bsDelta(S: number, K: number, T: number, v: number, isCall: boolean, r = 0, q = 0): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return NaN;
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * Math.sqrt(T));
  const dfq = Math.exp(-q * T);
  return isCall ? dfq * normCdf(d1) : dfq * (normCdf(d1) - 1);
}

/**
 * Implied vol by bisection on [0.01, 5.0]. Returns null when the price has no
 * time value over the no-arbitrage floor (IV unidentifiable) or breaches the cap.
 */
export function impliedVol(price: number, S: number, K: number, T: number, isCall: boolean, r = 0, q = 0): number | null {
  if (!(price > 0 && S > 0 && K > 0 && T > 0)) return null;
  const dfr = Math.exp(-r * T); const dfq = Math.exp(-q * T);
  const floor = isCall ? Math.max(0, S * dfq - K * dfr) : Math.max(0, K * dfr - S * dfq);
  const cap = isCall ? S * dfq : K * dfr;
  // Require at least a cent (and 0.5% of the price) of time value — below that
  // the inversion is fitting rounding, not a volatility.
  if (price - floor < Math.max(0.01, price * 0.005) || price >= cap) return null;
  let lo = 0.01; let hi = 5.0;
  const pLo = bsPrice(S, K, T, lo, isCall, r, q); const pHi = bsPrice(S, K, T, hi, isCall, r, q);
  if (!(price >= pLo && price <= pHi)) return null;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (bsPrice(S, K, T, mid, isCall, r, q) > price) hi = mid; else lo = mid;
    if (hi - lo < 1e-5) break;
  }
  return 0.5 * (lo + hi);
}

// ─── Smile ────────────────────────────────────────────────────────────────

interface SmilePoint { x: number; iv: number }

/** Linear in x = ln(K/S) between the bracketing points; flat beyond the ends. */
export function interpSmile(points: SmilePoint[], x: number): number | null {
  if (!points.length) return null;
  if (x <= points[0].x) return points[0].iv;
  const last = points[points.length - 1];
  if (x >= last.x) return last.iv;
  let lo = 0; let hi = points.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (points[m].x <= x) lo = m; else hi = m;
  }
  const a = points[lo]; const b = points[hi];
  if (b.x === a.x) return a.iv;
  return a.iv + ((b.iv - a.iv) * (x - a.x)) / (b.x - a.x);
}

/**
 * One smile per expiry from the contracts that already have an IV. At each
 * strike the OTM leg is preferred (call at/above spot, put below) — OTM quotes
 * carry the time value the IV is identified from; the other leg is used only
 * when the OTM one is missing.
 */
function buildSmile(rows: FillableContract[], S: number, accept: (c: FillableContract) => boolean): SmilePoint[] {
  const byStrike = new Map<number, { call?: number; put?: number }>();
  for (const c of rows) {
    if (!(c.iv != null && c.iv > 0) || !accept(c)) continue;
    const e = byStrike.get(c.strike) ?? {};
    if (c.type === 'call') e.call = c.iv; else e.put = c.iv;
    byStrike.set(c.strike, e);
  }
  const pts: SmilePoint[] = [];
  for (const [K, e] of byStrike) {
    const iv = K >= S ? (e.call ?? e.put) : (e.put ?? e.call);
    if (iv != null && iv > 0) pts.push({ x: Math.log(K / S), iv });
  }
  return pts.sort((a, b) => a.x - b.x);
}

// ─── Main ─────────────────────────────────────────────────────────────────

const hasProvider = (c: FillableContract) =>
  c.iv != null && c.iv > 0 && c.gamma != null && Number.isFinite(c.gamma) && c.gamma > 0;

/**
 * Fill IV / gamma / delta in place for contracts the provider left bare, and
 * stamp `greekSource` on every contract. Returns the per-source counts.
 */
export function fillMissingGreeks(contracts: FillableContract[], spot: number, opts: FillOptions = {}): FillResult {
  const r = opts.r ?? 0; const q = opts.q ?? 0;
  const now = opts.now ?? Date.now();
  const maxRel = opts.maxRelSpread ?? 0.6;
  const maxLastAge = opts.maxLastAgeMs ?? 3 * 864e5;
  const counts: GreekSourceCounts = { provider: 0, impliedFromPrice: 0, smileInterpolated: 0, none: 0 };
  if (!(spot > 0)) {
    for (const c of contracts) {
      c.greekSource = hasProvider(c) ? 'provider' : 'none';
      if (c.greekSource === 'provider') counts.provider++; else counts.none++;
    }
    return { counts, modelledShare: 0 };
  }

  const byExp = new Map<string, FillableContract[]>();
  for (const c of contracts) {
    const list = byExp.get(c.expiration) ?? [];
    list.push(c);
    byExp.set(c.expiration, list);
  }

  for (const [exp, rows] of byExp) {
    // A contract past its 16:00 ET expiry carries no forward exposure and every
    // consumer drops it; inverting its last print on a floored T gives nonsense IVs.
    if (expiryInstantMs(exp) <= now) {
      for (const c of rows) {
        c.greekSource = hasProvider(c) ? 'provider' : 'none';
        if (c.greekSource === 'provider') counts.provider++; else counts.none++;
      }
      continue;
    }
    const T = Math.max(MIN_T_YEARS, (expiryInstantMs(exp) - now) / YEAR_MS);
    const setGreeks = (c: FillableContract, iv: number) => {
      c.iv = iv;
      const isCall = c.type === 'call';
      // Keep a provider gamma/delta when only the IV was missing (and vice versa).
      if (!(c.gamma != null && Number.isFinite(c.gamma) && c.gamma > 0)) c.gamma = bsGamma(spot, c.strike, T, iv, r, q);
      if (!(c.delta != null && Number.isFinite(c.delta) && c.delta !== 0)) c.delta = bsDelta(spot, c.strike, T, iv, isCall, r, q);
    };

    // Provider-only smile: the sanity reference for inverted quotes.
    const providerSmile = buildSmile(rows, spot, (c) => hasProvider(c));

    // Pass 1 — provider rows, and inversion of quotes for the rest.
    const pending: FillableContract[] = [];
    for (const c of rows) {
      if (hasProvider(c)) { c.greekSource = 'provider'; counts.provider++; continue; }
      // Provider IV present but gamma missing (or the reverse) — the IV is the
      // provider's; only the missing greek is Black-Scholes.
      if (c.iv != null && c.iv > 0) { setGreeks(c, c.iv); c.greekSource = 'provider'; counts.provider++; continue; }
      const isCall = c.type === 'call';
      let price: number | null = null;
      if (c.bid != null && c.ask != null && c.bid > 0 && c.ask >= c.bid) {
        const mid = (c.bid + c.ask) / 2;
        if ((c.ask - c.bid) / mid <= maxRel) price = mid;
      }
      if (price == null && c.last != null && c.last > 0) {
        const t = c.lastTime ? Date.parse(c.lastTime) : NaN;
        if (Number.isFinite(t) && now - t <= maxLastAge) price = c.last;
      }
      let iv = price != null ? impliedVol(price, spot, c.strike, T, isCall, r, q) : null;
      if (iv != null && providerSmile.length) {
        const ref = interpSmile(providerSmile, Math.log(c.strike / spot));
        if (ref != null && (iv > ref * 3 || iv < ref / 3)) iv = null; // stale / crossed quote
      }
      if (iv != null) { setGreeks(c, iv); c.greekSource = 'implied-from-price'; counts.impliedFromPrice++; }
      else pending.push(c);
    }

    // Pass 2 — the smile from everything now measured (provider + implied).
    if (pending.length) {
      const smile = buildSmile(rows, spot, (c) => c.greekSource === 'provider' || c.greekSource === 'implied-from-price');
      for (const c of pending) {
        const iv = interpSmile(smile, Math.log(c.strike / spot));
        if (iv != null && iv > 0) { setGreeks(c, iv); c.greekSource = 'smile-interpolated'; counts.smileInterpolated++; }
        else { c.greekSource = 'none'; counts.none++; }
      }
    }
  }

  const total = contracts.length;
  return { counts, modelledShare: total ? (counts.impliedFromPrice + counts.smileInterpolated) / total : 0 };
}
